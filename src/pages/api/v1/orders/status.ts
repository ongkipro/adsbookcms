import type { APIRoute } from "astro";
import { getRuntimeEnv } from "../../../../lib/env.ts";
import {
  handleOptions,
  headlessError,
  headlessOk,
  validateHeadlessRequest,
} from "../../../../lib/headless-api.ts";
import { loadPublicOrderStatus } from "../../../../lib/order-status.ts";

export const prerender = false;
export const OPTIONS = handleOptions;

export const POST: APIRoute = async ({ request, locals }) => {
  const validation = await validateHeadlessRequest(request, locals, {
    operation: "orderStatusRead",
  });
  if (!validation.allowed) return validation.errorResponse;

  const body = await request.json().catch(() => null) as {
    order_number?: unknown;
    status_token?: unknown;
  } | null;
  const orderNumber = String(body?.order_number ?? "").trim();
  const statusToken = String(body?.status_token ?? "").trim();
  if (!orderNumber || !statusToken) {
    return validation.finalize(headlessError(
      "order_number dan status_token wajib diisi.",
      400,
      { code: "ORDER_STATUS_IDENTITY_REQUIRED" },
      validation.corsHeaders,
    ));
  }

  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database?.prepare) {
    return validation.finalize(headlessError(
      "Database order belum tersedia.",
      503,
      { code: "DATABASE_UNAVAILABLE" },
      validation.corsHeaders,
    ));
  }

  try {
    const order = await loadPublicOrderStatus(database, orderNumber, statusToken);
    if (!order) {
      return validation.finalize(headlessError(
        "Order tidak ditemukan.",
        404,
        { code: "ORDER_NOT_FOUND" },
        validation.corsHeaders,
      ));
    }
    return validation.finalize(headlessOk({ order }, 200, {
      ...validation.corsHeaders,
      "cache-control": "no-store",
    }));
  } catch {
    return validation.finalize(headlessError(
      "Gagal memuat status order.",
      500,
      { code: "ORDER_STATUS_ERROR" },
      validation.corsHeaders,
    ));
  }
};
