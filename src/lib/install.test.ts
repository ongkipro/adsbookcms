import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { planInstall, runInstall, slugFromStoreName } from "./install.ts";
import { verifyPasswordHash } from "./auth.ts";

/**
 * A D1 shim over real SQLite. The stub below proves which SQL is sent; this
 * proves what the SQL does, which is where the install-takeover hid: the
 * statements were right and their combination was not.
 */
function sqliteD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE stores (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
      site_url TEXT, tagline TEXT, locale TEXT, storefront_template TEXT,
      admin_name TEXT, support_whatsapp TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE admin_credentials (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    INSERT INTO admin_credentials (id, username, password_hash, must_change_password, updated_at)
    VALUES (1, 'admin', 'pbkdf2-sha256$100000$seed$seed', 1, '2026-08-07T00:00:00.000Z');
  `);

  const prepare = (sql: string) => {
    let args: unknown[] = [];
    return {
      bind(...next: unknown[]) {
        args = next;
        return this;
      },
      first<T>() {
        return db.prepare(sql).get(...(args as never[])) as T;
      },
      run() {
        // D1 reports affected rows as meta.changes; node:sqlite as .changes.
        return { meta: { changes: Number(db.prepare(sql).run(...(args as never[])).changes) } };
      },
    };
  };

  return {
    raw: db,
    database: {
      prepare,
      async batch(statements: { run(): { meta: { changes: number } } }[]) {
        // D1 runs a batch sequentially inside one implicit transaction.
        db.exec("BEGIN");
        try {
          const results = statements.map((statement) => statement.run());
          db.exec("COMMIT");
          return results;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    } as unknown as D1Database,
  };
}

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
        async first() {
          return { total: 1 };
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

  const [seatCheck, storeInsert, credentialUpdate] = statements;
  assert.equal(statements.length, 3, "one seat check, then a batch of two");
  assert.match(seatCheck, /COUNT\(\*\).+FROM admin_credentials/s);
  assert.match(storeInsert, /INSERT INTO stores/);
  assert.match(
    storeInsert,
    /WHERE NOT EXISTS/,
    "a concurrent submission must not be able to create a second store",
  );
  assert.match(credentialUpdate, /UPDATE admin_credentials/);
  assert.match(
    credentialUpdate,
    /must_change_password = 0/,
    "the operator chose this password, so nothing is left to rotate",
  );
  assert.match(
    credentialUpdate,
    /AND must_change_password = 1/,
    "only the never-configured seeded credential may be claimed, and only once",
  );

  // The password must be stored hashed, never in the clear.
  const storedHash = bindings[1][1] as string;
  assert.notEqual(storedHash, valid.adminPassword);
  assert.equal(await verifyPasswordHash(valid.adminPassword, storedHash), true);
});

test("a second install finds nothing left to do", async () => {
  const database = {
    prepare: () => ({
      bind() { return this; },
      async first() { return { total: 1 }; },
    }),
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

test("a second install cannot take the admin account from the first", async () => {
  const { raw, database } = sqliteD1();

  const operator = planInstall(valid);
  assert.equal(operator.ok, true);
  if (!operator.ok) return;
  assert.deepEqual(await runInstall(database, operator.plan), { ok: true });

  // The attacker submits a valid form of their own against the same store.
  const attacker = planInstall({
    ...valid,
    storeName: "Toko Penyerang",
    adminUsername: "pwned",
    adminPassword: "attacker-chosen-password",
    adminPasswordConfirm: "attacker-chosen-password",
  });
  assert.equal(attacker.ok, true);
  if (!attacker.ok) return;
  const second = await runInstall(database, attacker.plan);
  assert.equal(second.ok, false);

  const credential = raw
    .prepare("SELECT username, password_hash FROM admin_credentials WHERE id = 1")
    .get() as { username: string; password_hash: string };

  // Being told "already installed" is not enough: the refusal must also have
  // written nothing. It previously overwrote both of these.
  assert.equal(credential.username, valid.adminUsername);
  assert.equal(
    await verifyPasswordHash(valid.adminPassword, credential.password_hash),
    true,
    "the operator must still be able to log into the store they installed",
  );
  assert.equal(
    await verifyPasswordHash("attacker-chosen-password", credential.password_hash),
    false,
  );

  const stores = raw.prepare("SELECT COUNT(*) AS total FROM stores").get() as {
    total: number;
  };
  assert.equal(stores.total, 1);
});

test("an install with no seeded credential row refuses instead of bricking", async () => {
  const { raw, database } = sqliteD1();
  raw.exec("DELETE FROM admin_credentials");

  const planned = planInstall(valid);
  assert.equal(planned.ok, true);
  if (!planned.ok) return;

  const result = await runInstall(database, planned.plan);
  assert.equal(result.ok, false);
  // A store row with no admin account is unrecoverable: middleware sends
  // /install to /hello once a store exists, so the wizard is gone too.
  const stores = raw.prepare("SELECT COUNT(*) AS total FROM stores").get() as {
    total: number;
  };
  assert.equal(stores.total, 0);
});

test("a failing database reports rather than throwing", async () => {
  const database = {
    prepare: () => ({
      bind() { return this; },
      async first() { return { total: 1 }; },
    }),
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
