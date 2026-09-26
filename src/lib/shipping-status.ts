/**
 * The one set of words for an order's shipping status. The order list, the
 * order detail and the shipping queue each kept their own map, so the same
 * `processing` row read "Diproses", "Siap push Mengantar" (wrong: dispatch
 * sets `processing` only after Mengantar has accepted the shipment) and
 * "Antrean Mengantar" depending on the screen.
 */
export const SHIPPING_STATUS_LABELS: Record<string, string> = {
  pending: "Menunggu konfirmasi",
  processing: "Diproses Mengantar",
  shipped: "Dikirim",
  delivered: "Selesai",
  returned: "RTS",
  cancelled: "Batal",
};

export const shippingStatusLabel = (status: string | null | undefined) =>
  (status && SHIPPING_STATUS_LABELS[status]) || status || "—";
