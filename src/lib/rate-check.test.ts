import assert from "node:assert/strict";
import test from "node:test";

import { etaLabel, ratesWhatsAppText, visibleRates, waMeNumber, type QuotedRate } from "./rate-check.ts";

const rate = (courier_code: string, price: number, estimated_days: string, unsupported_cod = false): QuotedRate => ({
  courier_code,
  courier_service: courier_code,
  price,
  cod_fee: 0,
  estimated_days,
  unsupported_cod,
});

const rates = [rate("JNE", 13000, "4-5"), rate("spx", 12000, "1 - 3 days"), rate("Paxel", 15000, "", true)];

test("the COD filter hides couriers that cannot collect, and sorting never loses a row", () => {
  assert.deepEqual(visibleRates(rates, "cod", "price-asc").map((r) => r.courier_code), ["spx", "JNE"]);
  assert.deepEqual(visibleRates(rates, "all", "price-desc").map((r) => r.courier_code), ["Paxel", "JNE", "spx"]);
  // "1 - 3 days" and "4-5" both parse; a missing ETA sorts last, not first.
  assert.deepEqual(visibleRates(rates, "all", "eta-asc").map((r) => r.courier_code), ["spx", "JNE", "Paxel"]);
  assert.equal(rates.length, 3, "the input is not sorted in place");
});

test("the WhatsApp text lists every courier cheapest first and marks COD", () => {
  const text = ratesWhatsAppText(rates, "Tebet, Jakarta Selatan", 2);
  assert.match(text, /^\*Pilihan Ongkos Kirim \(2 kg\)\*\nTujuan: Tebet, Jakarta Selatan\n\n/);
  const lines = text.split("\n").slice(3);
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^• \*SPX Express\*: .*12\.000 \(1–3 hari\) \[COD OK\]$/);
  assert.doesNotMatch(lines[2], /COD OK/);
});

test("wa.me gets the 62-form of a local number", () => {
  assert.equal(waMeNumber("0812-3456-7890"), "6281234567890");
  assert.equal(waMeNumber("+62 812 3456 7890"), "6281234567890");
});

test("an ETA reads the same whichever unit the provider sent", () => {
  assert.equal(etaLabel("1 - 3 days"), "1–3 hari");
  assert.equal(etaLabel("2-4 hari"), "2–4 hari");
  assert.equal(etaLabel("3"), "3 hari");
  assert.equal(etaLabel("1 day"), "1 hari");
  assert.equal(etaLabel(""), "");
});
