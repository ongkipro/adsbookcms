export type MengantarOrderPayloadInput = {
  orderNumber: string;
  courierCode: string;
  pickupAddressId: string;
  destinationAreaId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  productTitle: string;
  variantTitle: string;
  unitWeightKg: number;
  quantity: number;
  paymentMethod: "cod" | "bank_transfer" | "qris";
  goodsAmount: number;
  collectedAmount: number;
};

export type MengantarDispatchResult = {
  providerOrderId: string;
  providerOrderCode: string;
  providerBatchId: string;
  cnoteNo: string | null;
  isPaid: boolean;
};
export type AcceptedMengantarShipment = {
  outcome: "dispatched" | "unpaid";
  shippingStatus: "processing";
  providerOrderId: string;
  providerBatchId: string | null;
  cnoteNo: string | null;
  providerDispatchError: string | null;
  providerDispatchedAt: string | null;
};

export function resolveAcceptedMengantarShipment(
  paymentMethod: MengantarOrderPayloadInput["paymentMethod"],
  result: MengantarDispatchResult,
  acceptedAt: string,
): AcceptedMengantarShipment {
  const unpaid =
    paymentMethod !== "cod" && (!result.isPaid || !result.cnoteNo);
  return {
    outcome: unpaid ? "unpaid" : "dispatched",
    shippingStatus: "processing",
    providerOrderId: result.providerOrderId,
    providerBatchId: result.providerBatchId || null,
    cnoteNo: result.cnoteNo,
    providerDispatchError: unpaid ? "MENGANTAR_WALLET_UNPAID" : null,
    providerDispatchedAt: unpaid ? null : acceptedAt,
  };
}

export type MengantarQueueOutcome = {
  status: string;
  providerOrderId?: string;
  cnoteNo?: string;
  error?: string;
};

export async function runMengantarOrderQueue(
  orderIds: number[],
  processOrder: (orderId: number) => Promise<MengantarQueueOutcome>,
) {
  const results: Array<MengantarQueueOutcome & { orderId: number }> = [];
  for (const orderId of orderIds) {
    try {
      results.push({ orderId, ...(await processOrder(orderId)) });
    } catch (error) {
      results.push({
        orderId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
export function summarizeMengantarDispatchResults(
  results: Array<{ status: string }>,
) {
  let created = 0;
  let unpaid = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.status === "dispatched") {
      created += 1;
    } else if (result.status === "unpaid") {
      unpaid += 1;
    } else if (result.status === "failed") {
      failed += 1;
    } else {
      skipped += 1;
    }
  }
  return { accepted: created + unpaid, created, unpaid, failed, skipped };
}

export function resolveMengantarPickupSlot(value: string | Date) {
  const instant = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error("Jadwal pickup tidak valid.");
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  if (!year || !month || !day) {
    throw new Error("Tanggal pickup tidak dapat dinormalisasi.");
  }
  return {
    date: `${month}-${day}-${year}`,
    time: "9:00 - 18:00",
    scheduledAt: new Date(
      `${year}-${month}-${day}T09:00:00+07:00`,
    ).toISOString(),
  };
}

const cleanText = (value: string, max: number) => value.trim().slice(0, max);

export function buildMengantarOrderPayload(input: MengantarOrderPayloadInput) {
  const order: Record<string, unknown> = {
    assignee: "",
    customerAddress: cleanText(input.customerAddress, 500),
    customerName: cleanText(input.customerName, 100),
    customerAddressDataId: cleanText(input.destinationAreaId, 120),
    customerPhone: input.customerPhone.replace(/\D/g, ""),
    parcelContent: cleanText(
      [input.productTitle, input.variantTitle].filter(Boolean).join(" - "),
      150,
    ),
    destinationMark: cleanText(input.orderNumber, 80),
    deliveryInstruction: cleanText(`AdsBookCMS ${input.orderNumber}`, 150),
    dontIncludeSubdistrict: false,
    weight: Number((input.unitWeightKg * input.quantity).toFixed(3)),
    quantity: input.quantity,
  };

  if (input.paymentMethod === "cod") {
    order.COD = input.collectedAmount;
  } else {
    order.goodsValue = input.goodsAmount;
  }

  return {
    courier: input.courierCode,
    pickup: {
      type: "dropOff",
      address_id: input.pickupAddressId,
    },
    orders: [order],
  };
}

export function parseMengantarDispatchResponse(
  payload: Record<string, unknown>,
) {
  if (payload.success !== true) {
    throw new Error("Mengantar tidak mengonfirmasi penerimaan order.");
  }
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const first = rows[0];
  if (!first || typeof first !== "object") {
    throw new Error("Mengantar tidak mengembalikan identitas order.");
  }
  const row = first as Record<string, unknown>;
  const providerOrderId = String(row._id || "").trim();
  const providerOrderCode = String(row.ORDER_ID || "").trim();
  if (!providerOrderId && !providerOrderCode) {
    throw new Error("Mengantar tidak mengembalikan ID order.");
  }

  return {
    providerOrderId: providerOrderId || providerOrderCode,
    providerOrderCode,
    providerBatchId: String(payload.batch_id || row.batch_id || "").trim(),
    cnoteNo: String(row.cnote_no || "").trim() || null,
    isPaid: row.isPaid === true,
  } satisfies MengantarDispatchResult;
}
