import assert from "node:assert/strict";
import test from "node:test";
import { buildSetupChecklist, type SetupFacts } from "./setup-checklist.ts";

const fresh: SetupFacts = {
  activeProducts: 0,
  warehouseReady: false,
  mengantarConfigured: false,
  autolarisConfigured: false,
  activeBankAccounts: 0,
  siteUrl: "https://adsbookcms.toko.workers.dev",
};

test("a fresh one-click install owes three required steps and two optional ones", () => {
  const steps = buildSetupChecklist(fresh);
  assert.deepEqual(
    steps.filter((step) => step.required && !step.done).map((step) => step.id),
    ["product", "mengantar", "warehouse"],
  );
  assert.deepEqual(steps.filter((step) => !step.required).map((step) => step.id), ["payment", "domain"]);
  assert.ok(steps.every((step) => step.href.startsWith("/admin/")));
});

test("every step ticks itself from what the store already holds", () => {
  const ready = buildSetupChecklist({
    activeProducts: 3,
    warehouseReady: true,
    mengantarConfigured: true,
    autolarisConfigured: false,
    activeBankAccounts: 1,
    siteUrl: "https://tokosaya.com",
  });
  assert.ok(ready.every((step) => step.done));
});

test("a workers.dev, placeholder or unparsable address is not the store's own domain", () => {
  for (const siteUrl of ["https://x.y.workers.dev", "https://example.com", "not a url"]) {
    assert.equal(buildSetupChecklist({ ...fresh, siteUrl }).find((s) => s.id === "domain")?.done, false, siteUrl);
  }
});
