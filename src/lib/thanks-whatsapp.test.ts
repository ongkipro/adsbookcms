import assert from "node:assert/strict";
import test from "node:test";
import {
  buildThanksWhatsappMessage,
  shouldAutoRedirectToWhatsapp,
  thanksWhatsappUrl,
  THANKS_WHATSAPP_REDIRECT,
} from "./thanks-whatsapp.ts";

const order = {
  storeName: "Tani Niaga",
  orderNumber: "INV-2026-000123",
  customerName: "Budi Santoso",
  productName: "Bensu - Pupuk Cair Organik",
  variantLabel: "1 Liter",
  quantity: 2,
};

test("the message names the invoice, the buyer and the product with its variant", () => {
  assert.equal(
    buildThanksWhatsappMessage(order),
    [
      "Halo Tani Niaga, saya sudah memesan:",
      "No. Invoice: INV-2026-000123",
      "Nama: Budi Santoso",
      "Produk: Bensu - Pupuk Cair Organik (1 Liter) x2",
      "",
      "Mohon segera diproses ya 🙏",
    ].join("\n"),
  );
});

test("a missing field is left out, never rendered as a blank label", () => {
  const message = buildThanksWhatsappMessage({ ...order, orderNumber: "", customerName: " ", variantLabel: "Bensu - Pupuk Cair Organik", quantity: 0 });
  assert.doesNotMatch(message, /No\. Invoice|Nama:/);
  assert.match(message, /Produk: Bensu - Pupuk Cair Organik x1\n\nMohon/, "a variant equal to the product is not repeated");
});

test("the link normalises an Indonesian number and refuses a broken one", () => {
  assert.equal(thanksWhatsappUrl("0812-3456-7890", "hi"), "https://wa.me/6281234567890?text=hi");
  assert.equal(thanksWhatsappUrl("+62 812 3456 7890", "a b"), "https://wa.me/6281234567890?text=a%20b");
  assert.equal(thanksWhatsappUrl("12345", "hi"), null);
  assert.equal(thanksWhatsappUrl("", "hi"), null);
});

test("only a COD order with a usable number is handed off, and only when enabled", () => {
  const url = "https://wa.me/6281234567890";
  assert.equal(shouldAutoRedirectToWhatsapp({ enabled: true, paymentMethod: "COD", leadOnly: false, url }), true);
  // A QRIS/VA/transfer buyer still has to pay from the instructions on the page.
  assert.equal(shouldAutoRedirectToWhatsapp({ enabled: true, paymentMethod: "qris", leadOnly: false, url }), false);
  assert.equal(shouldAutoRedirectToWhatsapp({ enabled: true, paymentMethod: "bank_transfer", leadOnly: false, url }), false);
  assert.equal(shouldAutoRedirectToWhatsapp({ enabled: true, paymentMethod: "cod", leadOnly: true, url }), false);
  assert.equal(shouldAutoRedirectToWhatsapp({ enabled: false, paymentMethod: "cod", leadOnly: false, url }), false);
  assert.equal(shouldAutoRedirectToWhatsapp({ enabled: true, paymentMethod: "cod", leadOnly: false, url: null }), false);
});

test("the hand-off waits for the page to register, never longer than five seconds", () => {
  assert.ok(THANKS_WHATSAPP_REDIRECT.minMs >= 1000 && THANKS_WHATSAPP_REDIRECT.minMs < THANKS_WHATSAPP_REDIRECT.maxMs);
  assert.ok(THANKS_WHATSAPP_REDIRECT.maxMs <= 5000);
});

test("the hand-off waits on the tracker, and the CAPI leg survives leaving the page", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const tracker = read("components/storefront/tracking/MetaThanksTracker.astro");
  const thanks = read("pages/thanks.astro");
  // The tracker says when the Purchase has been handed off, on every exit.
  assert.match(tracker, /fire\(\)\.finally\([\s\S]*__PS_PURCHASE_DONE__ = true[\s\S]*ps:purchase-done/);
  // Without keepalive a navigation to wa.me could cancel the CAPI request.
  assert.match(tracker, /fetch\('\/api\/meta-event'[\s\S]{0,300}keepalive: true/);
  // The page listens for that signal and checks the Pixel library before going.
  assert.match(thanks, /addEventListener\('ps:purchase-done'/);
  assert.match(thanks, /fbq\.instance/);
  assert.match(thanks, /shouldAutoRedirectToWhatsapp\(/);
});
