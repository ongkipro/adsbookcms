import type { APIRoute } from "astro";

import { getEnvValue, getRuntimeEnv } from "../../lib/env";
import { planInstall, runInstall } from "../../lib/install";
import { readStoreIdentity } from "../../lib/tenant";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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
  // who completes the wizard and is then locked out of their own store: the
  // login route needs AUTH_SECRET at 32 characters or more to sign a session,
  // and returns 503 without it. Refusing here costs a retry; refusing after the
  // write costs an install nobody can enter.
  const authSecret = getEnvValue("AUTH_SECRET", getRuntimeEnv(locals));
  if (authSecret.length < 32) {
    console.error("install-missing-auth-secret");
    return json(
      {
        success: false,
        error:
          "AUTH_SECRET belum diatur di Worker ini (minimal 32 karakter). Jalankan `npx wrangler secret put AUTH_SECRET`, lalu muat ulang halaman ini. Tanpa itu, instalasi berhasil tetapi Anda tidak akan bisa login.",
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
