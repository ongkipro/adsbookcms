import type { APIRoute } from "astro";
import { getRuntimeEnv } from "../../lib/env.ts";
import { loadPublicOrderStatus } from "../../lib/order-status.ts";

export const prerender = false;

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null) as {
      order_pk?: unknown;
      order_id?: unknown;
      status_token?: unknown;
    } | null;
    const orderIdentity = String(body?.order_pk ?? body?.order_id ?? "").trim();
    const statusToken = String(body?.status_token ?? "").trim();
    if (!orderIdentity || !statusToken) {
      return json(
        {
          success: false,
          error: "Parameter order_pk/order_id dan status_token wajib diisi.",
        },
        400,
      );
    }

    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    if (!database?.prepare) {
      return json({ success: false, error: "Database order belum tersedia." }, 503);
    }
    const orderStatus = await loadPublicOrderStatus(database, orderIdentity, statusToken);
    if (!orderStatus) {
      return json({ success: false, error: "Order tidak ditemukan." }, 404);
    }
    return json({ success: true, ...orderStatus });
  } catch {
    return json({ success: false, error: "Failed to fetch order status" }, 500);
  }
};
