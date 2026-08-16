const PAID_STATUSES: Record<string, true> = {
  paid: true,
  settled: true,
  success: true,
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
  const paymentEligible =
    paymentMethod.toLowerCase() === "cod" ||
    Boolean(PAID_STATUSES[paymentStatus.toLowerCase()]);
  return (
    paymentEligible &&
    Boolean(DISPATCHABLE_SHIPPING_STATUSES[shippingStatus.toLowerCase()])
  );
}

export function getMengantarDispatchEligibility(
  input: MengantarDispatchEligibilityInput,
): MengantarDispatchEligibility {
  if (input.providerOrderId?.trim()) {
    return { eligible: false, reason: "Shipment Mengantar sudah dibuat." };
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

