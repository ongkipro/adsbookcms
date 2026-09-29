import assert from "node:assert/strict";
import test from "node:test";

import { geoHeadersFromCf, resolveGeoLocation } from "./geo.ts";

function requestWithCf(cf: Record<string, unknown>, headers: Record<string, string> = {}) {
  const request = new Request("https://example.test/", { headers }) as Request & {
    cf?: Record<string, unknown>;
  };
  request.cf = cf;
  return request;
}

test("resolveGeoLocation reads province from request.cf.regionCode first", async () => {
  const result = await resolveGeoLocation(
    requestWithCf({ regionCode: "JK", city: "Jakarta", country: "ID" }),
  );
  assert.equal(result.source, "cloudflare");
  assert.equal(result.provinceCode, "JK");
  assert.equal(result.province, "DKI Jakarta");
  assert.equal(result.city, "Jakarta");
});

test("resolveGeoLocation falls back to cf-region-code headers when request.cf carries nothing usable", async () => {
  const result = await resolveGeoLocation(
    requestWithCf({}, { "cf-region-code": "JK", "cf-ipcity": "Jakarta", "cf-ipcountry": "ID" }),
  );
  assert.equal(result.source, "cloudflare");
  assert.equal(result.provinceCode, "JK");
  assert.equal(result.city, "Jakarta");
});

test("resolveGeoLocation falls back to the custom x-user-province header, marked as 'header' not 'cloudflare'", async () => {
  const result = await resolveGeoLocation(
    requestWithCf({}, { "x-user-province": "DKI Jakarta", "x-user-city": "Jakarta" }),
  );
  assert.equal(result.source, "header");
  assert.equal(result.provinceCode, "JK");
  assert.equal(result.city, "Jakarta");
});

test("resolveGeoLocation returns an empty fallback when no signal resolves to a known province, never throwing", async () => {
  const result = await resolveGeoLocation(requestWithCf({}, {}));
  assert.deepEqual(result, {
    province: "",
    provinceCode: "",
    city: "",
    country: "ID",
    source: "fallback",
  });
});

test("an unrecognized cf.regionCode does not block the header fallback from being tried", async () => {
  const result = await resolveGeoLocation(
    requestWithCf({ regionCode: "ZZ" }, { "cf-region-code": "JK" }),
  );
  assert.equal(result.source, "cloudflare");
  assert.equal(result.provinceCode, "JK");
});

test("a request rebuilt for a rewrite keeps the visitor's province", async () => {
  // /produk/<slug> hands off to the landing serving as the product page with a
  // new Request, which has no `cf`. The landing's hybrid form then saw no
  // province and showed every buyer the full form.
  const original = requestWithCf({ regionCode: "JT", region: "East Java", city: "Surabaya", country: "ID" });
  const bare = new Request("https://example.test/landing");
  assert.equal((await resolveGeoLocation(bare)).provinceCode, "", "a rebuilt request alone has no province");

  const rebuilt = new Request("https://example.test/landing", { headers: geoHeadersFromCf(original) });
  const geo = await resolveGeoLocation(rebuilt);
  assert.equal(geo.provinceCode, "JT");
  assert.equal(geo.city, "Surabaya");
  // Nothing is invented when Cloudflare supplied nothing.
  assert.deepEqual(geoHeadersFromCf(new Request("https://example.test/")), {});
});

test("the product-page rewrite forwards the visitor's location", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../pages/produk/[slug].astro", import.meta.url), "utf8");
  assert.match(page, /Astro\.rewrite\([\s\S]*\.\.\.geoHeadersFromCf\(Astro\.request\)/);
});
