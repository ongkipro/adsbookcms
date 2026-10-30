const PAID_STATUSES: Record<string, true> = {
  paid: true,
  settled: true,
  success: true,
};

const VOID_PAYMENT_STATUSES: Record<string, true> = {
  cancelled: true,
  refunded: true,
  failed: true,
};

const DISPATCHABLE_SHIPPING_STATUSES: Record<string, true> = {
  pending: true,
};

export const MENGANTAR_DISPATCH_CLAIM_TTL_MS = 2 * 60 * 1000;

export type MengantarDispatchEligibilityInput = {
  paymentMethod: string;
  paymentStatus: string;
  shippingStatus: string;
  providerOrderId?: string | null;
  providerDispatchError?: string | null;
  providerDispatchClaimedAt?: string | null;
  destinationAreaId?: string | null;
  courierCode?: string | null;
  pickupAddressId?: string | null;
};

export type MengantarDispatchEligibility = {
  eligible: boolean;
  reason: string;
};

export function canDispatchOrderToMengantar(
  paymentMethod: string,
  paymentStatus: string,
  shippingStatus: string,
) {
  const status = paymentStatus.toLowerCase();
  // A COD order is dispatchable unpaid, but not once its payment is void: a
  // cancelled/refunded/failed payment is what the lifecycle calls released.
  const paymentEligible =
    (paymentMethod.toLowerCase() === "cod" && !VOID_PAYMENT_STATUSES[status]) ||
    Boolean(PAID_STATUSES[status]);
  return (
    paymentEligible &&
    Boolean(DISPATCHABLE_SHIPPING_STATUSES[shippingStatus.toLowerCase()])
  );
}

/**
 * `orders.provider_dispatch_error` prefix for a push whose outcome is unknown
 * (audit 2026-10-31 M-1). The order stays out of every push until an operator
 * has checked Mengantar and released it (`releaseUnknownMengantarDispatch`).
 */
export const DISPATCH_UNKNOWN_PREFIX = "DISPATCH_UNKNOWN:";

export const isDispatchOutcomeUnknown = (error: string | null | undefined) =>
  Boolean(error?.startsWith(DISPATCH_UNKNOWN_PREFIX));

export function getMengantarDispatchEligibility(
  input: MengantarDispatchEligibilityInput,
): MengantarDispatchEligibility {
  if (input.providerOrderId?.trim()) {
    return { eligible: false, reason: "Shipment Mengantar sudah dibuat." };
  }
  if (isDispatchOutcomeUnknown(input.providerDispatchError)) {
    return {
      eligible: false,
      reason: "Hasil push sebelumnya belum pasti. Cek di Mengantar dulu, lalu izinkan push ulang.",
    };
  }
  if (input.providerDispatchError === "DISPATCHING") {
    const claimedAt = Date.parse(input.providerDispatchClaimedAt || "");
    if (
      Number.isFinite(claimedAt) &&
      claimedAt > Date.now() - MENGANTAR_DISPATCH_CLAIM_TTL_MS
    ) {
      return {
        eligible: false,
        reason: "Order sedang diproses oleh Mengantar.",
      };
    }
  }
  if (
    !DISPATCHABLE_SHIPPING_STATUSES[input.shippingStatus.toLowerCase()]
  ) {
    return {
      eligible: false,
      reason: "Status order tidak dapat dikirim ke Mengantar.",
    };
  }
  if (
    !canDispatchOrderToMengantar(
      input.paymentMethod,
      input.paymentStatus,
      input.shippingStatus,
    )
  ) {
    return {
      eligible: false,
      reason: "Pembayaran online belum lunas.",
    };
  }
  if (!input.destinationAreaId?.trim()) {
    return {
      eligible: false,
      reason: "Kecamatan tujuan belum dipilih.",
    };
  }
  if (!input.courierCode?.trim()) {
    return { eligible: false, reason: "Kurir belum dipilih." };
  }
  if (!input.pickupAddressId?.trim()) {
    return {
      eligible: false,
      reason: "Pickup gudang belum dikonfigurasi.",
    };
  }
  return { eligible: true, reason: "Siap dikirim ke Mengantar." };
}

