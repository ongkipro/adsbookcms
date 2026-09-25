import assert from "node:assert/strict";
import test from "node:test";
import { json, jsonOk, jsonError } from "./api.ts";

test("json sets JSON content-type and no-store, and merges caller headers without losing them", async () => {
  const response = json({ foo: "bar" }, 201, { "x-custom": "1" });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-custom"), "1");
  assert.deepEqual(await response.json(), { foo: "bar" });
});

test("jsonOk defaults success:true but a caller-supplied success field still wins the spread", async () => {
  const response = jsonOk({ orderId: 7 });
  assert.deepEqual(await response.json(), { success: true, orderId: 7 });

  // Pinned because it is surprising, not because it is desired: `{ success: true, ...data }`
  // means a caller that happens to pass its own `success` key silently overrides the default.
  const overridden = jsonOk({ success: "should not win", orderId: 7 });
  assert.deepEqual(await overridden.json(), { success: "should not win", orderId: 7 });
});

test("jsonError defaults to 400 and carries the message plus any extra fields", async () => {
  const response = jsonError("Nomor telepon tidak valid.", 422, { code: "INVALID_PHONE" });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    success: false,
    error: "Nomor telepon tidak valid.",
    code: "INVALID_PHONE",
  });

  const defaulted = jsonError("Data tidak valid.");
  assert.equal(defaulted.status, 400);
});
