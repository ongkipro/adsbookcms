import assert from "node:assert/strict";
import test from "node:test";
import { enqueuePurchaseForPaidOrder } from "./paid-order-purchase.ts";

type Row = Record<string, unknown>;

function createDatabase(options: { paymentStatus: string; pixel: boolean; alreadyQueued?: boolean }) {
  const outbox: Row[] = [];
  const database = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) {
          values = next;
          return statement;
        },
        async first() {
          if (sql.includes("SELECT meta_pixel_id")) {
            return options.pixel
              ? { meta_pixel_id: "123", meta_capi_token: "tok", google_tag_manager_id: null, google_ads_conversion_id: null, google_ads_conversion_label: null }
              : { meta_pixel_id: null, meta_capi_token: null };
          }
          if (sql.includes("FROM orders o")) {
            return {
              order_number: "INV-10041",
              customer_name: "Siti Rahayu",
              customer_phone: "081234567890",
              customer_email: null,
              province: "Jawa Barat",
              city: "Bogor",
              postal_code: "16111",
              payment_status: options.paymentStatus,
              product_value: 150_000,
            };
          }
          if (sql.includes("FROM capi_event_outbox")) return null;
          throw new Error(`unexpected first(): ${sql}`);
        },
        async all() {
          if (sql.includes("FROM order_items oi")) {
            return { results: [{ product_id: 100001, title: "Pupuk Organik" }] };
          }
          if (sql.includes("FROM capi_event_outbox")) return { results: [] };
          throw new Error(`unexpected all(): ${sql}`);
        },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO capi_event_outbox")) {
            if (options.alreadyQueued) return { meta: { changes: 0 } };
            outbox.push({ event_id: values[0], event_name: values[1], payload: JSON.parse(String(values[2])) });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { database, outbox };
}

const locals = (database: D1Database) =>
  ({ runtimeEnv: { OMS_DB: database }, tenant: { siteUrl: "https://store.example.test" } }) as unknown as App.Locals;

test("a paid order enqueues one Purchase keyed on its order number", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => Response.json({ events_received: 1 });
  const { database, outbox } = createDatabase({ paymentStatus: "paid", pixel: true });

  const result = await enqueuePurchaseForPaidOrder(database, locals(database), 41);
  assert.equal(result.status, "queued");
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].event_id, "INV-10041");
  assert.equal(outbox[0].event_name, "Purchase");
  const payload = outbox[0].payload as { eventSourceUrl: string; customData: Row; userData: Row };
  assert.equal(payload.eventSourceUrl, "https://store.example.test/thanks");
  // Goods only, the same figure the browser leg sends.
  assert.equal(payload.customData.value, 150_000);
  assert.deepEqual(payload.customData.contentIds, ["100001"]);
  assert.equal(payload.userData.externalId, "6281234567890");
  // No browser identifiers can exist server-side; none are invented.
  assert.equal("fbp" in payload.userData, false);
});

test("an unpaid order, an unconfigured pixel, and an already-sent Purchase are all no-ops", async () => {
  const unpaid = createDatabase({ paymentStatus: "pending", pixel: true });
  assert.deepEqual(await enqueuePurchaseForPaidOrder(unpaid.database, locals(unpaid.database), 41), {
    status: "skipped",
    reason: "order-not-paid",
  });
  const noPixel = createDatabase({ paymentStatus: "paid", pixel: false });
  assert.equal((await enqueuePurchaseForPaidOrder(noPixel.database, locals(noPixel.database), 41)).status, "skipped");
  const sent = createDatabase({ paymentStatus: "paid", pixel: true, alreadyQueued: true });
  assert.deepEqual(await enqueuePurchaseForPaidOrder(sent.database, locals(sent.database), 41), {
    status: "deduplicated",
  });
  assert.equal(sent.outbox.length, 0);
});
