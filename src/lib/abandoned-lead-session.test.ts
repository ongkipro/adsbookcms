import assert from "node:assert/strict";
import test from "node:test";
import {
  AbandonedLeadCaptureGate,
  ABANDONED_LEAD_SESSION_KEY,
  createAbandonedLeadFingerprint,
  readAbandonedLeadFingerprints,
  writeAbandonedLeadFingerprint,
} from "./abandoned-lead-session.ts";

test("abandoned lead fingerprint normalizes identity and preserves product selection", () => {
  const first = createAbandonedLeadFingerprint({
    customerName: "  SITI   Rahayu ",
    customerPhone: "628123456789",
    productId: 12,
    variantId: 34,
  });
  const same = createAbandonedLeadFingerprint({
    customerName: "siti rahayu",
    customerPhone: "0812-3456-789",
    productId: "12",
    variantId: "34",
  });
  const changed = createAbandonedLeadFingerprint({
    customerName: "Siti Rahayu",
    customerPhone: "628123456789",
    productId: 12,
    variantId: 35,
  });

  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("abandoned lead gate suppresses identical captures and accepts changed identity", () => {
  const gate = new AbandonedLeadCaptureGate(["recorded"]);

  assert.equal(gate.shouldStart("recorded"), false);
  assert.equal(gate.start("changed"), true);
  assert.equal(gate.shouldStart("changed"), false);
  gate.finish("changed", true);
  assert.equal(gate.shouldStart("changed"), false);
  assert.equal(gate.shouldStart("recorded"), false);
});

test("abandoned lead gate retries a failed capture", () => {
  const gate = new AbandonedLeadCaptureGate();

  assert.equal(gate.start("qualified-lead"), true);
  gate.finish("qualified-lead", false);
  assert.equal(gate.shouldStart("qualified-lead"), true);
});

test("abandoned lead fingerprint survives the browser session storage boundary", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const fingerprint = createAbandonedLeadFingerprint({
    customerName: "Siti Rahayu",
    customerPhone: "628123456789",
    productId: 12,
  });

  writeAbandonedLeadFingerprint(storage, fingerprint);
  writeAbandonedLeadFingerprint(storage, "changed-fingerprint");

  assert.deepEqual(
    JSON.parse(values.get(ABANDONED_LEAD_SESSION_KEY) || "[]"),
    [fingerprint, "changed-fingerprint"],
  );
  assert.deepEqual(readAbandonedLeadFingerprints(storage), [
    fingerprint,
    "changed-fingerprint",
  ]);
});

test("abandoned lead session reads the legacy single fingerprint", () => {
  const storage = {
    getItem: (key: string) =>
      key === "adsbook_abandoned_lead_fingerprint_v1" ? "legacy" : null,
  };

  assert.deepEqual(readAbandonedLeadFingerprints(storage), ["legacy"]);
});

test("disabled session storage degrades without blocking abandoned capture", () => {
  const storage = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("denied");
    },
  };

  assert.deepEqual(readAbandonedLeadFingerprints(storage), []);
  assert.doesNotThrow(() =>
    writeAbandonedLeadFingerprint(storage, "fingerprint"),
  );
});
