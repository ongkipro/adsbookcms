import assert from "node:assert/strict";
import test from "node:test";

import { getStoreSupportWhatsapp } from "./public-store.ts";

function locals(database: unknown) {
  return { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals;
}

test("getStoreSupportWhatsapp strips non-digit formatting from the stored number", async () => {
  const database = {
    prepare: () => ({
      async first() {
        return { support_whatsapp: "+62 812-3456-7890" };
      },
    }),
  };
  const result = await getStoreSupportWhatsapp(locals(database));
  assert.equal(result, "6281234567890");
});

test("getStoreSupportWhatsapp returns empty when no store row exists yet", async () => {
  const database = {
    prepare: () => ({
      async first() {
        return null;
      },
    }),
  };
  assert.equal(await getStoreSupportWhatsapp(locals(database)), "");
});

test("getStoreSupportWhatsapp returns empty when the OMS_DB binding is missing", async () => {
  assert.equal(await getStoreSupportWhatsapp(locals(undefined)), "");
});

test("getStoreSupportWhatsapp returns empty rather than throwing when the query itself fails", async () => {
  const database = {
    prepare: () => ({
      async first() {
        throw new Error("d1 unavailable");
      },
    }),
  };
  assert.equal(await getStoreSupportWhatsapp(locals(database)), "");
});
