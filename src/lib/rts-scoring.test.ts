import assert from "node:assert/strict";
import test from "node:test";
import {
  backfillReceiverScores,
  getReceiverPerformance,
  readStoredReceiverPerformance,
  scheduleReceiverPerformanceRefresh,
} from "./rts-scoring.ts";

/**
 * Audit 2026-08-23 §2.6: receiver scoring decides return-to-sender risk, which
 * is money. These tests pin the guards that run *before* any provider call and
 * the promise that a background refresh can never break the request it rode in
 * on.
 */

function storeDatabase(row: Record<string, string | null> | null) {
  return {
    prepare() {
      return {
        async first() {
          return row;
        },
        async run() {
          return { success: true };
        },
      };
    },
  } as unknown as D1Database;
}

const UNCONFIGURED_STORE = storeDatabase({
  mengantar_api_key: null,
  mengantar_base_url: null,
  autolaris_api_key: null,
  autolaris_base_url: null,
});

/** Keeps a deployed secret in the shell from deciding the assertion. */
function withoutMengantarSecret(context: { after: (fn: () => void) => void }) {
  const original = process.env.MENGANTAR_API_KEY;
  delete process.env.MENGANTAR_API_KEY;
  context.after(() => {
    if (original === undefined) delete process.env.MENGANTAR_API_KEY;
    else process.env.MENGANTAR_API_KEY = original;
  });
}

test("a receiver number too short to be Indonesian is refused before any provider call", async () => {
  let prepared = 0;
  const database = {
    prepare() {
      prepared += 1;
      return { async first() { return null; } };
    },
  } as unknown as D1Database;

  await assert.rejects(
    getReceiverPerformance(database, "0812345", { runtimeEnv: {} } as never),
    /Nomor penerima tidak valid/i,
  );
  // The guard is the point: no credential read, no outbound request, no spend.
  assert.equal(prepared, 0);
});

test("formatting is stripped before the length guard, so a punctuated number is not rejected", async (context) => {
  withoutMengantarSecret(context);

  // 12 digits once the dashes and spaces go; it must fail on configuration,
  // not on validity.
  await assert.rejects(
    getReceiverPerformance(UNCONFIGURED_STORE, "0813-3100 0000", {
      runtimeEnv: { OMS_DB: UNCONFIGURED_STORE },
    } as never),
    /belum dikonfigurasi/i,
  );
});

test("an unconfigured Mengantar account fails loudly instead of scoring blind", async (context) => {
  withoutMengantarSecret(context);

  await assert.rejects(
    getReceiverPerformance(UNCONFIGURED_STORE, "081331000000", {
      runtimeEnv: { OMS_DB: UNCONFIGURED_STORE },
    } as never),
    /Mengantar API belum dikonfigurasi/i,
  );
});

test("a failed background refresh is handed to waitUntil and never reaches the request", async (context) => {
  withoutMengantarSecret(context);
  const errors: unknown[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  context.after(() => {
    console.error = originalError;
  });

  const scheduled: Promise<unknown>[] = [];
  const locals = {
    runtimeEnv: { OMS_DB: UNCONFIGURED_STORE },
    cfContext: {
      waitUntil(task: Promise<unknown>) {
        scheduled.push(task);
      },
    },
  } as never;

  // Returns void synchronously: an order must not wait on, or fail with, a
  // risk score.
  assert.equal(
    scheduleReceiverPerformanceRefresh(
      UNCONFIGURED_STORE,
      "INV-10001",
      "081331000000",
      locals,
    ),
    undefined,
  );

  assert.equal(scheduled.length, 1);
  // The handed-off task settles rather than rejecting, so an unhandled
  // rejection cannot take the Worker invocation down.
  await assert.doesNotReject(scheduled[0]);
  assert.equal(errors.length, 1);
});

test("without a Cloudflare context the refresh still swallows its own failure", async (context) => {
  withoutMengantarSecret(context);
  const originalError = console.error;
  console.error = () => {};
  context.after(() => {
    console.error = originalError;
  });

  assert.equal(
    scheduleReceiverPerformanceRefresh(UNCONFIGURED_STORE, "INV-10002", "081331000000", {
      runtimeEnv: { OMS_DB: UNCONFIGURED_STORE },
    } as never),
    undefined,
  );
  // Let the detached task settle inside the test, so a regression surfaces here
  // rather than as an unhandled rejection in an unrelated file.
  await new Promise((resolve) => setTimeout(resolve, 10));
});

/** A store with a Mengantar key, three unscored orders, and a log of writes. */
function backfillDatabase() {
  const writes: unknown[][] = [];
  const database = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first() {
          return { mengantar_api_key: "test-key", mengantar_base_url: "https://provider.invalid" };
        },
        async all() {
          return {
            results: [
              { order_number: "INV-3", customer_phone: "081300000003" },
              { order_number: "INV-2", customer_phone: "081300000002" },
              { order_number: "INV-1", customer_phone: "081300000001" },
            ],
          };
        },
        async run() {
          writes.push([sql.replace(/\s+/g, " ").trim(), ...bound]);
          return { success: true };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { database, writes };
}

function mockMengantar(context: { after: (fn: () => void) => void }, respond: () => Response) {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return respond();
  }) as typeof fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  return () => calls;
}

test("an account Mengantar has not whitelisted costs the backfill one call and marks the order", async (context) => {
  const calls = mockMengantar(context, () =>
    Response.json({ success: false, message: "Not allowed" }, { status: 403 }),
  );
  const { database, writes } = backfillDatabase();

  assert.equal(await backfillReceiverScores(database, { runtimeEnv: {} } as never), 0);
  assert.equal(calls(), 1);
  assert.equal(writes.length, 1);
  const [sql, json, orderKey] = writes[0] as [string, string, string];
  assert.match(sql, /SET receiver_performance_json = \?/);
  assert.match(sql, /receiver_performance_checked_at IS NULL/);
  assert.equal(orderKey, "INV-3");
  assert.equal(readStoredReceiverPerformance(json).receiver_performance_unavailable, "not-whitelisted");
  assert.equal(readStoredReceiverPerformance(json).receiver_performance, null);
});

test("once access is granted the backfill scores every waiting order", async (context) => {
  const calls = mockMengantar(context, () =>
    Response.json({
      success: true,
      data: {
        JNE: { total: 4, delivered: 4, rts: 0, undelivered: 0, rate: 10 },
        summary: { average_number: 10, average_score: "≈A" },
      },
    }),
  );
  const { database, writes } = backfillDatabase();

  assert.equal(await backfillReceiverScores(database, { runtimeEnv: {} } as never), 3);
  assert.equal(calls(), 3);
  assert.deepEqual(writes.map((write) => write[2]), ["LOW", "LOW", "LOW"]);
  assert.equal(readStoredReceiverPerformance(String(writes[0]?.[3])).receiver_performance_unavailable, null);
});

test("a store without a Mengantar key makes no call at all", async (context) => {
  withoutMengantarSecret(context);
  const calls = mockMengantar(context, () => Response.json({}));

  assert.equal(await backfillReceiverScores(UNCONFIGURED_STORE, { runtimeEnv: {} } as never), 0);
  assert.equal(calls(), 0);
});
