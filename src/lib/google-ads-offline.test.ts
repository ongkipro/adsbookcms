import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildGoogleClickConversion,
  classifyGooglePartialFailure,
  decideGoogleRetry,
  drainGoogleAdsConversionOutbox,
  purgeExpiredGoogleAdsConversions,
  readConversionUploadErrorCodes,
  readGoogleAdsOfflineConfig,
  reconcileGoogleAdsConversions,
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

/**
 * The regression this file did not have: `reconcileGoogleAdsConversions` was
 * never exercised against a database at all, only its pure helpers were, and
 * the query and the builder had drifted apart. The query returned every
 * qualified order; the builder refused the ones with no Google click. A refused
 * order writes no outbox row, so it was still unqueued — and still first in
 * line — on the next hourly pass. Fifty organic delivered COD orders, an
 * ordinary week for a COD store, pinned the window shut permanently.
 *
 * The scenario below is that week: sixty organic delivered orders ahead of one
 * real Google click. Repeated passes prove the queue advances rather than
 * re-reading the same head.
 */
class ReconcileStatement {
  sqlite: DatabaseSync;
  sql: string;
  values: unknown[];

  constructor(sqlite: DatabaseSync, sql: string, values: unknown[] = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]) {
    return new ReconcileStatement(this.sqlite, this.sql, values);
  }

  async all<T>() {
    return {
      success: true,
      results: this.sqlite.prepare(this.sql).all(...(this.values as never[])) as T[],
      meta: { changes: 0, last_row_id: 0 },
    };
  }

  async run() {
    const result = this.sqlite.prepare(this.sql).run(...(this.values as never[]));
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

test("reconciliation advances past orders that carry no Google click", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY, order_number TEXT NOT NULL, payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL, shipping_status TEXT NOT NULL,
      created_at TEXT NOT NULL, ad_click_ids TEXT
    );
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL,
      unit_price INTEGER NOT NULL, quantity INTEGER NOT NULL
    );
  `);
  sqlite.exec(
    readFileSync(
      new URL("../db/migrations/0048_google_ads_conversion_outbox.sql", import.meta.url),
      "utf8",
    ).replaceAll("--> statement-breakpoint", ""),
  );

  const insertOrder = (id: number, clickIds: string | null) => {
    sqlite
      .prepare(
        `INSERT INTO orders VALUES (?, ?, 'cod', 'unpaid', 'delivered', '2026-08-26T00:00:00.000Z', ?)`,
      )
      .run(id, `INV-${10000 + id}`, clickIds);
    sqlite.prepare(`INSERT INTO order_items VALUES (?, ?, 100000, 1)`).run(id, id);
  };
  // More organic orders than one reconciliation window holds.
  for (let id = 1; id <= 60; id += 1) insertOrder(id, null);
  insertOrder(61, JSON.stringify({ utm_source: "instagram" }));
  insertOrder(62, JSON.stringify({ gclid: "Cj0KCQ_real-click" }));

  const database = {
    prepare: (sql: string) => new ReconcileStatement(sqlite, sql),
  } as unknown as D1Database;

  const queued = await reconcileGoogleAdsConversions(
    database,
    CONFIG,
    new Date("2026-08-27T00:00:00.000Z"),
  );
  assert.equal(queued, 1);

  const rows = sqlite
    .prepare(`SELECT order_number, qualification FROM google_ads_conversion_outbox`)
    .all() as { order_number: string; qualification: string }[];
  assert.deepEqual(
    rows.map((row) => ({ order_number: row.order_number, qualification: row.qualification })),
    [{ order_number: "INV-10062", qualification: "cod_delivered" }],
  );

  // Idempotent: the queued order already holds its outbox row, and the sixty-one
  // unattributable orders never become candidates.
  assert.equal(
    await reconcileGoogleAdsConversions(database, CONFIG, new Date("2026-08-27T01:00:00.000Z")),
    0,
  );
});

test("an account-level 401/403 leaves the whole batch pending instead of terminating it", async (context) => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE orders (id INTEGER PRIMARY KEY);");
  sqlite.exec(
    readFileSync(
      new URL("../db/migrations/0048_google_ads_conversion_outbox.sql", import.meta.url),
      "utf8",
    ).replaceAll("--> statement-breakpoint", ""),
  );
  for (const id of [1, 2, 3]) {
    sqlite.exec(`INSERT INTO orders VALUES (${id})`);
    sqlite
      .prepare(
        `INSERT INTO google_ads_conversion_outbox
           (order_id, order_number, qualification, payload, next_retry_at, created_at, updated_at)
         VALUES (?, ?, 'cod_delivered', '{}', '2026-01-01T00:00:00.000Z', 't', 't')`,
      )
      .run(id, `INV-${id}`);
  }
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let uploads = 0;
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).includes("oauth2")) return Response.json({ access_token: "token" });
    uploads += 1;
    return Response.json({ error: { message: "DEVELOPER_TOKEN_NOT_APPROVED" } }, { status: 403 });
  }) as typeof fetch;

  const database = { prepare: (sql: string) => new ReconcileStatement(sqlite, sql) } as unknown as D1Database;
  assert.equal(await drainGoogleAdsConversionOutbox(database, CONFIG), 0);
  assert.equal(uploads, 1, "the batch stops at the first account-level refusal");
  const rows = sqlite.prepare("SELECT status, attempts FROM google_ads_conversion_outbox").all() as {
    status: string;
    attempts: number;
  }[];
  assert.deepEqual(rows.map((row) => `${row.status}:${row.attempts}`), ["pending:0", "pending:0", "pending:0"]);
});

test("a partial failure is read by its ConversionUploadError code, not retried blindly (A-284)", () => {
  // REST shape of a partialFailureError for one conversion.
  const partialFailure = {
    code: 3,
    message: "The click conversion already exists.",
    details: [{
      "@type": "type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure",
      errors: [{ errorCode: { conversionUploadError: "CLICK_CONVERSION_ALREADY_EXISTS" }, message: "…" }],
    }],
  };
  assert.deepEqual(readConversionUploadErrorCodes(partialFailure), ["CLICK_CONVERSION_ALREADY_EXISTS"]);
  assert.equal(classifyGooglePartialFailure(["CLICK_CONVERSION_ALREADY_EXISTS"]), "sent");
  assert.equal(classifyGooglePartialFailure(["ORDER_ID_ALREADY_IN_USE"]), "sent");
  assert.equal(classifyGooglePartialFailure(["TOO_RECENT_EVENT"]), "retry-later");
  assert.equal(classifyGooglePartialFailure(["EXPIRED_EVENT"]), "terminal");
  assert.equal(classifyGooglePartialFailure([]), "terminal", "an unreadable partial failure is not a success");
});

test("the drain settles an already-recorded conversion and terminates a permanent refusal", async (context) => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE orders (id INTEGER PRIMARY KEY);");
  sqlite.exec(
    readFileSync(
      new URL("../db/migrations/0048_google_ads_conversion_outbox.sql", import.meta.url),
      "utf8",
    ).replaceAll("--> statement-breakpoint", ""),
  );
  for (const id of [1, 2, 3]) {
    sqlite.exec(`INSERT INTO orders VALUES (${id})`);
    sqlite
      .prepare(
        `INSERT INTO google_ads_conversion_outbox
           (order_id, order_number, qualification, payload, next_retry_at, created_at, updated_at)
         VALUES (?, ?, 'cod_delivered', '{}', '2026-01-01T00:00:00.000Z', 't', 't')`,
      )
      .run(id, `INV-${id}`);
  }
  const codes = ["CLICK_CONVERSION_ALREADY_EXISTS", "EXPIRED_EVENT", "TOO_RECENT_EVENT"];
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).includes("oauth2")) return Response.json({ access_token: "token" });
    const code = codes.shift();
    return Response.json({
      partialFailureError: { message: code, details: [{ errors: [{ errorCode: { conversionUploadError: code } }] }] },
    });
  }) as typeof fetch;

  const database = { prepare: (sql: string) => new ReconcileStatement(sqlite, sql) } as unknown as D1Database;
  assert.equal(await drainGoogleAdsConversionOutbox(database, CONFIG), 1);
  const rows = sqlite.prepare("SELECT order_number, status, attempts FROM google_ads_conversion_outbox ORDER BY id").all() as {
    order_number: string; status: string; attempts: number;
  }[];
  assert.deepEqual(rows.map((row) => `${row.order_number}:${row.status}`), ["INV-1:sent", "INV-2:failed", "INV-3:pending"]);
});

test("settled Google rows are purged after 30 days; pending ones never are", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE orders (id INTEGER PRIMARY KEY);");
  sqlite.exec(
    readFileSync(new URL("../db/migrations/0048_google_ads_conversion_outbox.sql", import.meta.url), "utf8")
      .replaceAll("--> statement-breakpoint", ""),
  );
  const rows: [number, string, string][] = [
    [1, "sent", "2026-07-01T00:00:00.000Z"],
    [2, "failed", "2026-07-01T00:00:00.000Z"],
    [3, "pending", "2026-07-01T00:00:00.000Z"],
    [4, "sent", "2026-09-20T00:00:00.000Z"],
  ];
  for (const [id, status, updated] of rows) {
    sqlite.exec(`INSERT INTO orders VALUES (${id})`);
    sqlite
      .prepare(
        `INSERT INTO google_ads_conversion_outbox
           (order_id, order_number, qualification, payload, status, next_retry_at, created_at, updated_at)
         VALUES (?, ?, 'cod_delivered', '{}', ?, 't', 't', ?)`,
      )
      .run(id, `INV-${id}`, status, updated);
  }
  const database = { prepare: (sql: string) => new ReconcileStatement(sqlite, sql) } as unknown as D1Database;
  assert.equal(await purgeExpiredGoogleAdsConversions(database, new Date("2026-09-25T00:00:00.000Z")), 2);
  const left = (sqlite.prepare("SELECT order_number FROM google_ads_conversion_outbox ORDER BY id").all() as { order_number: string }[])
    .map((row) => row.order_number);
  assert.deepEqual(left, ["INV-3", "INV-4"]);
});
