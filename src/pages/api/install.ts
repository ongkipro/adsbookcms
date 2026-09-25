import type { APIRoute } from "astro";

import { getEnvValue, getRuntimeEnv } from "../../lib/env.ts";
import { secureEqual } from "../../lib/auth.ts";
import { resolveAuthSecret } from "../../lib/auth-secret.ts";
import { planInstall, runInstall } from "../../lib/install.ts";
import { readStoreIdentity } from "../../lib/tenant.ts";
import {
  checkRateLimit,
  getClientIp,
  rateLimitHeaders,
} from "../../lib/rate-limit.ts";

/** A-216: 16+ char tokens make guessing impractical, not impossible. */
const INSTALL_TOKEN_WINDOW_MS = 15 * 60 * 1000;
const INSTALL_TOKEN_LIMIT = 10;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/**
 * The one unauthenticated write in the product. Three things keep that
 * acceptable, and all three are checked here rather than assumed:
 *
 * 1. It refuses once a store row exists, so it is reachable exactly once in the
 *    life of an install.
 * 2. It writes only identity and the operator's own credential — no order,
 *    payment or provider data exists yet to expose.
 * 3. The insert itself carries `WHERE NOT EXISTS`, so two simultaneous
 *    submissions cannot both win.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database || typeof database !== "object") {
    console.error("install-no-database-binding");
    return json(
      { success: false, error: "Database belum tersambung ke Worker ini." },
      503,
    );
  }

  // Checked before anything is written, because the alternative is an operator
  // who completes the wizard and is then locked out of their own store. With
  // no AUTH_SECRET secret the Worker generates its own signing key in D1
  // (ADR-026); this only fails when that table cannot be written either.
  const authSecret = await resolveAuthSecret(getRuntimeEnv(locals), database);
  if (authSecret.length < 32) {
    console.error("install-missing-auth-secret");
    return json(
      {
        success: false,
        error:
          "Kunci sesi admin tidak dapat dibuat. Periksa bahwa migrasi database sudah berjalan, lalu muat ulang halaman ini.",
      },
      503,
    );
  }

  const identity = await readStoreIdentity(database);
  if (identity.state === "installed") {
    return json(
      { success: false, error: "Instalasi sudah pernah diselesaikan." },
      409,
    );
  }
  if (identity.state === "unknown") {
    // Refusing is right: a database we cannot read is not a database we should
    // install over.
    return json(
      { success: false, error: "Database tidak dapat dibaca. Periksa migrasi." },
      503,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ success: false, error: "Data tidak valid." }, 400);
  }

  const installToken = getEnvValue("INSTALL_TOKEN", getRuntimeEnv(locals));
  if (installToken.length < 16) {
    console.error("install-missing-setup-token");
    return json(
      {
        success: false,
        error: "INSTALL_TOKEN belum diatur (minimal 16 karakter). Atur sebagai Worker secret sebelum instalasi.",
      },
      503,
    );
  }

  const clientIp = getClientIp(request.headers);
  // Spent up front by every attempt, not only a wrong one: a peek-then-spend
  // let a parallel wave of guesses all read the same count and pass. A correct
  // token closes the installer for good, so it has no attempts left to protect.
  const tokenRateLimit = await checkRateLimit(
    database,
    `install-token:${clientIp}`,
    INSTALL_TOKEN_LIMIT,
    INSTALL_TOKEN_WINDOW_MS,
    true,
  );
  if (!tokenRateLimit.allowed) {
    return json(
      { success: false, error: "Terlalu banyak percobaan token. Coba lagi nanti." },
      429,
      rateLimitHeaders(tokenRateLimit.remaining, tokenRateLimit.resetAt),
    );
  }

  const providedInstallToken =
    typeof body.install_token === "string" ? body.install_token : "";
  if (!(await secureEqual(providedInstallToken, installToken))) {
    return json({ success: false, error: "Token instalasi tidak valid." }, 403);
  }

  const planned = planInstall({
    storeName: body.store_name,
    siteUrl: body.site_url,
    adminUsername: body.admin_username,
    adminPassword: body.admin_password,
    adminPasswordConfirm: body.admin_password_confirm,
    tagline: body.tagline,
    supportWhatsapp: body.support_whatsapp,
    locale: body.locale,
    storefrontTemplate: body.storefront_template,
  });
  if (!planned.ok) return json({ success: false, error: planned.error }, 400);

  const result = await runInstall(database, planned.plan);
  if (!result.ok) return json({ success: false, error: result.error }, 409);

  console.error("install-completed", planned.plan.slug);
  return json({ success: true, redirect: "/hello" });
};
