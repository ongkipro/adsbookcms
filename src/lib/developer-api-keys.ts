const API_KEY_PREFIX = "adsbook_live_";
/**
 * Prefixes issued before the brand sweep. A key is verified by hashing the whole
 * secret with SHA-256 and comparing digests, so nothing in the credential path
 * reads the prefix and an already-issued key keeps validating untouched — and the
 * prefix cannot be recovered from a stored hash, so it could not be rewritten
 * anyway. The prefix is load-bearing in exactly two places: issuance below, and
 * the masked preview. Only the preview needs to know the old value, so that a
 * merchant's older keys do not render as a row of dots in
 * `/admin/settings/developer`. Drop this list once no unrevoked key predates the
 * sweep.
 */
const LEGACY_API_KEY_PREFIXES = ["cmsads_live_"];
const API_KEY_RANDOM_BYTES = 32;
const API_KEY_HASH_LENGTH = 64;

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function normalizeApiKeyName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

export function generateApiKeySecret(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(API_KEY_RANDOM_BYTES));
  return `${API_KEY_PREFIX}${encodeBase64Url(randomBytes)}`;
}

export async function hashApiKeySecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyApiKeySecret(secret: string, storedHash: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const candidateHash = await hashApiKeySecret(secret);
  let difference = 0;
  for (let index = 0; index < API_KEY_HASH_LENGTH; index += 1) {
    difference |= candidateHash.charCodeAt(index) ^ storedHash.charCodeAt(index);
  }
  return difference === 0;
}

export function maskApiKeySecret(secret: string): string {
  const prefix = [API_KEY_PREFIX, ...LEGACY_API_KEY_PREFIXES].find((candidate) =>
    secret.startsWith(candidate),
  );
  if (!prefix || secret.length < prefix.length + 8) {
    return "••••••••";
  }
  return `${secret.slice(0, prefix.length + 6)}••••${secret.slice(-4)}`;
}

export function isApiKeyActive(revokedAt: string | null): boolean {
  return revokedAt === null;
}
