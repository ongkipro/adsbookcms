import assert from "node:assert/strict";
import test from "node:test";

import { pushDataLayer, pushGtmEcomEvent } from "./gtm.ts";

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
        items: [{ item_id: "P1", item_name: "Produk Satu", item_variant: undefined, quantity: 1 }],
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
