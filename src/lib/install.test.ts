import test from "node:test";
import assert from "node:assert/strict";

import { planInstall, runInstall, slugFromStoreName } from "./install.ts";
import { verifyPasswordHash } from "./auth.ts";

const valid = {
  storeName: "Toko Bunga Segar",
  siteUrl: "https://tokobunga.example",
  adminUsername: "operator",
  adminPassword: "a-real-operator-password",
  adminPasswordConfirm: "a-real-operator-password",
  supportWhatsapp: "081234567890",
  locale: "id-ID",
  storefrontTemplate: "compact-market",
};

test("a complete submission produces a plan", () => {
  const result = planInstall(valid);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.storeName, "Toko Bunga Segar");
  assert.equal(result.plan.siteUrl, "https://tokobunga.example");
  assert.equal(result.plan.slug, "toko-bunga-segar");
  assert.equal(result.plan.adminUsername, "operator");
});

test("the install refuses anything it cannot store safely", () => {
  const rejected: Array<[string, Record<string, unknown>]> = [
    ["empty store name", { storeName: " " }],
    ["one-character store name", { storeName: "T" }],
    ["non-https address", { siteUrl: "http://tokobunga.example" }],
    ["malformed address", { siteUrl: "tokobunga" }],
    ["uppercase username", { adminUsername: "Operator!" }],
    ["two-character username", { adminUsername: "op" }],
    ["short password", { adminPassword: "short", adminPasswordConfirm: "short" }],
    [
      "password equal to the username",
      { adminUsername: "operator", adminPassword: "operator", adminPasswordConfirm: "operator" },
    ],
    [
      "the default password",
      { adminPassword: "admin", adminPasswordConfirm: "admin" },
    ],
    ["mismatched confirmation", { adminPasswordConfirm: "something-else-entirely" }],
    ["five-digit WhatsApp number", { supportWhatsapp: "12345" }],
    ["invalid locale", { locale: "indonesian" }],
    ["unknown template", { storefrontTemplate: "does-not-exist" }],
  ];

  for (const [label, override] of rejected) {
    const result = planInstall({ ...valid, ...override });
    assert.equal(result.ok, false, `must reject: ${label}`);
    if (!result.ok) {
      assert.ok(result.error.length > 0, `${label} must explain itself`);
    }
  }
});

test("a store name that reduces to nothing still yields a usable slug", () => {
  // The slug is diagnostic only, so an unusable name must not strand the
  // operator on a form they cannot get past.
  assert.equal(slugFromStoreName("���"), "adsbook");
  assert.equal(slugFromStoreName("  Toko  Saya  "), "toko-saya");
  assert.equal(slugFromStoreName("Toko—Saya!!"), "toko-saya");
});

test("the install writes the store and the credential together", async () => {
  const statements: string[] = [];
  const bindings: unknown[][] = [];
  const database = {
    prepare(sql: string) {
      statements.push(sql);
      return {
        bind(...args: unknown[]) {
          bindings.push(args);
          return this;
        },
      };
    },
    async batch() {
      return [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];
    },
  } as unknown as D1Database;

  const planned = planInstall(valid);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;

  const result = await runInstall(database, planned.plan);
  assert.equal(result.ok, true);

  assert.equal(statements.length, 2, "one batch, two statements");
  assert.match(statements[0], /INSERT INTO stores/);
  assert.match(
    statements[0],
    /WHERE NOT EXISTS/,
    "a concurrent submission must not be able to create a second store",
  );
  assert.match(statements[1], /UPDATE admin_credentials/);
  assert.match(
    statements[1],
    /must_change_password = 0/,
    "the operator chose this password, so nothing is left to rotate",
  );

  // The password must be stored hashed, never in the clear.
  const storedHash = bindings[1][1] as string;
  assert.notEqual(storedHash, valid.adminPassword);
  assert.equal(await verifyPasswordHash(valid.adminPassword, storedHash), true);
});

test("a second install finds nothing left to do", async () => {
  const database = {
    prepare: () => ({ bind() { return this; } }),
    // changes: 0 is what `WHERE NOT EXISTS` produces once a store row exists.
    async batch() {
      return [{ meta: { changes: 0 } }, { meta: { changes: 1 } }];
    },
  } as unknown as D1Database;

  const planned = planInstall(valid);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;

  const result = await runInstall(database, planned.plan);
  assert.equal(result.ok, false);
});

test("a failing database reports rather than throwing", async () => {
  const database = {
    prepare: () => ({ bind() { return this; } }),
    async batch() {
      throw new Error("D1_ERROR: no such table: stores");
    },
  } as unknown as D1Database;

  const planned = planInstall(valid);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;

  const result = await runInstall(database, planned.plan);
  assert.equal(result.ok, false);
});
