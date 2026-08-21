import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonError, jsonOk } from "../../../lib/api.ts";
import { getRuntimeEnv } from "../../../lib/env.ts";
import {
  confirmManualAutoLarisPayment,
  inquireAutoLarisPaymentStatus,
  listManualAutoLarisPayments,
  ManualPaymentReconciliationError,
} from "../../../lib/manual-payment-reconciliation.ts";

export const prerender = false;

const confirmationSchema = z
  .object({
    transaction_id: z.number().int().positive(),
    verified_amount: z.number().int().positive(),
    provider_reference: z.string().trim().min(1).max(160),
    note: z.string().trim().min(5).max(500),
    confirmed: z.literal(true),
  })
  .strict();

// A provider read, not a state change: it writes nothing and cannot mark a
// payment paid. It shares POST because it calls out to AutoLaris.
const inquirySchema = z
  .object({
    action: z.literal("inquire"),
    transaction_id: z.number().int().positive(),
  })
  .strict();

function databaseFrom(locals: App.Locals) {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  return database &&
    typeof database === "object" &&
    typeof (database as D1Database).prepare === "function" &&
    typeof (database as D1Database).batch === "function"
    ? (database as D1Database)
    : null;
}

function reconciliationError(error: unknown) {
  if (!(error instanceof ManualPaymentReconciliationError)) {
    console.error("manual-payment-reconciliation", error);
    return jsonError("Rekonsiliasi pembayaran gagal diproses.", 500);
  }
  if (error.code === "FORBIDDEN") return jsonError(error.message, 403, { code: error.code });
  if (error.code === "ACTOR_NOT_FOUND") return jsonError(error.message, 401, { code: error.code });
  if (error.code === "PAYMENT_NOT_FOUND") return jsonError(error.message, 404, { code: error.code });
  if (error.code === "PAYMENT_MISMATCH") return jsonError(error.message, 422, { code: error.code });
  if (error.code === "VALIDATION_ERROR") return jsonError(error.message, 422, { code: error.code });
  if (error.code === "PAYMENT_CONFLICT") return jsonError(error.message, 409, { code: error.code });
  return jsonError(error.message, 500, { code: error.code });
}

export const GET: APIRoute = async ({ request, locals }) => {
  const database = databaseFrom(locals);
  if (!database) return jsonError("Database pembayaran belum tersedia.", 503);
  const url = new URL(request.url);
  const parsed = z
    .object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(20),
      search: z.string().trim().max(120).default(""),
      status: z.enum(["pending", "paid"]).default("pending"),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return jsonError("Filter rekonsiliasi tidak valid.", 422);

  try {
    const data = await listManualAutoLarisPayments(database, locals.admin, {
      page: parsed.data.page,
      pageSize: parsed.data.page_size,
      search: parsed.data.search,
      status: parsed.data.status,
    });
    return jsonOk({ data });
  } catch (error) {
    return reconciliationError(error);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const database = databaseFrom(locals);
  if (!database) return jsonError("Database pembayaran belum tersedia.", 503);
  const body = await request.json().catch(() => null);

  const inquiry = inquirySchema.safeParse(body);
  if (inquiry.success) {
    try {
      const data = await inquireAutoLarisPaymentStatus(
        database,
        locals,
        locals.admin,
        inquiry.data.transaction_id,
      );
      return jsonOk({ data });
    } catch (error) {
      if (error instanceof ManualPaymentReconciliationError) {
        return reconciliationError(error);
      }
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Pemeriksaan status AutoLaris gagal.";
      return jsonError(message, message.includes("timeout") ? 504 : 502);
    }
  }

  // Without this, a malformed inquiry falls through and is answered with the
  // confirmation route's error, which names fields the caller never sent.
  if (
    body &&
    typeof body === "object" &&
    (body as { action?: unknown }).action === "inquire"
  ) {
    return jsonError("Pemeriksaan provider wajib memuat transaction_id.", 422);
  }

  const parsed = confirmationSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      "Konfirmasi wajib memuat transaksi, nominal, referensi provider, dan persetujuan eksplisit.",
      422,
    );
  }

  try {
    const result = await confirmManualAutoLarisPayment(
      database,
      locals.admin,
      {
        transactionId: parsed.data.transaction_id,
        verifiedAmount: parsed.data.verified_amount,
        providerReference: parsed.data.provider_reference,
        note: parsed.data.note,
      },
    );
    return jsonOk({
      data: {
        transaction_id: result.transaction.transaction_id,
        order_number: result.transaction.order_number,
        status: result.transaction.status,
        payment_status: result.transaction.order_payment_status,
        shipping_status: result.transaction.shipping_status,
        confirmed_by: result.transaction.confirmed_by,
        confirmed_role: result.transaction.confirmed_role,
        confirmed_at: result.transaction.confirmed_at,
        confirmation_note: result.transaction.confirmation_note,
        transitioned: result.transitioned,
      },
    });
  } catch (error) {
    return reconciliationError(error);
  }
};
