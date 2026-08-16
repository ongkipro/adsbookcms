import { isAdminRole, secureEqual, verifyPasswordHash } from './auth.ts';
import type { AdminRole } from './auth.ts';

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD_HASH = 'pbkdf2-sha256$100000$-EwKzifD04qz0rRDZxAlpQ$Hq_4WkRnBcUgAASqRR0kukVbbGOZyN3IIxpvVfm6_l4';
/**
 * The password a fresh install accepts for the seeded `admin` credential when
 * no BOOTSTRAP_ADMIN_PASSWORD is configured. Deliberately guessable: it is a
 * first-run key, not a credential, and it opens nothing but the screen that
 * replaces it.
 */
export const BOOTSTRAP_FALLBACK_PASSWORD = 'admin';
const PASSWORD_ITERATIONS = 100_000;
const USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;

type AdminCredentialRow = {
  id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  role: string;
  password_hash: string;
  must_change_password: number | boolean;
  updated_at: string;
};

export type AdminCredential = {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: AdminRole;
  passwordHash: string;
  mustChangePassword: boolean;
  updatedAt: string;
};

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function normalizeAdminUsername(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 64) : '';
}

export function validateAdminUsername(username: string) {
  return USERNAME_PATTERN.test(username);
}

export function validateNewAdminPassword(password: string, username: string) {
  if (password.toLowerCase() === 'admin' || password.toLowerCase() === username.toLowerCase()) {
    return 'Password baru tidak boleh menggunakan username atau password default.';
  }
  if (password.length < 8 || password.length > 128) return 'Password baru harus berisi 8–128 karakter.';
  return '';
}

export function isDefaultAdminCredential(credential: Pick<AdminCredential, 'username' | 'passwordHash'>) {
  return credential.username === DEFAULT_ADMIN_USERNAME && credential.passwordHash === DEFAULT_ADMIN_PASSWORD_HASH;
}

export async function verifyAdminLoginPassword(
  password: string,
  credential: Pick<AdminCredential, 'username' | 'passwordHash'>,
  bootstrapPassword: string
) {
  if (isDefaultAdminCredential(credential)) {
    const configuredBootstrap = bootstrapPassword.trim();

    // An operator who sets BOOTSTRAP_ADMIN_PASSWORD gets the stronger path, and
    // a short value is rejected outright rather than silently weakening it.
    if (configuredBootstrap) {
      if (configuredBootstrap.length < 16) return false;
      return secureEqual(password, configuredBootstrap);
    }

    // Nothing configured — a fresh install. Accept the documented default so an
    // install is reachable at all: before this, a new Worker had a seeded
    // credential that no password could open, because the only accepted one
    // came from an environment variable nobody had set yet.
    //
    // The exposure is bounded by middleware, not by hope: while
    // must_change_password is set, this session can reach only /admin/profile,
    // /api/admin/profile and /api/admin/logout. It cannot read an order, a
    // customer, a payment or a provider key. Rotating the password is the only
    // thing it can do, and validateNewAdminPassword refuses to let the new one
    // be 'admin' or the username.
    return secureEqual(password, BOOTSTRAP_FALLBACK_PASSWORD);
  }

  return verifyPasswordHash(password, credential.passwordHash);
}

export async function hashAdminPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  ));
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(derived)}`;
}

export async function getAdminCredential(
  database: D1Database,
  username = DEFAULT_ADMIN_USERNAME,
): Promise<AdminCredential | null> {
  const normalizedUsername = normalizeAdminUsername(username);
  const row = await database.prepare(`
    SELECT id, username, display_name, email, role, password_hash,
      must_change_password, updated_at
    FROM admin_credentials
    WHERE username = ?
    LIMIT 1
  `).bind(normalizedUsername).first<AdminCredentialRow>();
  if (!row || !isAdminRole(row.role)) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    passwordHash: row.password_hash,
    mustChangePassword: Boolean(row.must_change_password),
    updatedAt: row.updated_at,
  };
}

export async function updateAdminCredential(
  database: D1Database,
  actorUsername: string,
  currentPassword: string,
  username: string,
  newPassword: string,
) {
  const current = await getAdminCredential(database, actorUsername);
  if (!current || !(await verifyPasswordHash(currentPassword, current.passwordHash))) {
    return { ok: false as const, error: 'Password saat ini salah.' };
  }

  const normalizedUsername = normalizeAdminUsername(username);
  if (!validateAdminUsername(normalizedUsername)) {
    return { ok: false as const, error: 'Username harus 3–64 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.' };
  }
  const passwordError = validateNewAdminPassword(newPassword, normalizedUsername);
  if (passwordError) return { ok: false as const, error: passwordError };

  const passwordHash = await hashAdminPassword(newPassword);
  const updatedAt = new Date().toISOString();
  const result = await database.prepare(`
    UPDATE admin_credentials
    SET username = ?, password_hash = ?, must_change_password = 0, updated_at = ?
    WHERE id = ? AND password_hash = ?
  `).bind(
    normalizedUsername,
    passwordHash,
    updatedAt,
    current.id,
    current.passwordHash,
  ).run();
  if (result.meta.changes !== 1) {
    return { ok: false as const, error: 'Kredensial berubah di sesi lain. Muat ulang halaman dan coba kembali.' };
  }

  return { ok: true as const, username: normalizedUsername, updatedAt };
}

export async function revokeAdminSessions(
  sessions: KVNamespace,
  username?: string,
) {
  let cursor: string | undefined;
  do {
    const page = await sessions.list({ prefix: 'admin-session:', cursor });
    await Promise.all(page.keys.map(async (key) => {
      if (!username) {
        await sessions.delete(key.name);
        return;
      }
      const value = await sessions.get(key.name);
      if (!value) return;
      try {
        const parsed = JSON.parse(value) as { username?: unknown };
        if (parsed.username === username) await sessions.delete(key.name);
      } catch {
        await sessions.delete(key.name);
      }
    }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
