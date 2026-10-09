import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { buildGtmEcomEvent, pushDataLayer, pushGtmEcomEvent } from "./gtm.ts";

/** Restores the ambient `window` so this file's tests never leak state into others. */
function withWindow(run: (win: Record<string, any>) => void) {
  const original = (globalThis as any).window;
  const win: Record<string, any> = {};
  (globalThis as any).window = win;
  try {
    run(win);
  } finally {
    if (original === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = original;
  }
}

test("pushDataLayer and pushGtmEcomEvent are no-ops outside a browser (no window global)", () => {
  assert.equal(typeof (globalThis as any).window, "undefined");
  assert.doesNotThrow(() => pushDataLayer({ event: "test" }));
  assert.doesNotThrow(() =>
    pushGtmEcomEvent("purchase", { value: 1000, transaction_id: "T1" }),
  );
});

test("pushDataLayer lazily creates window.dataLayer and appends the event", () => {
  withWindow((win) => {
    pushDataLayer({ event: "page_view" });
    pushDataLayer({ event: "add_to_cart" });
    assert.deepEqual(win.dataLayer, [{ event: "page_view" }, { event: "add_to_cart" }]);
  });
});

test("pushGtmEcomEvent defers to window.__PS_PUSH_GTM_ECOM__ when the host page defines it", () => {
  withWindow((win) => {
    const calls: unknown[] = [];
    win.__PS_PUSH_GTM_ECOM__ = (event: string, payload: unknown) => {
      calls.push([event, payload]);
    };
    pushGtmEcomEvent("purchase", { value: 5000, transaction_id: "T2" });
    assert.equal(win.dataLayer, undefined);
    assert.deepEqual(calls, [["purchase", { value: 5000, transaction_id: "T2" }]]);
  });
});

test("pushGtmEcomEvent falls back to a manual ecommerce push, clearing ecommerce first per GTM's own recommendation", () => {
  withWindow((win) => {
    pushGtmEcomEvent("purchase", {
      value: 25000,
      currency: "IDR",
      item_id: "P1",
      item_name: "Produk Satu",
      transaction_id: "T3",
      event_id: "evt-1",
    });
    assert.deepEqual(win.dataLayer[0], { ecommerce: null });
    assert.deepEqual(win.dataLayer[1], {
      event: "purchase",
      tracking_owner: "app",
      meta_managed_by_app: true,
      meta_event_id: "evt-1",
      ecommerce: {
        currency: "IDR",
        value: 25000,
        transaction_id: "T3",
        items: [{ item_id: "P1", item_name: "Produk Satu", item_variant: undefined, price: 25000, quantity: 1 }],
      },
    });
  });
});

test("the fallback ecommerce push defaults currency to IDR and value to 0 when the payload omits them", () => {
  withWindow((win) => {
    pushGtmEcomEvent("purchase", {});
    assert.equal(win.dataLayer[1].ecommerce.currency, "IDR");
    assert.equal(win.dataLayer[1].ecommerce.value, 0);
  });
});

test("the item carries a unit price and quantity that add back up to the event value", () => {
  const event = buildGtmEcomEvent("purchase", { value: 300000, quantity: 2, item_id: "60001" });
  assert.equal(event.ecommerce.value, 300000);
  assert.deepEqual(
    { price: event.ecommerce.items[0].price, quantity: event.ecommerce.items[0].quantity },
    { price: 150000, quantity: 2 },
  );
});

test("an explicit price wins, and a missing or junk quantity counts as one", () => {
  assert.equal(buildGtmEcomEvent("add_to_cart", { value: 9, price: 120000 }).ecommerce.items[0].price, 120000);
  for (const quantity of [undefined, 0, -3, Number.NaN, 0.4]) {
    assert.equal(buildGtmEcomEvent("purchase", { value: 50000, quantity }).ecommerce.items[0].quantity, 1);
  }
  assert.equal(buildGtmEcomEvent("purchase", { value: 50000, quantity: 2.9 }).ecommerce.items[0].quantity, 2);
});

/** Runs GtmBase's inline `__PS_PUSH_GTM_ECOM__` the way a browser would. */
function inlineGtmHelper() {
  const source = readFileSync("src/components/storefront/tracking/GtmBase.astro", "utf8");
  const start = source.indexOf("window.__PS_PUSH_GTM_ECOM__ =");
  const end = source.indexOf("</script>", start);
  assert.ok(start > 0 && end > start, "GtmBase no longer defines __PS_PUSH_GTM_ECOM__ inline");
  const window: Record<string, any> = {};
  vm.runInNewContext(source.slice(start, end), { window });
  return window;
}

test("GtmBase's inline helper pushes exactly what buildGtmEcomEvent builds", () => {
  const payloads = [
    {},
    { value: 300000, quantity: 2, item_id: "60001", item_name: "Tas", item_variant: "v-9", transaction_id: "INV-1", event_id: "INV-1" },
    { value: 120000, item_id: "60002", currency: "IDR", event_id: "atc_1" },
    { value: 75000, price: 70000, quantity: "3" as unknown as number, item_variant: "" },
  ];
  for (const payload of payloads) {
    const win = inlineGtmHelper();
    win.__PS_PUSH_GTM_ECOM__("purchase", payload);
    // JSON round trip: the vm context has its own Object prototype.
    assert.deepEqual(JSON.parse(JSON.stringify(win.dataLayer)), JSON.parse(JSON.stringify([{ ecommerce: null }, buildGtmEcomEvent("purchase", payload)])));
  }
});

test("GtmBase is the only inline owner of the ecommerce shape, and page_view carries none", () => {
  const trackers = ["MetaPageViewTracker", "MetaLandingTracker", "MetaThanksTracker"].map((name) => [
    name,
    readFileSync(`src/components/storefront/tracking/${name}.astro`, "utf8"),
  ]);
  for (const [name, source] of trackers) {
    assert.doesNotMatch(source, /ecommerce:\s*\{/, `${name} builds its own ecommerce object`);
  }
  const pageView = trackers[0][1];
  assert.doesNotMatch(pageView, /pushGtmEcomEvent|__PS_PUSH_GTM_ECOM__/);
  assert.match(pageView, /event: 'page_view'/);
});

test("BaseLayout loads GTM in <head> and puts the noscript iframe right after <body>", () => {
  const layout = readFileSync("src/layouts/BaseLayout.astro", "utf8");
  const head = layout.slice(0, layout.indexOf("</head>"));
  const bodyStart = layout.slice(layout.indexOf("<body>"), layout.indexOf("<body>") + 120);
  assert.match(head, /<GtmBase gtmId=\{[^}]+\} \/>/);
  assert.doesNotMatch(head, /<GtmBase[^>]*noscript/);
  assert.match(bodyStart, /<GtmBase gtmId=\{[^}]+\} noscript \/>/);
});
