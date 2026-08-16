import type { APIRoute } from "astro";
import { AUTOLARIS_CHANNEL_OPTIONS } from "../../lib/autolaris-client";
import { getRuntimeEnv } from "../../lib/env";
import { getProviderConfig } from "../../lib/provider-config";
import {
  calculatePaymentAdminFee,
  COD_SERVICE_FEE_RATE,
  COD_SERVICE_FEE_VAT_RATE,
  normalizePaymentFeeBearer,
  paymentFeeDescription,
} from "../../lib/payment-fee-policy";
import { paymentBrandAsset } from "../../lib/payment-brand";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    let isCodEnabled = true;
    let isAutoLarisMasterEnabled = true;
    let autoLarisConfigured = false;
    let disabledAutoLarisChannels: string[] = [];
    let paymentFeeBearer = normalizePaymentFeeBearer(undefined);
    let codFeeBearer = normalizePaymentFeeBearer(undefined);
    let autolarisApiKey = "";
    let sellerBankAccounts: Array<{
      id: number;
      bank_code: string;
      account_holder: string;
      account_number: string;
      is_active: number;
    }> = [];
    if (database?.prepare) {
      try {
        const [providerConfig, store, bankAccounts] = await Promise.all([
          getProviderConfig(database, locals),
          database
            .prepare(
              "SELECT payment_fee_bearer, cod_fee_bearer, is_cod_enabled, is_autolaris_enabled, disabled_autolaris_channels FROM stores ORDER BY id LIMIT 1",
            )
            .first<{
              payment_fee_bearer: string | null;
              cod_fee_bearer: string | null;
              is_cod_enabled?: number | null;
              is_autolaris_enabled?: number | null;
              disabled_autolaris_channels?: string | null;
            }>()
            .catch(() =>
              database
                .prepare(
                  "SELECT payment_fee_bearer, cod_fee_bearer, is_cod_enabled, is_autolaris_enabled FROM stores ORDER BY id LIMIT 1",
                )
                .first<{
                  payment_fee_bearer: string | null;
                  cod_fee_bearer: string | null;
                  is_cod_enabled?: number | null;
                  is_autolaris_enabled?: number | null;
                  disabled_autolaris_channels?: string | null;
                }>(),
            ),
          database
            .prepare(
              `SELECT id, bank_code, account_holder, account_number, is_active
               FROM seller_bank_accounts
               WHERE store_id = (SELECT id FROM stores ORDER BY id LIMIT 1)
               ORDER BY display_order, id`,
            )
            .all<{
              id: number;
              bank_code: string;
              account_holder: string;
              account_number: string;
              is_active: number;
            }>(),
        ]);
        autolarisApiKey = providerConfig.autolaris.apiKey;
        isCodEnabled = store?.is_cod_enabled !== 0;
        isAutoLarisMasterEnabled = store?.is_autolaris_enabled !== 0;
        autoLarisConfigured = Boolean(autolarisApiKey) && isAutoLarisMasterEnabled;
        disabledAutoLarisChannels = (store?.disabled_autolaris_channels || "")
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean);
        paymentFeeBearer = normalizePaymentFeeBearer(store?.payment_fee_bearer);
        codFeeBearer = normalizePaymentFeeBearer(store?.cod_fee_bearer);
        sellerBankAccounts = bankAccounts.results || [];
      } catch (error) {
        console.error("payment-methods-config", error);
      }
    }

  return new Response(
    JSON.stringify({
      success: true,
      meta: {
        currency: "IDR",
        logo_aspect_ratio: "3:2",
      },
      data: [
        {
          code: "cod",
          payment_method: "cod",
          channel_code: null,
          name: "COD (Bayar di Tempat)",
          logo_url: paymentBrandAsset("COD"),
          description: "Bayar tunai saat barang tiba",
          admin_fee: 0,
          admin_fee_rate: COD_SERVICE_FEE_RATE,
          admin_fee_vat_rate: COD_SERVICE_FEE_VAT_RATE,
          fee_bearer: codFeeBearer,
          fee_basis: "merchandise_plus_shipping",
          fee_description: "Biaya layanan 3% + PPN 11% dari biaya layanan",
          is_active: isCodEnabled,
        },
        ...AUTOLARIS_CHANNEL_OPTIONS.map((channel) => {
          const isChannelDisabled = disabledAutoLarisChannels.includes(channel.code);
          const isChannelActive = autoLarisConfigured && !isChannelDisabled;
          return {
            code: channel.code,
            payment_method: channel.paymentMethod,
            channel_code: channel.code,
            name: channel.label,
            logo_url: paymentBrandAsset(channel.code),
            description: channel.description,
            admin_fee:
              paymentFeeBearer === "buyer" && channel.code !== "QRIS"
                ? calculatePaymentAdminFee(channel.code, 100_000)
                : 0,
            admin_fee_rate: channel.code === "QRIS" ? 0.007 : undefined,
            fee_bearer: paymentFeeBearer,
            fee_basis: "transaction_amount",
            fee_description: paymentFeeDescription(channel.code),
            is_active: isChannelActive,
            reason: !isAutoLarisMasterEnabled
              ? "AutoLaris dinonaktifkan oleh toko."
              : !autolarisApiKey
                ? "AutoLaris belum dikonfigurasi."
                : isChannelDisabled
                  ? "Channel dinonaktifkan oleh toko."
                  : undefined,
          };
        }),
        ...sellerBankAccounts.map((account) => ({
          code: `MANUAL_${account.id}`,
          payment_method: "manual_transfer",
          channel_code: null,
          seller_bank_account_id: account.id,
          bank_code: account.bank_code,
          name: `Transfer Bank ${account.bank_code}`,
          logo_url: paymentBrandAsset(account.bank_code),
          description: `a.n. ${account.account_holder}`,
          admin_fee: 0,
          admin_fee_rate: 0,
          fee_bearer: "seller",
          fee_basis: null,
          fee_description: "Tanpa biaya admin",
          is_active: Boolean(account.is_active),
        })),
      ],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
  } catch (error) {
    console.error("GET /api/payment-methods error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Gagal memuat metode pembayaran" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
