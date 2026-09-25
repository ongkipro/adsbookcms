import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  checkDeployTarget,
  evaluateDeployPreflight,
  parseWranglerConfig,
  type DeployPreflightState,
} from "./deploy-preflight.ts";

const installTarget = {
  name: "toko-permata",
  d1Databases: [{ binding: "OMS_DB", database_name: "toko-permata-d1", database_id: "8f2c1a90-4d3b-4e1f-9a77-2b6c5d0e1f34" }],
  kvNamespaces: [{ binding: "SESSION", id: "4f1c2b7e9a0d4c3b8e6f1a2b3c4d5e6f" }],
  r2Buckets: [{ binding: "ASSET_BUCKET", bucket_name: "toko-permata-assets" }],
};

const ZERO_D1 = "00000000-0000-0000-0000-000000000000";

test("a real install passes, and the product's own config never does", () => {
  assert.deepEqual(checkDeployTarget(installTarget), { ok: true });

  // The config on disk, whichever repository this is. In the product,
  // RELEASE.md §1 says "there is no production Worker to reach", so refusing
  // is the correct answer. In an install the same file is a real target and
  // must pass, which is why this cannot assert one outcome unconditionally:
  // the previous version read the file as if it were always the product's, so
  // it went red in every install the moment one carried this test — turning a
  // documented pre-deploy gate into noise operators learn to skip.
  const onDisk = parseWranglerConfig(
    readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"),
  );
  const result = checkDeployTarget(onDisk);
  if (onDisk.d1Databases?.some((database) => database.database_id === ZERO_D1)) {
    assert.equal(result.ok, false);
    assert.ok(result.ok === false && result.reasons.length >= 2, "D1 and KV each report");
  } else {
    // An install must pass its own preflight. This is the stronger half: a
    // merge that drags the product's placeholders back into a live store's
    // wrangler.jsonc now fails the suite before anyone runs `npm run deploy`.
    assert.deepEqual(result, { ok: true }, "an install must pass its own deploy preflight");
  }
});

/**
 * The failure this exists for: a merge from the product brings its template
 * back into an install's wrangler.jsonc, and `wrangler deploy` then points a
 * live store at nothing — or, with an id missing, at a freshly provisioned
 * empty database. Each id is caught on its own, because a partial overwrite is
 * the likely shape. Names are not a signal since ADR-026: the template's are
 * real defaults a one-click install may keep.
 */
test("each template id a merge can restore is refused on its own", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["missing worker name", { ...installTarget, name: "" }],
    ["no D1 declared", { ...installTarget, d1Databases: [] }],
    ["all-zero database id", {
      ...installTarget,
      d1Databases: [{ binding: "OMS_DB", database_name: "toko-permata-d1", database_id: ZERO_D1 }],
    }],
    ["missing database id", {
      ...installTarget,
      d1Databases: [{ binding: "OMS_DB", database_name: "toko-permata-d1" }],
    }],
    ["all-zero KV id", { ...installTarget, kvNamespaces: [{ binding: "SESSION", id: "0".repeat(32) }] }],
    ["missing KV id", { ...installTarget, kvNamespaces: [{ binding: "SESSION" }] }],
  ];
  for (const [label, target] of cases) {
    const result = checkDeployTarget(target);
    assert.equal(result.ok, false, `${label} must be refused`);
    assert.ok(result.ok === false && result.reasons[0], `${label} must say why`);
  }

  // The template's own names with real ids are a real install (Deploy button).
  assert.deepEqual(
    checkDeployTarget({
      ...installTarget,
      name: "adsbookcms",
      d1Databases: [{ binding: "OMS_DB", database_name: "adsbookcms-d1", database_id: "8f2c1a90-4d3b-4e1f-9a77-2b6c5d0e1f34" }],
    }),
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

// ---- the stale-tree half ----

const healthy: DeployPreflightState = {
  branch: "install/example",
  upstream: "origin/install/example",
  behind: 0,
  dirtyPaths: [],
  workerName: "example-store",
  overridden: false,
};

test("a tree that matches its branch deploys", () => {
  const result = evaluateDeployPreflight(healthy);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.ok(result.notes.some((note) => note.includes("example-store")));
});

test("a tree behind its upstream is refused, because deploying it reverts production", () => {
  // The failure this exists for. On 2026-08-28 a verified tracking fix was
  // deployed and then silently reverted 36 minutes later by a deploy from a
  // clone two commits behind. Both deploys reported success; the commit never
  // left the remote; production simply ran older code.
  const result = evaluateDeployPreflight({ ...healthy, behind: 2 });
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /2 commits behind origin\/install\/example/);
  assert.match(result.failures[0], /git pull --ff-only/);
});

test("uncommitted tracked changes are refused, so production never holds code no branch records", () => {
  const result = evaluateDeployPreflight({
    ...healthy,
    dirtyPaths: ["src/pages/thanks.astro", "src/lib/meta-capi.ts"],
  });
  assert.equal(result.ok, false);
  assert.match(result.failures[0], /2 tracked files have uncommitted changes/);
  assert.match(result.failures[0], /thanks\.astro/);
});

test("a long dirty list is summarised rather than dumped", () => {
  const result = evaluateDeployPreflight({
    ...healthy,
    dirtyPaths: ["a", "b", "c", "d", "e", "f", "g"],
  });
  assert.match(result.failures[0], /\+2 more/);
});

test("a Workers Builds deploy is the pushed commit, so the stale-clone checks stand down", () => {
  const result = evaluateDeployPreflight({
    ...healthy,
    branch: "",
    upstream: "",
    dirtyPaths: ["wrangler.jsonc"],
    ci: { branch: "main", commit: "abc1234" },
  });
  assert.equal(result.ok, true);
  assert.ok(result.notes.some((note) => /Workers Builds: commit abc1234 on main/.test(note)));
});

test("detached HEAD and an untracked branch are both refused", () => {
  const detached = evaluateDeployPreflight({ ...healthy, branch: "", upstream: "" });
  assert.equal(detached.ok, false);
  assert.match(detached.failures[0], /detached/);

  const untracked = evaluateDeployPreflight({ ...healthy, upstream: "" });
  assert.equal(untracked.ok, false);
  assert.match(untracked.failures[0], /tracks no remote/);
});

test("the override proceeds but states in full what it is overriding", () => {
  // A silent override would be worse than no check: the point is that the
  // record says production knowingly received a tree nobody's branch holds.
  const result = evaluateDeployPreflight({
    ...healthy,
    behind: 1,
    dirtyPaths: ["src/pages/thanks.astro"],
    overridden: true,
  });
  assert.equal(result.ok, true);
  assert.ok(result.notes.some((note) => note.includes("ALLOW_STALE_DEPLOY=1")));
  assert.ok(result.notes.some((note) => /1 commit behind/.test(note)));
  assert.ok(result.notes.some((note) => /uncommitted changes/.test(note)));
});

test("npm run deploy cannot skip the preflight", () => {
  // The guard is worth nothing if the documented deploy command bypasses it.
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts.predeploy, "npm run preflight:deploy");
  assert.equal(pkg.scripts["precf:deploy"], "npm run preflight:deploy");
  assert.match(pkg.scripts["preflight:deploy"], /scripts\/preflight-deploy\.ts/);
});
