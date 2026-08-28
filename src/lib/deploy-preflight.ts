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
  r2Buckets?: { binding?: unknown; bucket_name?: unknown }[];
};

export type PreflightResult =
  | { ok: true }
  | { ok: false; reasons: string[] };

/** The names this repository ships. Seeing one at deploy time is the bug. */
export const PRODUCT_PLACEHOLDER_PREFIX = "adsbookcms-your-store";
const ZERO_DATABASE_ID = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function checkDeployTarget(target: WranglerTarget): PreflightResult {
  const reasons: string[] = [];

  const name = text(target.name);
  if (!name) {
    reasons.push("wrangler.jsonc has no Worker `name`.");
  } else if (name === PRODUCT_PLACEHOLDER_PREFIX || name.startsWith(`${PRODUCT_PLACEHOLDER_PREFIX}-`)) {
    reasons.push(
      `Worker name is the product placeholder \`${name}\`. This install's own name was lost — most likely a merge from the product overwrote wrangler.jsonc.`,
    );
  }

  for (const database of target.d1Databases ?? []) {
    const id = text(database.database_id);
    const databaseName = text(database.database_name) || text(database.binding) || "D1";
    if (!id) {
      reasons.push(`D1 \`${databaseName}\` has no database_id.`);
    } else if (ZERO_DATABASE_ID.test(id)) {
      reasons.push(`D1 \`${databaseName}\` still carries the all-zero placeholder database_id.`);
    }
    if (text(database.database_name).startsWith(PRODUCT_PLACEHOLDER_PREFIX)) {
      reasons.push(`D1 \`${text(database.database_name)}\` is the product placeholder database name.`);
    }
  }

  for (const bucket of target.r2Buckets ?? []) {
    if (text(bucket.bucket_name).startsWith(PRODUCT_PLACEHOLDER_PREFIX)) {
      reasons.push(`R2 bucket \`${text(bucket.bucket_name)}\` is the product placeholder bucket name.`);
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
    r2Buckets: Array.isArray(parsed.r2_buckets)
      ? (parsed.r2_buckets as WranglerTarget["r2Buckets"])
      : [],
  };
}
