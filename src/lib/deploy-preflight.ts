/**
 * The check `RELEASE.md` §7 already requires before a deploy, made mechanical.
 *
 * `wrangler deploy` uploads to whatever `wrangler.jsonc` names, and this
 * repository's copy is deliberately placeholders — `adsbookcms-your-store`, a
 * database id of all zeros — because the product deploys nothing (ADR-012).
 * An install is a clone that replaces them with its own, so `npm run deploy`
 * is the install's documented deploy path and stays.
 *
 * The hazard is that a merge from the product brings the placeholders back.
 * RELEASE.md tells the operator to run `--dry-run` and stop if it prints
 * `adsbookcms-your-store` or a zero database id — and then says plainly: "It is
 * manual, and nothing verifies that an install ran it." This is that
 * verification. It adds no deploy step, no credentials, and no policy the
 * release document does not already state; it refuses the one target the
 * document already says to refuse.
 *
 * Pure on purpose: the decision is testable without a filesystem or wrangler.
 */

export type WranglerTarget = {
  /** `name` in wrangler.jsonc — the Worker this deploy would replace. */
  name?: unknown;
  d1Databases?: { binding?: unknown; database_name?: unknown; database_id?: unknown }[];
  kvNamespaces?: { binding?: unknown; id?: unknown }[];
  r2Buckets?: { binding?: unknown; bucket_name?: unknown }[];
};

export type PreflightResult =
  | { ok: true }
  | { ok: false; reasons: string[] };

/**
 * What an overwritten config looks like. The product template ships all-zero
 * ids (the Deploy button replaces them with real ones), so a merge that drags
 * the template back over an install's wrangler.jsonc always brings zeros. The
 * Worker and resource *names* are no longer a signal: since ADR-026 the
 * template's names are real defaults an operator may keep.
 *
 * A missing id is refused too, and is the more dangerous case: Wrangler's
 * automatic provisioning would create a new, empty database and point the live
 * store at it.
 */
const ZERO_DATABASE_ID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;
const ZERO_KV_ID = /^0{32}$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function checkDeployTarget(target: WranglerTarget): PreflightResult {
  const reasons: string[] = [];

  if (!text(target.name)) reasons.push("wrangler.jsonc has no Worker `name`.");

  const databases = target.d1Databases ?? [];
  if (databases.length === 0) reasons.push("wrangler.jsonc declares no D1 database.");
  for (const database of databases) {
    const id = text(database.database_id);
    const databaseName = text(database.database_name) || text(database.binding) || "D1";
    if (!id) {
      reasons.push(`D1 \`${databaseName}\` has no database_id; deploying would provision a new, empty database.`);
    } else if (ZERO_DATABASE_ID.test(id)) {
      reasons.push(`D1 \`${databaseName}\` still carries the all-zero template database_id — this config is the product template, or a merge overwrote the install's own.`);
    }
  }

  for (const namespace of target.kvNamespaces ?? []) {
    const id = text(namespace.id);
    const binding = text(namespace.binding) || "KV";
    if (!id) {
      reasons.push(`KV \`${binding}\` has no id; deploying would provision a new, empty namespace.`);
    } else if (ZERO_KV_ID.test(id)) {
      reasons.push(`KV \`${binding}\` still carries the all-zero template id.`);
    }
  }

  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/**
 * `wrangler.jsonc` is JSONC: comments and trailing commas are legal there and
 * fatal to `JSON.parse`. Stripping them is enough for the few fields read here;
 * this is not a general JSONC parser and does not need to be.
 */
export function parseWranglerConfig(source: string): WranglerTarget {
  const withoutComments = source
    .replace(/"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) =>
      match.startsWith('"') ? match : " ",
    )
    .replace(/,(\s*[}\]])/g, "$1");
  const parsed = JSON.parse(withoutComments) as Record<string, unknown>;
  return {
    name: parsed.name,
    d1Databases: Array.isArray(parsed.d1_databases)
      ? (parsed.d1_databases as WranglerTarget["d1Databases"])
      : [],
    kvNamespaces: Array.isArray(parsed.kv_namespaces)
      ? (parsed.kv_namespaces as WranglerTarget["kvNamespaces"])
      : [],
    r2Buckets: Array.isArray(parsed.r2_buckets)
      ? (parsed.r2_buckets as WranglerTarget["r2Buckets"])
      : [],
  };
}

