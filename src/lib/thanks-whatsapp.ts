/**
 * The WhatsApp hand-off from /thanks: the message the buyer sends to the
 * store's support number, and whether the page may take them there itself.
 *
 * Only a COD order is redirected. A QRIS, VA or transfer buyer still has to pay
 * from the instructions on the page, and a lead-only record has no order.
 */

export type ThanksWhatsappOrder = {
  storeName: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  variantLabel: string;
  quantity: number;
};

/** Timing of the automatic hand-off, in milliseconds. */
export const THANKS_WHATSAPP_REDIRECT = {
  /** Never sooner: the buyer should see the order was taken. */
  minMs: 1500,
  /** After the Pixel library is up, room for its Purchase request to leave. */
  afterPixelMs: 800,
  /** Never later: the server already holds the COD Purchase, so a browser leg
   * that never loads must not keep the buyer waiting. */
  maxMs: 5000,
} as const;

export function buildThanksWhatsappMessage(order: ThanksWhatsappOrder): string {
  const product = order.productName.trim();
  const variant = order.variantLabel.trim();
  const item = [
    product || variant || "Produk",
    variant && variant.toLowerCase() !== product.toLowerCase() ? `(${variant})` : "",
    `x${Math.max(1, Math.trunc(order.quantity) || 1)}`,
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [
    `Halo ${order.storeName.trim() || "Admin"}, saya sudah memesan:`,
    order.orderNumber.trim() ? `No. Invoice: ${order.orderNumber.trim()}` : "",
    order.customerName.trim() ? `Nama: ${order.customerName.trim()}` : "",
    `Produk: ${item}`,
    "",
    "Mohon segera diproses ya 🙏",
  ];
  return lines.filter((line, index) => line !== "" || index === lines.length - 2).join("\n");
}

/** `wa.me` link for an Indonesian number, or null when the number is unusable. */
export function thanksWhatsappUrl(phone: string, message: string): string | null {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^0/, "62");
  if (!/^62\d{8,13}$/.test(digits)) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function shouldAutoRedirectToWhatsapp(input: {
  enabled: boolean;
  paymentMethod: string;
  leadOnly: boolean;
  url: string | null;
}): boolean {
  return (
    input.enabled &&
    !input.leadOnly &&
    input.paymentMethod.trim().toLowerCase() === "cod" &&
    Boolean(input.url)
  );
}
