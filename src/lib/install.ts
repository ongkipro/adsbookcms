import {
  hashAdminPassword,
  normalizeAdminUsername,
  validateAdminUsername,
  validateNewAdminPassword,
} from "./admin-credentials.ts";
import { STOREFRONT_TEMPLATE_IDS } from "./tenant-contract.ts";

export interface InstallInput {
  storeName: unknown;
  siteUrl: unknown;
  adminUsername: unknown;
  adminPassword: unknown;
  adminPasswordConfirm: unknown;
  tagline?: unknown;
  supportWhatsapp: unknown;
  locale?: unknown;
  storefrontTemplate?: unknown;
}

export interface InstallPlan {
  storeName: string;
  siteUrl: string;
  slug: string;
  adminUsername: string;
  adminPassword: string;
  tagline: string;
  supportWhatsapp: string;
  locale: string;
  storefrontTemplate: string;
}

const LOCALE_PATTERN = /^[a-z]{2}(?:-[A-Z]{2})?$/;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Derives a URL-safe slug from the store name. It is diagnostic only — nothing
 * routes on it — so a name that reduces to nothing falls back rather than
 * failing the install and stranding the operator on a form.
 */
export function slugFromStoreName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "adsbook";
}

/**
 * Validates everything before a single row is written. The install must be
 * all-or-nothing: a half-installed store — identity saved but the credential
 * still the default, or the reverse — is worse than one that refused, because
 * the operator cannot tell which half took.
 */
export function planInstall(
  input: InstallInput,
): { ok: true; plan: InstallPlan } | { ok: false; error: string } {
  const storeName = text(input.storeName, 120);
  if (storeName.length < 2) {
    return { ok: false, error: "Nama toko wajib diisi, minimal 2 karakter." };
  }

  const siteUrlRaw = text(input.siteUrl, 200);
  let siteUrl = "";
  try {
    const parsed = new URL(siteUrlRaw);
    if (parsed.protocol !== "https:") {
      return { ok: false, error: "Alamat toko harus memakai https." };
    }
    siteUrl = parsed.origin;
  } catch {
    return {
      ok: false,
      error: "Alamat toko tidak valid. Contoh: https://tokosaya.com",
    };
  }

  const adminUsername = normalizeAdminUsername(input.adminUsername);
  if (!validateAdminUsername(adminUsername)) {
    return {
      ok: false,
      error:
        "Username admin harus 3–64 karakter, hanya huruf kecil, angka, titik, garis bawah, atau strip.",
    };
  }

  const adminPassword =
    typeof input.adminPassword === "string" ? input.adminPassword : "";
  const passwordError = validateNewAdminPassword(adminPassword, adminUsername);
  if (passwordError) return { ok: false, error: passwordError };

  if (adminPassword !== input.adminPasswordConfirm) {
    return { ok: false, error: "Konfirmasi password tidak cocok." };
  }

  const supportWhatsapp = text(input.supportWhatsapp, 20).replace(/\D/g, "");
  if (supportWhatsapp && (supportWhatsapp.length < 9 || supportWhatsapp.length > 15)) {
    return { ok: false, error: "Nomor WhatsApp harus berisi 9–15 digit." };
  }

  const locale = text(input.locale, 10) || "id-ID";
  if (!LOCALE_PATTERN.test(locale)) {
    return { ok: false, error: "Format bahasa tidak valid. Contoh: id-ID" };
  }

  const storefrontTemplate = text(input.storefrontTemplate, 40) || "compact-market";
  if (!(STOREFRONT_TEMPLATE_IDS as readonly string[]).includes(storefrontTemplate)) {
    return { ok: false, error: "Template storefront tidak dikenal." };
  }

  return {
    ok: true,
    plan: {
      storeName,
      siteUrl,
      slug: slugFromStoreName(storeName),
      tagline: text(input.tagline, 120),
      adminUsername,
      adminPassword,
      supportWhatsapp,
      locale,
      storefrontTemplate,
    },
  };
}

/**
 * Writes the install. Both statements go through `batch()` so the store row and
 * the credential land together or not at all — the half-installed state this
 * guards against is the one an operator cannot diagnose.
 *
 * Both statements are guarded, and that is not belt-and-braces. Guarding only
 * the store insert left the credential UPDATE unconditional: a zero-row insert
 * is not an error, so D1 kept the batch, the second submission was told
 * "already installed" — and had nonetheless just replaced the operator's
 * username and password with its own. Anyone polling an un-installed Worker
 * would own the store the moment its real operator installed it, because
 * `hashAdminPassword` parks every request in ~100 ms of PBKDF2 before the write.
 *
 * The credential guard is `must_change_password = 1`: only the seeded, never-
 * configured credential may be claimed, and it may be claimed once. That
 * predicate is unaffected by the store insert, so it holds whatever order the
 * batch runs in — a property `NOT EXISTS (SELECT 1 FROM stores)` would lose the
 * moment the insert landed first.
 */
export async function runInstall(
  database: D1Database,
  plan: InstallPlan,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const passwordHash = await hashAdminPassword(plan.adminPassword);
  const now = new Date().toISOString();

  // Without a seeded credential row the UPDATE would match nothing while the
  // store insert succeeded, leaving an install with no admin account and no
  // wizard to make one. Checked here so the operator is told which of the two
  // things went wrong.
  const seat = await database
    .prepare("SELECT COUNT(*) AS total FROM admin_credentials")
    .first<{ total: number }>();
  if (!seat?.total) {
    console.error("install-no-credential-row");
    return {
      ok: false,
      error:
        "Tabel admin_credentials kosong, jadi tidak ada akun admin yang bisa dipakai. Jalankan ulang migrasi database sebelum memasang.",
    };
  }

  try {
    const [storeResult, credentialResult] = await database.batch([
      database
        .prepare(
          `INSERT INTO stores (name, slug, site_url, tagline, locale, storefront_template, admin_name, support_whatsapp, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM stores)`,
        )
        .bind(
          plan.storeName,
          plan.slug,
          plan.siteUrl,
          plan.tagline || null,
          plan.locale,
          plan.storefrontTemplate,
          `${plan.storeName} Ops`,
          plan.supportWhatsapp || null,
          now,
        ),
      database
        .prepare(
          `UPDATE admin_credentials
             SET username = ?, password_hash = ?, must_change_password = 0, updated_at = ?
           WHERE id = (SELECT MIN(id) FROM admin_credentials)
             AND must_change_password = 1`,
        )
        .bind(plan.adminUsername, passwordHash, now),
    ]);

    if (!storeResult.meta.changes || !credentialResult.meta.changes) {
      return { ok: false, error: "Instalasi sudah pernah diselesaikan." };
    }
    return { ok: true };
  } catch (error) {
    console.error("install-run", error);
    return {
      ok: false,
      error: "Instalasi gagal disimpan. Coba lagi atau periksa log.",
    };
  }
}
