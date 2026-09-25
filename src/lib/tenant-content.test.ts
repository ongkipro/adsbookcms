import assert from "node:assert/strict";
import test from "node:test";

import { getTenantHomeContent } from "./tenant-content.ts";

/** A store with no home content published and no landing pages yet — the fresh-install case this module exists to serve. */
function freshInstallDatabase() {
  return {
    prepare(_sql: string) {
      return {
        async first() {
          return null;
        },
        async all() {
          return { results: [] };
        },
        bind() {
          return this;
        },
      };
    },
    async batch(statements: unknown[]) {
      return statements.map(() => ({ results: [] }));
    },
  } as unknown as D1Database;
}

function localsFor(database: unknown, tenant: Partial<App.Locals["tenant"]> = {}) {
  return {
    runtimeEnv: { OMS_DB: database },
    tenant: { name: "Toko Contoh", tagline: "", description: "", ...tenant },
  } as unknown as App.Locals;
}

test("getTenantHomeContent reports unavailable when the database binding is missing", async () => {
  const result = await getTenantHomeContent(localsFor(undefined));
  assert.deepEqual(result, { state: "unavailable" });
});

test("a fresh install with no published home content still renders, composed from the tenant's own name", async () => {
  const result = await getTenantHomeContent(localsFor(freshInstallDatabase()));
  assert.equal(result.state, "ready");
  if (result.state === "ready") {
    assert.equal(result.content.hero.title, "Toko Contoh");
    assert.deepEqual(result.content.heroSlides, []);
    assert.deepEqual(result.content.solutions, []);
  }
});

test("with no `locals` at all, an unpublished store cannot compose a default and is unavailable", async () => {
  const result = await getTenantHomeContent(undefined);
  assert.deepEqual(result, { state: "unavailable" });
});

test("published content that fails schema validation is reported unavailable, not thrown", async () => {
  const database = {
    prepare(sql: string) {
      return {
        async first() {
          if (sql.includes("storefront_content")) {
            return { published_json: "{ not valid json" };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
        bind() {
          return this;
        },
      };
    },
    async batch(statements: unknown[]) {
      return statements.map(() => ({ results: [] }));
    },
  } as unknown as D1Database;

  const result = await getTenantHomeContent(localsFor(database));
  assert.deepEqual(result, { state: "unavailable" });
});
