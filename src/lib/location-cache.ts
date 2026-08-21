/**
 * KV-backed cache for kecamatan/location lookups. Deliberately not a
 * module-level Map: every Worker isolate holds its own copy and isolates are
 * recycled constantly, so an in-memory cache here would look like it works in
 * dev and barely help in production — the same failure mode `rate-limit.ts`
 * already documents and was fixed away from. KV is shared across isolates.
 */

const RESOLVE_TTL_SECONDS = 24 * 60 * 60;
const SEARCH_TTL_SECONDS = 10 * 60;
const MIN_KV_TTL_SECONDS = 60;

const normalizeKeyPart = (value: string) => value.trim().toLocaleLowerCase("id-ID");

export function buildResolveCacheKey(district: string, city: string, province: string) {
  return `loc-resolve:${normalizeKeyPart(district)}|${normalizeKeyPart(city)}|${normalizeKeyPart(province)}`;
}

export function buildSearchCacheKey(search: string) {
  return `loc-search:${normalizeKeyPart(search)}`;
}

export async function getCachedLocation<T>(
  sessions: KVNamespace | undefined,
  key: string,
): Promise<T | null> {
  if (!sessions) return null;
  const raw = await sessions.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function setCachedLocation<T>(
  sessions: KVNamespace | undefined,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  if (!sessions) return;
  await sessions.put(key, JSON.stringify(value), {
    expirationTtl: Math.max(MIN_KV_TTL_SECONDS, ttlSeconds),
  });
}

/** A district-name-to-provider-id mapping is stable, so it caches long. */
export async function cacheResolvedLocation<T>(
  sessions: KVNamespace | undefined,
  key: string,
  value: T,
): Promise<void> {
  await setCachedLocation(sessions, key, value, RESOLVE_TTL_SECONDS);
}

/** A raw provider free-text search result can drift with the provider's own catalogue. */
export async function cacheSearchResult<T>(
  sessions: KVNamespace | undefined,
  key: string,
  value: T,
): Promise<void> {
  await setCachedLocation(sessions, key, value, SEARCH_TTL_SECONDS);
}
