import type { AutoLarisCheckoutChannel } from "./autolaris-client";

export type PaymentFeeBearer = "buyer" | "seller";

export const COD_SERVICE_FEE_RATE = 0.03;
export const COD_SERVICE_FEE_VAT_RATE = 0.11;

export type CodFeeBreakdown = {
  baseAmount: number;
  serviceFee: number;
  vat: number;
  totalFee: number;
};

export function calculateCodFeeBreakdown(amount: number): CodFeeBreakdown {
  const baseAmount = Math.max(0, Math.round(amount));
  const serviceFee = Math.ceil(baseAmount * COD_SERVICE_FEE_RATE);
  const vat = Math.ceil(serviceFee * COD_SERVICE_FEE_VAT_RATE);
  return {
    baseAmount,
    serviceFee,
    vat,
    totalFee: serviceFee + vat,
  };
}

export function calculateCodCustomerTotal(
  amount: number,
  bearer: PaymentFeeBearer,
) {
  const fee = calculateCodFeeBreakdown(amount);
  return fee.baseAmount + (bearer === "buyer" ? fee.totalFee : 0);
}

type PaymentFeeRule =
  | { kind: "fixed"; amount: number }
  | { kind: "percentage"; rate: number };

const PAYMENT_FEE_RULES: Record<AutoLarisCheckoutChannel, PaymentFeeRule> = {
  QRIS: { kind: "percentage", rate: 0.007 },
  VABCA: { kind: "fixed", amount: 6_500 },
  VAMANDIRI: { kind: "fixed", amount: 3_000 },
  VABNI: { kind: "fixed", amount: 3_000 },
  VABRI: { kind: "fixed", amount: 3_000 },
  VAPERMATA: { kind: "fixed", amount: 3_000 },
  VABSI: { kind: "fixed", amount: 3_000 },
  VACIMB: { kind: "fixed", amount: 3_000 },
  VADANAMON: { kind: "fixed", amount: 3_000 },
};

export function normalizePaymentFeeBearer(value: unknown): PaymentFeeBearer {
  return value === "seller" ? "seller" : "buyer";
}

export function calculatePaymentAdminFee(
  channel: AutoLarisCheckoutChannel,
  amount: number,
) {
  const normalizedAmount = Math.max(0, Math.round(amount));
  const rule = PAYMENT_FEE_RULES[channel];
  return rule.kind === "fixed"
    ? rule.amount
    : Math.ceil(normalizedAmount * rule.rate);
}

export function calculateAutoLarisRequestAmount(
  channel: AutoLarisCheckoutChannel,
  orderTotal: number,
  bearer: PaymentFeeBearer,
) {
  const normalizedTotal = Math.max(1, Math.round(orderTotal));
  if (bearer === "buyer") return normalizedTotal;

  const rule = PAYMENT_FEE_RULES[channel];
  if (rule.kind === "fixed") return Math.max(1, normalizedTotal - rule.amount);

  let low = 1;
  let high = normalizedTotal;
  while (low < high) {
    const candidate = Math.ceil((low + high) / 2);
    const billed = candidate + calculatePaymentAdminFee(channel, candidate);
    if (billed <= normalizedTotal) low = candidate;
    else high = candidate - 1;
  }
  return low;
}

export function paymentFeeDescription(channel: AutoLarisCheckoutChannel) {
  const rule = PAYMENT_FEE_RULES[channel];
  return rule.kind === "fixed"
    ? `Biaya admin Rp${new Intl.NumberFormat("id-ID").format(rule.amount)}`
    : "Biaya admin 0,7% dari nilai transaksi";
}
