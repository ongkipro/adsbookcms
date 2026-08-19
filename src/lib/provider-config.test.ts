import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCredentialUpdate } from "./provider-config.ts";

test("an empty credential submission keeps the stored value", () => {
  assert.deepEqual(resolveCredentialUpdate(""), { clear: false, value: "" });
  assert.deepEqual(resolveCredentialUpdate("   "), { clear: false, value: "" });
  assert.deepEqual(resolveCredentialUpdate(undefined), {
    clear: false,
    value: "",
  });
});

test("an explicit null clears the credential so the server fallback applies", () => {
  assert.deepEqual(resolveCredentialUpdate(null), { clear: true, value: "" });
});

test("a submitted credential is trimmed, and a non-string never clears", () => {
  assert.deepEqual(resolveCredentialUpdate("  API-123  "), {
    clear: false,
    value: "API-123",
  });
  assert.deepEqual(resolveCredentialUpdate(42), { clear: false, value: "" });
  assert.deepEqual(resolveCredentialUpdate({}), { clear: false, value: "" });
});
