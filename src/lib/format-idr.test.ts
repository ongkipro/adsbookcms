import assert from "node:assert/strict";
import test from "node:test";
import { formatIdr } from "./format-idr.ts";

test("prices render in one Indonesian format everywhere", () => {
  assert.equal(formatIdr(89_000), "Rp89.000");
  assert.equal(formatIdr(1_250_500), "Rp1.250.500");
  assert.equal(formatIdr(0), "Rp0");
  assert.equal(formatIdr("89000"), "Rp89.000");
});

test("invalid input degrades to zero instead of NaN on a price tag", () => {
  assert.equal(formatIdr(Number.NaN), "Rp0");
  assert.equal(formatIdr(""), "Rp0");
});
