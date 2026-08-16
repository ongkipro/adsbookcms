import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../../lib/api";
import {
  generateApiKeySecret,
  hashApiKeySecret,
  isApiKeyActive,
  maskApiKeySecret,
  normalizeApiKeyName,
} from "../../../../lib/developer-api-keys";
import { getRuntimeEnv } from "../../../../lib/env";

export const prerender = false;

type DeveloperApiKeyRow = {
  id: number;
  name: string;
  key_preview: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
};

function getDatabase(locals: App.Locals): D1Database | null {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  return database && typeof database === "object" ? (database as D1Database) : null;
}

export const GET: APIRoute = async ({ locals }) => {
  const database = getDatabase(locals);
  if (!database) return jsonError("Database developer belum tersedia.", 503);

  try {
    const result = await database
      .prepare(
        `SELECT id, name, key_preview, created_by, created_at, last_used_at
        FROM developer_api_keys
        WHERE revoked_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT 100`,
      )
      .all<DeveloperApiKeyRow>();

    return jsonOk({
      data: {
        keys: (result.results ?? []).map((key) => ({
          ...key,
          active: isApiKeyActive(null),
        })),
      },
    });
  } catch (error) {
    console.error("admin-developer-keys-get", error);
    return jsonError("Gagal memuat API key aktif.", 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const database = getDatabase(locals);
  if (!database) return jsonError("Database developer belum tersedia.", 503);
  const createdBy = locals.admin?.username;
  if (!createdBy) return jsonError("Sesi admin tidak valid.", 401);

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (!body) return jsonError("Payload tidak valid.", 400);

  const name = normalizeApiKeyName(body.name);
  if (name.length < 2) {
    return jsonError("Nama API key minimal 2 karakter.", 422);
  }


  try {
    const secret = generateApiKeySecret();
    const secretHash = await hashApiKeySecret(secret);
    const keyPreview = maskApiKeySecret(secret);
    const now = new Date().toISOString();
    const result = await database
      .prepare(
        `INSERT INTO developer_api_keys (
          name, key_hash, key_preview, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(name, secretHash, keyPreview, createdBy, now)
      .run();

    if (!result.success || !result.meta.last_row_id) {
      throw new Error("D1 rejected API key creation.");
    }

    return jsonOk(
      {
        message: `API key ${name} berhasil dibuat.`,
        data: {
          key: {
            id: Number(result.meta.last_row_id),
            name,
            key_preview: keyPreview,
            created_by: createdBy,
            created_at: now,
            last_used_at: null,
            active: true,
          },
          secret,
        },
      },
      201,
    );
  } catch (error) {
    console.error("admin-developer-keys-post", error);
    return jsonError("Gagal membuat API key.", 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const database = getDatabase(locals);
  if (!database) return jsonError("Database developer belum tersedia.", 503);
  const revokedBy = locals.admin?.username;
  if (!revokedBy) return jsonError("Sesi admin tidak valid.", 401);

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id < 1) {
    return jsonError("ID API key tidak valid.", 400);
  }

  try {
    const revokedAt = new Date().toISOString();
    const result = await database
      .prepare(
        `UPDATE developer_api_keys
        SET revoked_at = ?, revoked_by = ?
        WHERE id = ? AND revoked_at IS NULL`,
      )
      .bind(revokedAt, revokedBy, id)
      .run();

    if (result.meta.changes !== 1) {
      return jsonError("API key tidak ditemukan atau sudah dicabut.", 404);
    }

    return jsonOk({ message: "API key berhasil dicabut." });
  } catch (error) {
    console.error("admin-developer-keys-delete", error);
    return jsonError("Gagal mencabut API key.", 500);
  }
};
