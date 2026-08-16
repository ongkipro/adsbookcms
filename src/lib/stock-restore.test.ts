import assert from "node:assert/strict";
import test from "node:test";
import { releasesReservedStock } from "./stock-restore.ts";

test("cancelled and returned orders give their reserved stock back", () => {
  assert.equal(releasesReservedStock("unpaid", "cancelled"), true);
  assert.equal(releasesReservedStock("unpaid", "returned"), true);
  assert.equal(releasesReservedStock("refunded", "delivered"), true);
  assert.equal(releasesReservedStock("cancelled", "pending"), true);
  assert.equal(releasesReservedStock("failed", "pending"), true);
});

test("orders still in flight keep their stock reserved", () => {
  assert.equal(releasesReservedStock("unpaid", "pending"), false);
  assert.equal(releasesReservedStock("paid", "processing"), false);
  assert.equal(releasesReservedStock("paid", "shipped"), false);
  // A delivered COD order consumed the goods; releasing here would double stock.
  assert.equal(releasesReservedStock("paid", "delivered"), false);
});
