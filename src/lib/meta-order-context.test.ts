import assert from "node:assert/strict";
import test from "node:test";
import {
  captureMetaOrderContext,
  parseMetaOrderContext,
  serializeMetaOrderContext,
} from "./meta-order-context.ts";

test("checkout captures validated Meta browser IDs and request context", () => {
  const externalId = "0123456789abcdef0123456789abcdef";
  const fbp = "fb.1.1788230000000.1234567890";
  const fbc = "fb.1.1788230000000.IwARclick";
  const request = new Request("https://shop.example/api/submit-order", {
    headers: {
      cookie: `adsbook_meta_external_id=${externalId}; _fbp=${fbp}; _fbc=${fbc}`,
      "cf-connecting-ip": "203.0.113.42",
      "user-agent": "Meta Context QA/1.0",
    },
  });

  const captured = captureMetaOrderContext(request);
  assert.deepEqual(captured, {
    externalId,
    fbp,
    fbc,
    clientIp: "203.0.113.42",
    userAgent: "Meta Context QA/1.0",
  });
  assert.deepEqual(parseMetaOrderContext(serializeMetaOrderContext(captured)), captured);
});

test("stored Meta context fails closed for malformed or oversized values", () => {
  assert.deepEqual(parseMetaOrderContext("{broken"), {});
  assert.deepEqual(
    parseMetaOrderContext(JSON.stringify({
      externalId: "phone-is-not-an-external-id",
      fbp: "invalid",
      fbc: "<script>",
      clientIp: "unknown",
      userAgent: "x".repeat(513),
    })),
    {},
  );
});
