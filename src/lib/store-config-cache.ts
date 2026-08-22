/**
 * The KV entry `/api/form-config` caches the store's COD-province policy in.
 *
 * Lives in its own module so the route that WRITES the policy
 * (`/api/admin/expeditions`) can drop the entry without importing a page
 * route — which would pull that route's whole dependency graph into the
 * caller, and into every test of the caller.
 *
 * Why invalidate at all: the storefront page reads the policy from D1 on every
 * request, but this endpoint cached it for the TTL. An operator's change was
 * live on the page at once and stale here for five minutes — two surfaces
 * disagreeing about the same setting.
 */
export const STORE_CONFIG_CACHE_KEY = "store-config:cod-disabled-province-codes:v1";
export const STORE_CONFIG_CACHE_TTL_SECONDS = 300;

/** Best-effort: a failed delete only means the old TTL applies. */
export async function invalidateStoreConfigCache(
  sessions: KVNamespace | undefined,
): Promise<void> {
  if (!sessions) return;
  try {
    await sessions.delete(STORE_CONFIG_CACHE_KEY);
  } catch (error) {
    console.error("store-config-cache-invalidate", error);
  }
}