/*
 * The second check. `checkDeployTarget` above asks "is this config a real
 * install"; this asks "is the tree about to be uploaded actually the branch
 * everyone agreed on". `wrangler deploy` uploads the working tree, not the
 * branch, and that has cost the fleet twice: on 2026-08-28 an install's
 * verified fix was silently reverted 36 minutes later by a deploy from a
 * clone that had not pulled it, and on 2026-09-05 a deploy from a stale clone
 * removed a live landing page from another. Nothing failed either time. Both
 * deploys reported success and production ran code the branch did not hold.
 *
 * Pure on purpose: the script collects the git facts, this decides.
 */

export type DeployPreflightState = {
  /** Branch at HEAD, or "" when detached. */
  branch: string;
  /** Its upstream, e.g. `origin/install/<store>`, or "" when untracked. */
  upstream: string;
  /** Commits the upstream has that HEAD does not. The reverted-release case. */
  behind: number;
  /** Tracked paths with uncommitted modifications. Untracked files are fine. */
  dirtyPaths: string[];
  /** Worker name wrangler resolved for this deploy. */
  workerName: string;
  /** `ALLOW_STALE_DEPLOY=1` — a deliberate, stated exception. */
  overridden: boolean;
  /**
   * Workers Builds (`WORKERS_CI=1`): the tree is the pushed commit by
   * construction, so the stale-clone checks have nothing to protect.
   */
  ci?: { branch: string; commit: string };
};

export type DeployPreflightResult = {
  ok: boolean;
  /** Empty when ok. Each entry is a sentence a human can act on. */
  failures: string[];
  /** Non-blocking notes, always reported. */
  notes: string[];
};

export function evaluateDeployPreflight(
  state: DeployPreflightState,
): DeployPreflightResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // Both incidents this guards against were laptop clones that had not pulled.
  // A Workers Builds deploy checks out exactly the commit that was pushed.
  if (state.ci) {
    notes.push(`Target worker: ${state.workerName}`);
    notes.push(`Workers Builds: commit ${state.ci.commit || "unknown"} on ${state.ci.branch || "unknown branch"}`);
    return { ok: true, failures, notes };
  }

  if (!state.branch) {
    failures.push(
      "HEAD is detached, so there is no branch to compare against. Check out the install branch first.",
    );
  } else if (!state.upstream) {
    failures.push(
      `Branch "${state.branch}" tracks no remote, so a stale tree cannot be detected. Set an upstream first.`,
    );
  } else if (state.behind > 0) {
    failures.push(
      `HEAD is ${state.behind} commit${state.behind === 1 ? "" : "s"} behind ${state.upstream}. ` +
        `Deploying now uploads this tree and reverts whatever those commits changed — run \`git pull --ff-only\` first.`,
    );
  }

  if (state.dirtyPaths.length > 0) {
    const shown = state.dirtyPaths.slice(0, 5).join(", ");
    const rest = state.dirtyPaths.length > 5 ? `, +${state.dirtyPaths.length - 5} more` : "";
    failures.push(
      `${state.dirtyPaths.length} tracked file${state.dirtyPaths.length === 1 ? " has" : "s have"} uncommitted changes (${shown}${rest}). ` +
        `Whatever is on disk is what ships, so commit it or stash it — do not let production hold code no branch records.`,
    );
  }

  notes.push(`Target worker: ${state.workerName}`);
  if (state.upstream) notes.push(`Tree: ${state.branch} against ${state.upstream}`);

  if (failures.length > 0 && state.overridden) {
    return {
      ok: true,
      failures: [],
      notes: [
        ...notes,
        "ALLOW_STALE_DEPLOY=1 — proceeding despite:",
        ...failures.map((failure) => `  - ${failure}`),
      ],
    };
  }

  return { ok: failures.length === 0, failures, notes };
}
