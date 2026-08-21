import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildResolveCacheKey,
  buildSearchCacheKey,
  cacheResolvedLocation,
  cacheSearchResult,
  getCachedLocation,
} from './location-cache.ts';

/** Enough of KV to round-trip JSON through: get and put over a Map. */
function createKv() {
  const store = new Map<string, { value: string; expirationTtl?: number }>();
  return {
    store,
    kv: {
      get: async (key: string) => store.get(key)?.value ?? null,
      put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
        store.set(key, { value, expirationTtl: options?.expirationTtl });
      },
    } as unknown as KVNamespace,
  };
}

test('a resolved location round-trips through the cache', async () => {
  const { kv } = createKv();
  const key = buildResolveCacheKey('Menteng', 'Jakarta Pusat', 'DKI Jakarta');
  assert.equal(await getCachedLocation(kv, key), null);

  await cacheResolvedLocation(kv, key, { items: [{ id: '123' }] });
  assert.deepEqual(await getCachedLocation(kv, key), { items: [{ id: '123' }] });
});

test('resolve and search keys for the same text stay in separate namespaces', () => {
  const resolveKey = buildResolveCacheKey('Menteng', 'Jakarta Pusat', 'DKI Jakarta');
  const searchKey = buildSearchCacheKey('Menteng');
  assert.notEqual(resolveKey, searchKey);
});

test('the resolve cache key is case- and whitespace-insensitive', () => {
  const a = buildResolveCacheKey('  Menteng ', 'Jakarta Pusat', 'DKI Jakarta');
  const b = buildResolveCacheKey('menteng', 'JAKARTA PUSAT', 'dki jakarta');
  assert.equal(a, b);
});

test('a cached entry survives a search-namespace round-trip', async () => {
  const { kv } = createKv();
  const key = buildSearchCacheKey('Kebayoran Baru');
  await cacheSearchResult(kv, key, { items: [] });
  assert.deepEqual(await getCachedLocation(kv, key), { items: [] });
});

test('reading without KV configured fails open to a miss, not a throw', async () => {
  assert.equal(await getCachedLocation(undefined, 'anything'), null);
});

test('a corrupt cache value is treated as a miss, not a throw', async () => {
  const { kv, store } = createKv();
  store.set('bad-key', { value: 'not json' });
  assert.equal(await getCachedLocation(kv, 'bad-key'), null);
});

test('KV TTL is clamped to the platform minimum of 60 seconds', async () => {
  const { kv, store } = createKv();
  const key = buildResolveCacheKey('Menteng', 'Jakarta Pusat', 'DKI Jakarta');
  await cacheResolvedLocation(kv, key, { items: [] });
  assert.ok((store.get(key)?.expirationTtl ?? 0) >= 60);
});
