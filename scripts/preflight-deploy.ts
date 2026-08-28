/**
 * Runs before `npm run deploy` / `npm run cf:deploy` (npm `pre*` hooks).
 *
 * See `src/lib/deploy-preflight.ts` for why this exists: RELEASE.md §7 already
 * requires this check and states that nothing enforces it. Refusing is the
 * whole job — it never deploys, and it holds no credentials.
 */
import { readFile } from "node:fs/promises";
import { checkDeployTarget, parseWranglerConfig } from "../src/lib/deploy-preflight.ts";

const configPath = new URL("../wrangler.jsonc", import.meta.url);

try {
  const target = parseWranglerConfig(await readFile(configPath, "utf8"));
  const result = checkDeployTarget(target);
  if (result.ok) {
    console.log(`preflight: deploying to Worker \`${String(target.name)}\` — no product placeholder found.`);
    process.exit(0);
  }
  console.error("\npreflight: refusing to deploy.\n");
  for (const reason of result.reasons) console.error(`  - ${reason}`);
  console.error(
    [
      "",
      "This repository is the AdsBookCMS product and deploys nothing (RELEASE.md §1).",
      "An install deploys from its own clone, against its own Worker, D1, KV and R2.",
      "",
      "If this IS an install: restore its wrangler.jsonc, then re-run.",
      "Confirm the resolved target first with `npx wrangler deploy --dry-run`.",
      "",
    ].join("\n"),
  );
  process.exit(1);
} catch (error) {
  console.error("preflight: could not read wrangler.jsonc —", error instanceof Error ? error.message : error);
  process.exit(1);
}
