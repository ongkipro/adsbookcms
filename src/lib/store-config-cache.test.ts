import assert from "node:assert/strict";
import test from "node:test";
import {
  invalidateStoreConfigCache,
  STORE_CONFIG_CACHE_KEY,
} from "./store-config-cache.ts";

test("saving the COD policy drops the cached copy the public endpoint serves", async () => {
  const store = new Map<string, string>([[STORE_CONFIG_CACHE_KEY, '["PA","JI"]']]);
  const kv = {
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as KVNamespace;

  await invalidateStoreConfigCache(kv);
  // Before this existed the page read D1 at once while form-config answered
  // with the old list for the whole TTL — two surfaces disagreeing.
  assert.equal(store.has(STORE_CONFIG_CACHE_KEY), false);
});

test("a missing KV binding or a failing delete never breaks the save", async () => {
  await assert.doesNotReject(() => invalidateStoreConfigCache(undefined));
  const failing = {
    delete: async () => {
      throw new Error("kv down");
    },
  } as unknown as KVNamespace;
  await assert.doesNotReject(() => invalidateStoreConfigCache(failing));
});
