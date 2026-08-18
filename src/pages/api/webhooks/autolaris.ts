import type { APIRoute } from "astro";
import { z } from "zod";
import { getEnvValue, getRuntimeEnv } from "../../../lib/env";
import {
  AutoLarisPaymentNotFoundError,
  reconcileAutoLarisPaidPayment,
} from "../../../lib/autolaris-reconciliation";

export const prerender = false;

const webhookSchema = z
  .object({
    order_id: z.string().trim().min(1).max(160).optional(),
    reff_id: z.string().trim().min(1).max(160).optional(),
    trx_id: z.string().trim().min(1).max(160).optional(),
    status: z.string().trim().transform((value) => value.toUpperCase()),
  })
  .superRefine((payload, context) => {
    if (!payload.trx_id && !payload.reff_id && !payload.order_id) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["order_id"],
        message: "Identitas transaksi wajib diisi.",
      });
    }
  });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const configuredSecret = getEnvValue(
    "AUTOLARIS_WEBHOOK_SECRET",
    getRuntimeEnv(locals),
  );
  if (!configuredSecret) {
    return json(
      {
        success: false,
        error: "AutoLaris webhook secret belum dikonfigurasi di server.",
      },
      503,
    );
  }

  const providedSecret =
    request.headers.get("x-autolaris-secret")?.trim() ||
    request.headers.get("x-webhook-secret")?.trim() ||
    "";
  if (!providedSecret || !timingSafeEqual(providedSecret, configuredSecret)) {
    return json({ success: false, error: "Webhook secret tidak valid." }, 401);
  }

  const parsed = webhookSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success || parsed.data.status !== "PAID") {
    return json(
      {
        success: false,
        error: "Payload webhook tidak valid atau belum berstatus PAID.",
      },
      400,
    );
  }

  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database?.prepare) {
    return json(
      { success: false, error: "Database order belum tersedia." },
      503,
    );
  }

  try {
    const reconciliation = await reconcileAutoLarisPaidPayment(
      database,
      locals,
      {
        providerTransactionId: parsed.data.trx_id,
        referenceId: parsed.data.reff_id || parsed.data.order_id,
      },
    );
    return json({
      success: true,
      order_id: reconciliation.orderNumber,
      payment_transitioned: reconciliation.transitioned,
      shipping_queued: reconciliation.shippingQueued,
    });
  } catch (error) {
    if (error instanceof AutoLarisPaymentNotFoundError) {
      return json({ success: false, error: error.message }, 404);
    }
    console.error("autolaris-webhook", error);
    return json(
      { success: false, error: "Gagal merekonsiliasi pembayaran." },
      500,
    );
  }
};
