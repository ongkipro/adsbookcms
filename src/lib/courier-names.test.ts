import assert from "node:assert/strict";
import test from "node:test";

import { courierDisplayName, courierServiceLabel } from "./courier-names.ts";

test("every spelling of a courier code reads as one name", () => {
  for (const code of ["JT", "J&T", "jt"]) assert.equal(courierDisplayName(code), "J&T Express");
  assert.equal(courierDisplayName("lion"), "Lion Parcel");
  assert.equal(courierDisplayName("SPX"), "SPX Express");
  assert.equal(courierDisplayName("unknownco"), "unknownco");
  assert.equal(courierDisplayName(null), "—");
});

test("a service equal to its courier is not printed twice", () => {
  assert.equal(courierServiceLabel("SiCepat", "SiCepat"), "SiCepat");
  assert.equal(courierServiceLabel("lion", "lion"), "Lion Parcel");
  assert.equal(courierServiceLabel("JNE", "REG"), "JNE · REG");
  assert.equal(courierServiceLabel("spx", null), "SPX Express");
});
