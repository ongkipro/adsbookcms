import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../lib/api.ts";
import { getRuntimeEnv } from "../../../lib/env.ts";
import { checkRateLimit, getClientIp } from "../../../lib/rate-limit.ts";

export const prerender = false;

const MAX_BODY_BYTES = 16 * 1024;

/**
 * Best-effort extraction of the two identifiers a callback is most likely to
 * carry, for indexing only. The body is stored verbatim regardless; a shape we
 * did not anticipate is exactly what this table exists to capture.
 */
function readIdentifiers(body: string) {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const data =
      parsed && typeof parsed.data === "object" && parsed.data
        ? (parsed.data as Record<string, unknown>)
        : parsed;
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const value = data?.[key] ?? parsed?.[key];
        if (typeof value === "string" || typeof value === "number") {
          return String(value).slice(0, 100);
        }
      }
      return null;
    };
    return {
      referenceId: pick("reff_id", "reference_id", "ref_id"),
      providerTransactionId: pick("trx_id", "transaction_id", "id"),
    };
  } catch {
    return { referenceId: null, providerTransactionId: null };
  }
}

/**
 * AutoLaris has no accepted callback contract, so this endpoint records and
 * acknowledges — it never moves payment state (A-164). Manual reconciliation
 * remains the only path to `paid`. Every delivery lands in
 * `autolaris_callbacks` so the real shape can be classified from evidence.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database?.prepare) {
    return jsonError("Penyimpanan callback belum tersedia.", 503);
  }
  const clientIp = getClientIp(request.headers);
  const rateLimit = await checkRateLimit(database, `autolaris-callback:${clientIp}`, 60, 60_000);
  if (!rateLimit.allowed) {
    return jsonError("Terlalu banyak callback.", 429, { code: "RATE_LIMITED" });
  }

  const raw = await request.text().catch(() => "");
  if (!raw.trim()) return jsonError("Callback kosong.", 400);
  const body = raw.length > MAX_BODY_BYTES ? `${raw.slice(0, MAX_BODY_BYTES)}…[truncated]` : raw;
  const ids = readIdentifiers(body);
  try {
    await database
      .prepare(
        `INSERT INTO autolaris_callbacks
           (received_at, remote_ip, content_type, user_agent, body, reference_id, provider_transaction_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        new Date().toISOString(),
        clientIp,
        request.headers.get("content-type")?.slice(0, 200) || null,
        request.headers.get("user-agent")?.slice(0, 200) || null,
        body,
        ids.referenceId,
        ids.providerTransactionId,
      )
      .run();
  } catch (error) {
    console.error("autolaris-callback-store-failed", error);
    return jsonError("Callback tidak dapat disimpan.", 500);
  }
  console.error("autolaris-callback-recorded", ids);
  return jsonOk({
    recorded: true,
    message: "Callback dicatat. Status pembayaran diverifikasi manual oleh operator.",
  });
};
