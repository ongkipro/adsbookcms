export const SHIPPING_QUEUE_IDS = [
  "all",
  "needs_waybill",
  "needs_pickup",
  "delivered",
] as const;

export type ShippingQueueId = (typeof SHIPPING_QUEUE_IDS)[number];

type ShippingQueueRecord = {
  shippingStatus: string;
  cnoteNo: string | null;
  providerOrderId: string | null;
  pickupScheduleId: number | null;
  /** 'drop_off' never needs a pickup; 'pickup' or a pre-0077 NULL may. */
  handover?: string | null;
};

export function matchesShippingQueue(
  shipment: ShippingQueueRecord,
  queue: ShippingQueueId,
): boolean {
  if (queue === "all") return true;
  if (queue === "delivered") return shipment.shippingStatus === "delivered";
  if (queue === "needs_waybill") {
    return (
      shipment.shippingStatus === "processing" &&
      Boolean(shipment.providerOrderId) &&
      !shipment.cnoteNo
    );
  }
  if (queue === "needs_pickup") {
    return (
      shipment.shippingStatus === "processing" &&
      Boolean(shipment.cnoteNo) &&
      !shipment.pickupScheduleId &&
      shipment.handover !== "drop_off"
    );
  }
  return false;
}
