import { getEnvValue } from "./env.ts";
import {
  isStorefrontTemplateId,
  type StorefrontTemplateId,
} from "./tenant-contract.ts";

export interface PublicTenantConfig {
  slug: string;
  name: string;
  siteUrl: string;
  description: string;
  logo: string;
  tagline: string;
  themeColor: string;
  locale: string;
  openGraphLocale: string;
  defaultTitle: string;
  storefrontTemplate: StorefrontTemplateId;
  adminName: string;
}

/** Shape of the identity columns on the single `stores` row (migration 0036). */
export interface StoreIdentityRow {
  name?: string | null;
  slug?: string | null;
  site_url?: string | null;
  description?: string | null;
  logo?: string | null;
  tagline?: string | null;
  theme_color?: string | null;
  locale?: string | null;
  storefront_template?: string | null;
  admin_name?: string | null;
}

/**
 * Product defaults for an install that has not been configured yet. A real
 * install supplies these from its `stores` row, or failing that from
 * PUBLIC_SITE_* — these values exist so an unconfigured install describes
 * itself honestly instead of inheriting the identity of whichever store the
 * bundle was built from.
 *
 * `siteUrl` intentionally defaults to a placeholder origin: a wrong-but-obvious
 * canonical URL is easier to notice than one silently pointing at another store.
 */
const defaults = {
  slug: "adsbook",
  name: "AdsBookCMS Store",
  siteUrl: "https://example.com",
  description: "Storefront online yang belum dikonfigurasi.",
  // A neutral product mark, never a store's. An install that has not set its
  // own logo must announce that it is unconfigured, not wear someone else's
  // brand — /images/logo.webp belongs to whichever store supplied it.
  logo: "/images/adsbook-mark.webp",
  tagline: "",
  themeColor: "#111111",
  locale: "id-ID",
  storefrontTemplate: "compact-market" as StorefrontTemplateId,
  adminName: "AdsBookCMS Admin",
} as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolution order for every field: the database, then the environment, then
 * the product default. A NULL column means "not configured here" rather than
 * "blank", which is what lets an install that predates migration 0036 keep
 * rendering from its environment unchanged.
 */
function pick(dbValue: unknown, envKey: string, fallback: string): string {
  return text(dbValue) || getEnvValue(envKey) || fallback;
}

function siteOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    ) {
      return url.origin;
    }
  } catch {
    // Fall through to the placeholder origin.
  }
  return defaults.siteUrl;
}

function themeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : defaults.themeColor;
}

function locale(value: string): string {
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(value) ? value : defaults.locale;
}

/**
 * An unknown template used to throw at module load, which in a Worker means
 * every route returns 500. Now that the value can come from a database an
 * operator edits, a single bad row must not take a storefront offline — so it
 * degrades to the default and says so in the logs.
 */
function storefrontTemplate(value: string): StorefrontTemplateId {
  if (isStorefrontTemplateId(value)) return value;
  console.error("tenant-unknown-storefront-template", value);
  return defaults.storefrontTemplate;
}

/**
 * Builds the public identity from an optional `stores` row. Pass `null` for a
 * database that has no row yet — a fresh install before the wizard has run.
 */
export function resolveTenantConfig(
  row: StoreIdentityRow | null | undefined,
): Readonly<PublicTenantConfig> {
  const name = pick(row?.name, "PUBLIC_SITE_NAME", defaults.name);
  const tagline = pick(row?.tagline, "PUBLIC_SITE_TAGLINE", defaults.tagline);
  const resolvedLocale = locale(
    pick(row?.locale, "PUBLIC_SITE_LOCALE", defaults.locale),
  );

  return Object.freeze({
    slug: pick(row?.slug, "PUBLIC_TENANT_SLUG", defaults.slug),
    name,
    siteUrl: siteOrigin(pick(row?.site_url, "PUBLIC_SITE_URL", defaults.siteUrl)),
    description: pick(
      row?.description,
      "PUBLIC_SITE_DESCRIPTION",
      defaults.description,
    ),
    logo: pick(row?.logo, "PUBLIC_SITE_LOGO", defaults.logo),
    tagline,
    themeColor: themeColor(
      pick(row?.theme_color, "PUBLIC_SITE_THEME_COLOR", defaults.themeColor),
    ),
    locale: resolvedLocale,
    openGraphLocale: resolvedLocale.replace("-", "_"),
    defaultTitle: tagline ? `${name} - ${tagline}` : name,
    storefrontTemplate: storefrontTemplate(
      pick(
        row?.storefront_template,
        "PUBLIC_STOREFRONT_TEMPLATE",
        defaults.storefrontTemplate,
      ),
    ),
    adminName: pick(row?.admin_name, "PUBLIC_ADMIN_NAME", defaults.adminName),
  });
}

/**
 * The three states a database can be in, which callers must not conflate:
 *
 * - `installed`   — a store row exists.
 * - `uninstalled` — the query worked and there is no row. No migration ever
 *                   inserts one, so this is exactly a database that has been
 *                   migrated but never set up. It is what routes an operator
 *                   to the install wizard.
 * - `unknown`     — the query failed. A broken database must never be mistaken
 *                   for an empty one, or a transient fault would send a live
 *                   store to the installer.
 */
export type StoreIdentityRead =
  | { state: "installed"; row: StoreIdentityRow }
  | { state: "uninstalled" }
  | { state: "unknown" };

export async function readStoreIdentity(
  database: D1Database,
): Promise<StoreIdentityRead> {
  try {
    const row = await database
      .prepare(
        "SELECT name, slug, site_url, description, logo, tagline, theme_color, locale, storefront_template, admin_name FROM stores ORDER BY id LIMIT 1",
      )
      .first<StoreIdentityRow>();
    return row ? { state: "installed", row } : { state: "uninstalled" };
  } catch (error) {
    console.error("tenant-identity-load", error);
    return { state: "unknown" };
  }
}

/**
 * Reads the single `stores` row. Returns null when the table is empty or
 * unreadable — both mean "fall back to the environment", which is the correct
 * behaviour for identity resolution. Use `readStoreIdentity` where the
 * difference between empty and broken matters.
 */
export async function loadStoreIdentity(
  database: D1Database,
): Promise<StoreIdentityRow | null> {
  const read = await readStoreIdentity(database);
  return read.state === "installed" ? read.row : null;
}

/**
 * Identity resolved from the environment alone, with no database. Used before
 * middleware has run and by build-time tooling such as the catalog feeds.
 */
export const envTenantConfig: Readonly<PublicTenantConfig> =
  resolveTenantConfig(null);
