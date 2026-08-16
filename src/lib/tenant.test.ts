import test from "node:test";
import assert from "node:assert/strict";

import {
  envTenantConfig,
  loadStoreIdentity,
  resolveTenantConfig,
  type StoreIdentityRow,
} from "./tenant.ts";

test("a database row wins over the environment for every identity field", () => {
  const row: StoreIdentityRow = {
    name: "Toko Bunga",
    slug: "toko-bunga",
    site_url: "https://tokobunga.example",
    description: "Karangan bunga segar",
    logo: "/images/toko-bunga.webp",
    tagline: "Bunga Setiap Hari",
    theme_color: "#A31F34",
    locale: "en-US",
    storefront_template: "wide-catalog",
    admin_name: "Toko Bunga Ops",
  };

  const tenant = resolveTenantConfig(row);

  assert.equal(tenant.name, "Toko Bunga");
  assert.equal(tenant.slug, "toko-bunga");
  assert.equal(tenant.siteUrl, "https://tokobunga.example");
  assert.equal(tenant.description, "Karangan bunga segar");
  assert.equal(tenant.logo, "/images/toko-bunga.webp");
  assert.equal(tenant.tagline, "Bunga Setiap Hari");
  assert.equal(tenant.themeColor, "#A31F34");
  assert.equal(tenant.locale, "en-US");
  assert.equal(tenant.openGraphLocale, "en_US");
  assert.equal(tenant.storefrontTemplate, "wide-catalog");
  assert.equal(tenant.adminName, "Toko Bunga Ops");
  assert.equal(tenant.defaultTitle, "Toko Bunga - Bunga Setiap Hari");
});

test("a null or empty column falls back rather than blanking the field", () => {
  // This is what lets an install that predates migration 0036 keep rendering:
  // its columns are all NULL, so every field resolves from the environment.
  const fromNothing = resolveTenantConfig(null);
  assert.equal(fromNothing.name, envTenantConfig.name);
  assert.equal(fromNothing.siteUrl, envTenantConfig.siteUrl);

  // A column present but blank must behave as unset, not as an empty name.
  const blank = resolveTenantConfig({ name: "   ", logo: "" });
  assert.equal(blank.name, envTenantConfig.name);
  assert.equal(blank.logo, envTenantConfig.logo);

  // A partially configured row takes only what it actually declares.
  const partial = resolveTenantConfig({ name: "Setengah Jadi" });
  assert.equal(partial.name, "Setengah Jadi");
  assert.equal(partial.siteUrl, envTenantConfig.siteUrl);
});

test("an invalid stored value degrades instead of taking the storefront down", () => {
  // Every one of these used to be impossible: the values came from a build. Now
  // an operator can type them, so each must fail soft.
  const tenant = resolveTenantConfig({
    site_url: "http://not-https.example/with/path",
    theme_color: "rebeccapurple",
    locale: "not a locale",
    storefront_template: "does-not-exist",
  });

  assert.equal(tenant.siteUrl, "https://example.com", "non-https URL rejected");
  assert.equal(tenant.themeColor, "#111111", "invalid colour rejected");
  assert.equal(tenant.locale, "id-ID", "invalid locale rejected");
  assert.equal(
    tenant.storefrontTemplate,
    "compact-market",
    "unknown template degrades to the default rather than throwing",
  );
});

test("an unknown storefront template no longer throws", () => {
  // It used to throw at module load, which in a Worker means every route
  // returns 500 — a single bad database row would have taken the store offline.
  assert.doesNotThrow(() =>
    resolveTenantConfig({ storefront_template: "🙂" }),
  );
});

test("identity reads survive a missing table and a failing database", async () => {
  const throwing = {
    prepare() {
      throw new Error("no such table: stores");
    },
  } as unknown as D1Database;
  assert.equal(await loadStoreIdentity(throwing), null);

  const empty = {
    prepare: () => ({ first: async () => null }),
  } as unknown as D1Database;
  assert.equal(await loadStoreIdentity(empty), null);

  // A null read must still produce a usable identity, because that is exactly
  // the state of a database on its very first request.
  assert.equal(resolveTenantConfig(null).name, envTenantConfig.name);
});

test("the resolved config is frozen so a page cannot mutate shared identity", () => {
  const tenant = resolveTenantConfig({ name: "Toko Beku" });
  assert.throws(() => {
    (tenant as { name: string }).name = "diubah";
  }, TypeError);
});
