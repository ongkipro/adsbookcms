export const SELLER_BANK_OPTIONS = [
  { code: "BCA", label: "BCA", asset: "/images/payment/bca.svg" },
  { code: "MANDIRI", label: "Mandiri", asset: "/images/payment/mandiri.svg" },
  { code: "BRI", label: "BRI", asset: "/images/payment/bri.svg" },
  { code: "BNI", label: "BNI", asset: "/images/payment/bni.svg" },
  { code: "PERMATA", label: "Permata Bank", asset: "/images/payment/permata.svg" },
  { code: "BSI", label: "BSI", asset: "/images/payment/bsi.svg" },
  { code: "CIMB", label: "CIMB Niaga", asset: "/images/payment/cimb.svg" },
  { code: "DANAMON", label: "Danamon", asset: "/images/payment/danamon.svg" },
] as const;

export type SellerBankCode = (typeof SELLER_BANK_OPTIONS)[number]["code"];

const PAYMENT_ASSETS: Record<string, string> = Object.fromEntries([
  ...SELLER_BANK_OPTIONS.map(({ code, asset }) => [code, asset]),
  ["COD", "/images/payment/cod.webp"],
  ["QRIS", "/images/payment/qris.svg"],
]);

export function normalizePaymentBrandCode(channel: string) {
  const normalized = String(channel || "").trim().toUpperCase();
  if (normalized.startsWith("VA")) return normalized.slice(2);
  return normalized === "QR" ? "QRIS" : normalized;
}

export function paymentBrandAsset(channel: string) {
  return PAYMENT_ASSETS[normalizePaymentBrandCode(channel)] || "";
}

export function paymentBrandLabel(channel: string) {
  const code = normalizePaymentBrandCode(channel);
  if (code === "QRIS") return "QRIS";
  return SELLER_BANK_OPTIONS.find((bank) => bank.code === code)?.label || code;
}

export function isSellerBankCode(value: unknown): value is SellerBankCode {
  return SELLER_BANK_OPTIONS.some((bank) => bank.code === value);
}
