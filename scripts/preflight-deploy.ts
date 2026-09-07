/**
 * Runs before `npm run deploy` / `npm run cf:deploy` (npm `predeploy`).
 *
 * Two refusals, both decided in `src/lib/deploy-preflight.ts` where they are
 * unit-tested: the config must name a real install, not the product's
 * placeholders (RELEASE.md §7); and the tree must be the branch — not behind
 * its upstream, not carrying uncommitted tracked changes — because `wrangler
 * deploy` uploads whatever is on disk and has reverted production twice.
 *
 * It cannot cover a bare `npx wrangler deploy`: wrangler has no pre-deploy
 * hook, so RELEASE.md names `npm run deploy` as the deploy command. Anyone
 * reaching for wrangler directly is choosing to skip this. Refusing is the
 * whole job — it never deploys, and it holds no credentials.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  checkDeployTarget,
  evaluateDeployPreflight,
  parseWranglerConfig,
} from "../src/lib/deploy-preflight.ts";

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// The working tree's config, because that is the file wrangler itself reads —
// not `git show HEAD:…`, which would miss exactly the case where the checked-out
// config has drifted.
const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const target = parseWranglerConfig(config);
const targetResult = checkDeployTarget(target);
if (!targetResult.ok) {
  console.error("\npreflight: refusing to deploy.\n");
  for (const reason of targetResult.reasons) console.error(`  - ${reason}`);
  console.error(
    [
      "",
      "This repository is the AdsBookCMS product and deploys nothing (RELEASE.md §1).",
      "An install deploys from its own clone, against its own Worker, D1, KV and R2.",
      "",
      "If this IS an install: restore its wrangler.jsonc, then re-run.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).replace(/^HEAD$/, "");
const upstream = branch ? git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) : "";

// Without this the behind-count is whatever the last fetch happened to know —
// which is exactly the blind spot that let both reverted releases through.
if (upstream) {
  try {
    execFileSync("git", ["fetch", "--quiet", "origin"], { stdio: "ignore" });
  } catch {
    console.warn("[preflight] could not reach origin; comparing against the last known state.");
  }
}

const result = evaluateDeployPreflight({
  branch,
  upstream,
  behind: upstream ? Number(git(["rev-list", "--count", `HEAD..${upstream}`]) || "0") : 0,
  dirtyPaths: git(["diff", "--name-only", "HEAD"]).split("\n").map((l) => l.trim()).filter(Boolean),
  workerName: String(target.name ?? "unknown"),
  overridden: process.env.ALLOW_STALE_DEPLOY === "1",
});

for (const note of result.notes) console.log(`[preflight] ${note}`);
if (!result.ok) {
  console.error("\n[preflight] Refusing to deploy:\n");
  for (const failure of result.failures) console.error(`  ✖ ${failure}\n`);
  console.error(
    "  `wrangler deploy` uploads the working tree, not the branch. Set ALLOW_STALE_DEPLOY=1 only if\n" +
      "  you have decided that this tree, exactly as it is, belongs in production.\n",
  );
  process.exit(1);
}
// Not "tree matches the branch": on the override path it demonstrably does not.
console.log("[preflight] proceeding to deploy.\n");
