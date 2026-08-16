import assert from "node:assert/strict";
import test from "node:test";
import {
  generateApiKeySecret,
  hashApiKeySecret,
  maskApiKeySecret,
  verifyApiKeySecret,
} from "./developer-api-keys.ts";

// A key issued before the brand sweep is a live credential on a merchant's
// storefront. These assert the migration off `cmsads_live_` did not invalidate it.
const LEGACY_SECRET = "cmsads_live_9pQ2vX7tKmR4bN8sLdF1hJ0wYcZ3aE6uT5gI2oP4kQs";

test("a key issued under the legacy prefix still validates", async () => {
  const storedHash = await hashApiKeySecret(LEGACY_SECRET);
  assert.equal(await verifyApiKeySecret(LEGACY_SECRET, storedHash), true);

  // Verification never reads the prefix, so it cannot be rewritten in place either:
  // re-prefixing a stored key produces a different secret that no longer matches.
  const rebranded = LEGACY_SECRET.replace("cmsads_live_", "adsbook_live_");
  assert.equal(await verifyApiKeySecret(rebranded, storedHash), false);
});

test("masked previews stay coherent for both the new and the legacy prefix", () => {
  const issued = generateApiKeySecret();
  assert.ok(issued.startsWith("adsbook_live_"));

  for (const secret of [issued, LEGACY_SECRET]) {
    const preview = maskApiKeySecret(secret);
    assert.ok(preview.startsWith(secret.slice(0, secret.indexOf("live_") + 5)));
    assert.ok(preview.includes("••••"));
    assert.equal(preview.endsWith(secret.slice(-4)), true);
    assert.equal(preview.includes(secret), false);
    assert.ok(preview.length < secret.length);
  }
});

test("an unrecognised secret masks to dots instead of leaking characters", () => {
  assert.equal(maskApiKeySecret("sk_live_someone_elses_token_format"), "••••••••");
  assert.equal(maskApiKeySecret("adsbook_live_short"), "••••••••");
  assert.equal(maskApiKeySecret(""), "••••••••");
});
