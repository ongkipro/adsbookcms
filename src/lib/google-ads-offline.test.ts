import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleClickConversion,
  decideGoogleRetry,
  readGoogleAdsOfflineConfig,
  uploadGoogleClickConversion,
} from "./google-ads-offline.ts";

const CONFIG = {
  customerId: "1234567890",
  conversionActionId: "987654321",
  developerToken: "developer-token",
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  loginCustomerId: "1122334455",
  startAt: "2026-08-25T00:00:00.000Z",
};

const ORDER = {
  id: 42,
  order_number: "INV-10042",
  payment_method: "cod",
  payment_status: "unpaid",
  shipping_status: "delivered",
  created_at: "2026-08-25T01:00:00.000Z",
  ad_click_ids: JSON.stringify({ gclid: "Cj0KCQ_valid-click" }),
  product_value: 249000,
};

test("offline config is all-or-nothing and requires an explicit backfill boundary", () => {
  assert.deepEqual(readGoogleAdsOfflineConfig({
    GOOGLE_ADS_CUSTOMER_ID: "123-456-7890",
    GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_ID: "987654321",
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: "112-233-4455",
    GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
    GOOGLE_ADS_CLIENT_ID: "client-id",
    GOOGLE_ADS_CLIENT_SECRET: "client-secret",
    GOOGLE_ADS_REFRESH_TOKEN: "refresh-token",
    GOOGLE_ADS_OFFLINE_START_AT: "2026-08-25T00:00:00.000Z",
  }), CONFIG);
  assert.equal(readGoogleAdsOfflineConfig({
    GOOGLE_ADS_CUSTOMER_ID: "1234567890",
    GOOGLE_ADS_OFFLINE_CONVERSION_ACTION_ID: "987654321",
  }), null);
});

test("COD delivered and online paid produce one click conversion with merchandise value", () => {
  const observedAt = new Date("2026-08-25T02:03:04.000Z");
  const cod = buildGoogleClickConversion(ORDER, CONFIG, observedAt);
  assert.deepEqual(cod, {
    qualification: "cod_delivered",
    conversion: {
      conversionAction: "customers/1234567890/conversionActions/987654321",
      conversionDateTime: "2026-08-25 02:03:04+00:00",
      conversionValue: 249000,
      currencyCode: "IDR",
      orderId: "INV-10042",
      gclid: "Cj0KCQ_valid-click",
    },
  });
  const online = buildGoogleClickConversion({
    ...ORDER,
    payment_method: "qris",
    payment_status: "paid",
    shipping_status: "pending",
    ad_click_ids: JSON.stringify({ gbraid: "0AAAA_valid" }),
  }, CONFIG, observedAt);
  assert.equal(online?.qualification, "online_paid");
  assert.equal(online?.conversion.gbraid, "0AAAA_valid");
});

test("unqualified, unattributed, and valueless orders never enter the outbox", () => {
  const observedAt = new Date("2026-08-25T02:03:04.000Z");
  assert.equal(buildGoogleClickConversion({ ...ORDER, shipping_status: "shipped" }, CONFIG, observedAt), null);
  assert.equal(buildGoogleClickConversion({ ...ORDER, ad_click_ids: null }, CONFIG, observedAt), null);
  assert.equal(buildGoogleClickConversion({ ...ORDER, product_value: 0 }, CONFIG, observedAt), null);
});

test("retry policy retries rate limits and network failures but stops permanent client errors", () => {
  assert.deepEqual(decideGoogleRetry(true, 200, 0, 5), { status: "sent", delayMs: 0 });
  assert.deepEqual(decideGoogleRetry(false, 429, 0, 5), { status: "pending", delayMs: 900000 });
  assert.deepEqual(decideGoogleRetry(false, 400, 0, 5), { status: "failed", delayMs: 0 });
  assert.equal(decideGoogleRetry(false, undefined, 1, 5).status, "pending");
  assert.equal(decideGoogleRetry(false, 500, 4, 5).status, "failed");
});

test("sender refreshes OAuth and uploads through the pinned Google Ads API contract", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 });
    }
    return new Response(JSON.stringify({ results: [{}] }), { status: 200 });
  };
  const built = buildGoogleClickConversion(ORDER, CONFIG, new Date("2026-08-25T02:03:04.000Z"));
  assert.ok(built);
  const result = await uploadGoogleClickConversion(built.conversion, CONFIG);
  assert.equal(result.success, true);
  assert.equal(requests[1].url, "https://googleads.googleapis.com/v25/customers/1234567890:uploadClickConversions");
  const headers = new Headers(requests[1].init?.headers);
  assert.equal(headers.get("developer-token"), "developer-token");
  assert.equal(headers.get("login-customer-id"), "1122334455");
  assert.equal(headers.get("authorization"), "Bearer access-token");
  const body = JSON.parse(String(requests[1].init?.body));
  assert.deepEqual(body, { conversions: [built.conversion], partialFailure: true });
});
