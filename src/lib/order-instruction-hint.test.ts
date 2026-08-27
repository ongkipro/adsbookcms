import assert from "node:assert/strict";
import test from "node:test";
import { paymentInstructionHint } from "./order-instruction-hint.ts";

test("a missing instruction status is never a warning and never throws", () => {
  // The regression this locks: the admin order list is rendered by two
  // independent producers and the server-side one omitted this field, so the
  // component read `undefined.toLowerCase()` and every admin order page
  // returned 200 with an empty body.
  for (const missing of [undefined, null, "", "   "]) {
    assert.equal(paymentInstructionHint("pending", missing), null);
    assert.equal(paymentInstructionHint(missing, missing), null);
  }
});

test("a dead instruction on an unpaid order is flagged, case and spacing aside", () => {
  assert.equal(paymentInstructionHint("pending", "failed"), "failed");
  assert.equal(paymentInstructionHint("unpaid", "expired"), "expired");
  assert.equal(paymentInstructionHint("pending", " EXPIRED "), "expired");
});

test("a live instruction and a paid order are both silent", () => {
  assert.equal(paymentInstructionHint("pending", "pending"), null);
  assert.equal(paymentInstructionHint("pending", "refunded"), null);
  for (const paid of ["paid", "settled", "SUCCESS"]) {
    assert.equal(paymentInstructionHint(paid, "expired"), null);
    assert.equal(paymentInstructionHint(paid, "failed"), null);
  }
});
