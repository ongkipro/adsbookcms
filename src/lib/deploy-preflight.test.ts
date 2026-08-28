import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PRODUCT_PLACEHOLDER_PREFIX,
  checkDeployTarget,
  parseWranglerConfig,
} from "./deploy-preflight.ts";

const installTarget = {
  name: "toko-permata",
  d1Databases: [{ binding: "OMS_DB", database_name: "toko-permata-d1", database_id: "8f2c1a90-4d3b-4e1f-9a77-2b6c5d0e1f34" }],
  r2Buckets: [{ binding: "ASSET_BUCKET", bucket_name: "toko-permata-assets" }],
};

test("a real install passes, and the product's own config never does", () => {
  assert.deepEqual(checkDeployTarget(installTarget), { ok: true });

  // This repository, read from disk. RELEASE.md §1: "there is no production
  // Worker to reach" here, so refusing is the correct answer, not a false
  // positive to be worked around.
  const product = parseWranglerConfig(
    readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
  );
  const result = checkDeployTarget(product);
  assert.equal(result.ok, false);
  assert.ok(result.ok === false && result.reasons.length >= 3, "name, D1 and R2 each report");
  assert.match(String(product.name), new RegExp(PRODUCT_PLACEHOLDER_PREFIX));
});

/**
 * The failure this exists for: a merge from the product brings its placeholders
 * back into an install's wrangler.jsonc, and `wrangler deploy` then replaces a
 * live store's Worker with one pointing at nothing. Each placeholder is caught
 * on its own, because a partial overwrite is the likely shape.
 */
test("each placeholder a merge can restore is refused on its own", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["placeholder worker name", { ...installTarget, name: PRODUCT_PLACEHOLDER_PREFIX }],
    ["placeholder name with a suffix", { ...installTarget, name: `${PRODUCT_PLACEHOLDER_PREFIX}-staging` }],
    ["missing worker name", { ...installTarget, name: "" }],
    ["all-zero database id", {
      ...installTarget,
      d1Databases: [{ binding: "OMS_DB", database_name: "toko-permata-d1", database_id: "00000000-0000-0000-0000-000000000000" }],
    }],
    ["missing database id", {
      ...installTarget,
      d1Databases: [{ binding: "OMS_DB", database_name: "toko-permata-d1" }],
    }],
    ["placeholder database name", {
      ...installTarget,
      d1Databases: [{ binding: "OMS_DB", database_name: `${PRODUCT_PLACEHOLDER_PREFIX}-d1`, database_id: "8f2c1a90-4d3b-4e1f-9a77-2b6c5d0e1f34" }],
    }],
    ["placeholder bucket name", {
      ...installTarget,
      r2Buckets: [{ binding: "ASSET_BUCKET", bucket_name: `${PRODUCT_PLACEHOLDER_PREFIX}-assets` }],
    }],
  ];
  for (const [label, target] of cases) {
    const result = checkDeployTarget(target);
    assert.equal(result.ok, false, `${label} must be refused`);
    assert.ok(result.ok === false && result.reasons[0], `${label} must say why`);
  }

  // A store whose own name merely contains the product's is not a placeholder.
  assert.deepEqual(
    checkDeployTarget({ ...installTarget, name: "not-adsbookcms-your-store-really" }),
    { ok: true },
  );
  // Nothing configured is not a pass by omission.
  assert.equal(checkDeployTarget({}).ok, false);
});

/**
 * `wrangler.jsonc` is JSONC. Comments and trailing commas are legal there and
 * fatal to `JSON.parse`, and this repository's file uses both — a preflight
 * that crashed on its own config would be worked around rather than fixed.
 */
test("the JSONC this repository actually ships parses", () => {
  const parsed = parseWranglerConfig(`{
    // the Worker this install owns
    "name": "toko-permata", /* inline */
    "d1_databases": [
      { "binding": "OMS_DB", "database_name": "toko-permata-d1", "database_id": "8f2c1a90-4d3b-4e1f-9a77-2b6c5d0e1f34" },
    ],
    "r2_buckets": [{ "binding": "ASSET_BUCKET", "bucket_name": "toko-permata-assets" }],
  }`);
  assert.equal(parsed.name, "toko-permata");
  assert.equal(parsed.d1Databases?.[0]?.database_id, "8f2c1a90-4d3b-4e1f-9a77-2b6c5d0e1f34");
  assert.deepEqual(checkDeployTarget(parsed), { ok: true });

  // A `//` inside a string is not a comment — stripping it would corrupt every
  // URL in the file.
  const withUrl = parseWranglerConfig(`{ "name": "toko", "vars": { "PUBLIC_SITE_URL": "https://toko.example" } }`);
  assert.equal(withUrl.name, "toko");

  // The real file, comments and all.
  assert.doesNotThrow(() =>
    parseWranglerConfig(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8")),
  );
});

test("the deploy scripts still run the preflight", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { scripts: Record<string, string> };
  // npm runs `pre<name>` before `<name>`. Both deploy entry points are covered,
  // or the guard is only as good as which alias an operator happens to type.
  assert.match(pkg.scripts.predeploy, /preflight:deploy/);
  assert.match(pkg.scripts["precf:deploy"], /preflight:deploy/);
  assert.match(pkg.scripts.deploy, /wrangler deploy/);
  assert.match(pkg.scripts["cf:deploy"], /wrangler deploy/);
});
