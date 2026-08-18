import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveMetaEventId } from "./meta-capi.ts";

// Meta only deduplicates a browser Pixel event against a server CAPI event when
// both carry the same event_id. The server leg is authoritative and keys Purchase
// on the order number (`resolveMetaEventId`), so the browser leg on /thanks must
// quote that same order number instead of minting one of its own.

const TRACKER_SOURCE = readFileSync(
  new URL("../components/storefront/tracking/MetaThanksTracker.astro", import.meta.url),
  "utf8",
);

const INLINE_SCRIPT = (() => {
  const match = TRACKER_SOURCE.match(/<script is:inline[^>]*>([\s\S]*)<\/script>/);
  assert.ok(match, "MetaThanksTracker must keep its inline tracking script");
  return match[1];
})();

type OrderStatus = Record<string, unknown>;

type TrackerRun = {
  pixelEventIds: string[];
  postedPayloads: Record<string, unknown>[];
};

function storageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
}

/**
 * Executes the real inline tracker script from MetaThanksTracker.astro against a
 * stubbed browser, with /api/order-status answering `orderStatus`.
 */
async function runTracker(orderStatus: OrderStatus): Promise<TrackerRun> {
  const run: TrackerRun = { pixelEventIds: [], postedPayloads: [] };
  const thanksState = {
    order_id: "INV-10042",
    order_pk: "42",
    status_token: "status-token-42",
    payment_method: "cod",
    event_id: "lead_asahan_1754400000000_ab12cd",
    name: "Siti Rahayu",
    phone: "081234567890",
    product_id: "434683",
    product_name: "Asahan Portable",
    product_price: 150_000,
    quantity: 1,
  };

  const sessionStorage = storageStub();
  sessionStorage.setItem("thanks_state", JSON.stringify(thanksState));

  const fetchStub = (input: string, init?: { body?: string }) => {
    if (input.startsWith("/api/order-status")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(orderStatus),
      });
    }
    if (input.startsWith("/api/meta-event")) {
      run.postedPayloads.push(JSON.parse(String(init?.body || "{}")));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
    }
    throw new Error(`unexpected request: ${input}`);
  };

  const windowStub: Record<string, unknown> = {
    __META_PIXEL_ID__: "1234567890",
    location: {
      search: "",
      href: "https://permatamall.shop/thanks",
    },
    fbq: (action: string, _eventName: string, _data: unknown, options?: { eventID?: string }) => {
      if (action === "track") run.pixelEventIds.push(String(options?.eventID || ""));
    },
  };

  const tracker = new Function(
    "tenantName",
    "tenantSlug",
    "window",
    "document",
    "navigator",
    "sessionStorage",
    "localStorage",
    "fetch",
    INLINE_SCRIPT,
  );

  tracker(
    "Permatamall",
    "permatamall",
    windowStub,
    { cookie: "" },
    { userAgent: "node-test" },
    sessionStorage,
    storageStub(),
    fetchStub,
  );

  // The script fires asynchronously (status fetch + SHA-256 hashing).
  for (let i = 0; i < 20 && run.postedPayloads.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return run;
}

test("browser and server Purchase legs derive the same event_id for one order", async () => {
  const run = await runTracker({
    success: true,
    order_number: "INV-10042",
    payment_status: "unpaid",
    payment_method: "cod",
    is_paid: false,
    total_amount: 189_000,
  });

  const serverEventId = resolveMetaEventId("Purchase", "browser-generated-event-id", "INV-10042");

  assert.equal(run.postedPayloads.length, 1, "the browser must post exactly one Purchase to CAPI");
  assert.equal(run.pixelEventIds.length, 1, "the browser Pixel must fire exactly one Purchase");
  assert.equal(serverEventId, "INV-10042");
  assert.equal(run.pixelEventIds[0], serverEventId);
  assert.equal(run.postedPayloads[0].event_id, serverEventId);
  // The route re-resolves the order from these, and substitutes its order_number
  // as the event_id - the same string the Pixel just used.
  assert.equal(run.postedPayloads[0].order_number, "INV-10042");
  assert.equal(run.postedPayloads[0].status_token, "status-token-42");
});

test("a Purchase without a resolvable order number emits nothing at all", async () => {
  const run = await runTracker({
    success: true,
    order_number: "",
    payment_status: "unpaid",
    payment_method: "cod",
    is_paid: false,
    total_amount: 189_000,
  });

  assert.equal(run.pixelEventIds.length, 0, "no order number means no Pixel Purchase");
  assert.equal(run.postedPayloads.length, 0, "no order number means no CAPI Purchase");
});

test("no checkout form mints a random Purchase event_id any more", () => {
  for (const script of ["../scripts/form-hybrid.ts", "../scripts/form-middle.ts"]) {
    const source = readFileSync(new URL(script, import.meta.url), "utf8");
    assert.ok(
      !/createId\(`purchase_/.test(source),
      `${script} must not mint a Purchase event_id the server will never see`,
    );
    assert.ok(
      !/purchase_event_id/.test(source),
      `${script} must not carry a browser-minted purchase_event_id into thanks state`,
    );
  }
});

test("embed parent surfaces never emit Purchase before verified thanks", () => {
  const widgetSource = readFileSync(
    new URL("../../public/adsbook-form-widget.js", import.meta.url),
    "utf8",
  );

  const navigationSource = readFileSync(
    new URL("./checkout-navigation.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(widgetSource, /["']Purchase["']/);
  assert.doesNotMatch(widgetSource, /adsbook:order-complete/);
  assert.doesNotMatch(navigationSource, /adsbook:order-complete/);
});
