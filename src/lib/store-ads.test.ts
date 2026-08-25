import assert from "node:assert/strict";
import test from "node:test";
import {
  getStoreAdsConfig,
  hasValidGoogleAdsConversion,
} from "./store-ads.ts";

/**
 * Audit 2026-08-23 §2.6: this module resolves the pixel id, CAPI token and
 * Google identifiers every tracking path depends on, and a silent
 * misresolution disables tracking store-wide without failing loudly. These
 * tests pin the resolution order and the failure behaviour rather than the
 * shape of the row.
 */

type StoreRow = Record<string, string | null> | null;

function storeDatabase(row: StoreRow, options: { throws?: boolean } = {}) {
  return {
    prepare() {
      return {
        async first() {
          if (options.throws) throw new Error("no such table: stores");
          return row;
        },
      };
    },
  } as unknown as D1Database;
}

/**
 * `getEnvValue` falls back to `process.env`, and `wrangler.jsonc` declares
 * these very names as dev secrets loaded from the shell — so a developer who
 * exported one to run `wrangler dev` would otherwise fail this suite. Every
 * test states its whole environment through `runtimeEnv`; nothing may leak in.
 */
const ADS_ENV_KEYS = [
  "NEXT_PUBLIC_FB_PIXEL_ID",
  "PUBLIC_FB_PIXEL_ID",
  "FB_PIXEL_ID",
  "META_PIXEL_ID",
  "META_CAPI_ACCESS_TOKEN",
  "META_CAPI_TOKEN",
  "PUBLIC_GTM_ID",
  "GTM_ID",
  "GOOGLE_ADS_CONVERSION_ID",
  "GOOGLE_ADS_CONVERSION_LABEL",
] as const;

function withoutAdsSecrets(context: { after: (fn: () => void) => void }) {
  const saved = new Map<string, string | undefined>();
  for (const key of ADS_ENV_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  context.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

const CONFIGURED_ROW = {
  meta_pixel_id: "111111111111111",
  meta_capi_token: "db-capi-token",
  google_tag_manager_id: "GTM-DBSTORE",
  google_ads_conversion_id: "AW-111111111",
  google_ads_conversion_label: "db-label",
};

test("the store's own configuration wins over a leftover Worker secret", async (context) => {
  withoutAdsSecrets(context);
  const config = await getStoreAdsConfig({
    runtimeEnv: {
      OMS_DB: storeDatabase(CONFIGURED_ROW),
      // A stale deploy-time secret from another store must never override what
      // this store set in its dashboard.
      META_PIXEL_ID: "999999999999999",
      META_CAPI_ACCESS_TOKEN: "env-capi-token",
      GTM_ID: "GTM-ENVONLY",
      GOOGLE_ADS_CONVERSION_ID: "AW-999999999",
      GOOGLE_ADS_CONVERSION_LABEL: "env-label",
    },
  } as never);

  assert.deepEqual(config, {
    metaPixelId: "111111111111111",
    metaCapiToken: "db-capi-token",
    googleTagManagerId: "GTM-DBSTORE",
    googleAdsConversionId: "AW-111111111",
    googleAdsConversionLabel: "db-label",
  });
});

test("a store row that leaves a field blank falls through to the environment", async (context) => {
  withoutAdsSecrets(context);
  const config = await getStoreAdsConfig({
    runtimeEnv: {
      OMS_DB: storeDatabase({
        ...CONFIGURED_ROW,
        meta_capi_token: "",
        google_tag_manager_id: null,
      }),
      META_CAPI_ACCESS_TOKEN: "env-capi-token",
      GTM_ID: "GTM-ENVONLY",
    },
  } as never);

  assert.equal(config.metaPixelId, "111111111111111");
  assert.equal(config.metaCapiToken, "env-capi-token");
  assert.equal(config.googleTagManagerId, "GTM-ENVONLY");
});

test("Google Ads direct conversion requires a valid complete destination", async (context) => {
  withoutAdsSecrets(context);
  assert.equal(hasValidGoogleAdsConversion("AW-111111111", "valid_label-1"), true);
  assert.equal(hasValidGoogleAdsConversion("AW-111111111", ""), false);
  assert.equal(hasValidGoogleAdsConversion("G-111111111", "valid_label-1"), false);
  assert.equal(hasValidGoogleAdsConversion("AW-111111111", "not valid"), false);

  const config = await getStoreAdsConfig({
    runtimeEnv: {
      OMS_DB: storeDatabase(null),
      GOOGLE_ADS_CONVERSION_ID: "AW-111111111",
      GOOGLE_ADS_CONVERSION_LABEL: "not valid",
    },
  } as never);
  assert.equal(config.googleAdsConversionId, "");
  assert.equal(config.googleAdsConversionLabel, "");
});

test("every documented pixel alias resolves, so one spelling does not silently disable tracking", async (context) => {
  withoutAdsSecrets(context);
  const aliases = [
    "NEXT_PUBLIC_FB_PIXEL_ID",
    "PUBLIC_FB_PIXEL_ID",
    "FB_PIXEL_ID",
    "META_PIXEL_ID",
  ];

  for (const alias of aliases) {
    const config = await getStoreAdsConfig({
      runtimeEnv: { OMS_DB: storeDatabase(null), [alias]: "222222222222222" },
    } as never);
    assert.equal(config.metaPixelId, "222222222222222", `alias ${alias}`);
  }
});

test("the first pixel alias wins when several are set", async (context) => {
  withoutAdsSecrets(context);
  const config = await getStoreAdsConfig({
    runtimeEnv: {
      OMS_DB: storeDatabase(null),
      NEXT_PUBLIC_FB_PIXEL_ID: "111",
      PUBLIC_FB_PIXEL_ID: "222",
      FB_PIXEL_ID: "333",
      META_PIXEL_ID: "444",
    },
  } as never);
  assert.equal(config.metaPixelId, "111");
});

test("a failed store read degrades to the environment instead of throwing", async (context) => {
  withoutAdsSecrets(context);
  // The read is wrapped in a bare catch, so a schema problem must not take the
  // tracking path down with it — but it must also not invent a value.
  const config = await getStoreAdsConfig({
    runtimeEnv: {
      OMS_DB: storeDatabase(null, { throws: true }),
      META_PIXEL_ID: "333333333333333",
      META_CAPI_ACCESS_TOKEN: "env-capi-token",
    },
  } as never);

  assert.equal(config.metaPixelId, "333333333333333");
  assert.equal(config.metaCapiToken, "env-capi-token");
});

test("an unconfigured store resolves to empty strings, never undefined", async (context) => {
  withoutAdsSecrets(context);
  // Callers gate on truthiness and interpolate these into tag payloads; a
  // literal "undefined" pixel id would be worse than none.
  const config = await getStoreAdsConfig({
    runtimeEnv: { OMS_DB: storeDatabase(null) },
  } as never);

  for (const [key, value] of Object.entries(config)) {
    assert.equal(typeof value, "string", key);
    assert.equal(value, "", key);
  }
});
