import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../../lib/api.ts";
import { getRuntimeEnv } from "../../../../lib/env.ts";
import {
  ABANDONED_RETENTION_DAYS,
  purgeExpiredAbandonedOrders,
} from "../../../../lib/order-persistence.ts";

export const prerender = false;

/** Explicit write-side maintenance action; abandoned retention never runs in GET handlers. */
export const POST: APIRoute = async ({ locals }) => {
  if (!locals.admin) return jsonError("Unauthorized", 401);

  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== "object") {
    return jsonError("Database order belum tersedia.", 503);
  }

  try {
    const deletedCount = await purgeExpiredAbandonedOrders(
      database as D1Database,
    );
    return jsonOk({
      deleted_count: deletedCount,
      retention_days: ABANDONED_RETENTION_DAYS,
    });
  } catch (error) {
    console.error("abandoned-order-retention", error);
    return jsonError("Gagal membersihkan pesanan tertinggal.", 500);
  }
};
