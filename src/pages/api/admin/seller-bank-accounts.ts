import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../lib/api";
import { getRuntimeEnv } from "../../../lib/env";
import { parseSellerBankAccountInput } from "../../../lib/seller-bank-account";

export const prerender = false;

const SELECT_ACCOUNTS = `
  SELECT id, bank_code, account_holder, account_number, is_active, display_order
  FROM seller_bank_accounts
  WHERE store_id = ?
  ORDER BY display_order, id
`;

async function databaseAndStore(locals: App.Locals) {
  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database?.prepare) throw new Error("Database pengaturan belum tersedia.");
  const store = await database
    .prepare("SELECT id FROM stores ORDER BY id LIMIT 1")
    .first<{ id: number }>();
  if (!store) throw new Error("Store belum tersedia.");
  return { database, store };
}

async function listAccounts(database: D1Database, storeId: number) {
  const result = await database.prepare(SELECT_ACCOUNTS).bind(storeId).all();
  return result.results || [];
}

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { database, store } = await databaseAndStore(locals);
    return jsonOk({ data: await listAccounts(database, store.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Rekening bank gagal dimuat.", 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { database, store } = await databaseAndStore(locals);
    const count = await database
      .prepare("SELECT COUNT(*) AS total FROM seller_bank_accounts WHERE store_id = ?")
      .bind(store.id)
      .first<{ total: number }>();
    if (Number(count?.total || 0) >= 20) {
      return jsonError("Maksimal 20 rekening bank per store.", 409);
    }
    const input = parseSellerBankAccountInput(await request.json());
    const duplicate = await database
      .prepare("SELECT id FROM seller_bank_accounts WHERE store_id = ? AND bank_code = ? AND account_number = ? LIMIT 1")
      .bind(store.id, input.bankCode, input.accountNumber)
      .first();
    if (duplicate) return jsonError("Rekening bank tersebut sudah tersimpan.", 409);
    const order = await database
      .prepare("SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM seller_bank_accounts WHERE store_id = ?")
      .bind(store.id)
      .first<{ next_order: number }>();
    const now = new Date().toISOString();
    await database
      .prepare(`INSERT INTO seller_bank_accounts (
        store_id, bank_code, account_holder, account_number, is_active,
        display_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`) 
      .bind(
        store.id,
        input.bankCode,
        input.accountHolder,
        input.accountNumber,
        input.isActive ? 1 : 0,
        Number(order?.next_order || 0),
        now,
        now,
      )
      .run();
    return jsonOk({ data: await listAccounts(database, store.id) }, 201);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Rekening bank gagal disimpan.", 400);
  }
};
export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const { database, store } = await databaseAndStore(locals);
    const body = await request.json() as Record<string, unknown>;
    if (Array.isArray(body.ordered_ids)) {
      const current = await listAccounts(database, store.id) as Array<{ id?: number }>;
      const currentIds = current.map((row) => Number(row.id));
      const orderedIds = body.ordered_ids.map(Number);
      if (
        orderedIds.length !== currentIds.length ||
        new Set(orderedIds).size !== currentIds.length ||
        currentIds.some((id) => !orderedIds.includes(id))
      ) {
        return jsonError("Urutan rekening tidak valid.", 422);
      }
      await database.batch(
        orderedIds.map((id, index) =>
          database
            .prepare("UPDATE seller_bank_accounts SET display_order = ?, updated_at = ? WHERE id = ? AND store_id = ?")
            .bind(index, new Date().toISOString(), id, store.id),
        ),
      );
      return jsonOk({ data: await listAccounts(database, store.id) });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) return jsonError("ID rekening tidak valid.", 422);
    const input = parseSellerBankAccountInput(body);
    const duplicate = await database
      .prepare("SELECT id FROM seller_bank_accounts WHERE store_id = ? AND bank_code = ? AND account_number = ? AND id != ? LIMIT 1")
      .bind(store.id, input.bankCode, input.accountNumber, id)
      .first();
    if (duplicate) return jsonError("Rekening bank tersebut sudah tersimpan.", 409);
    const result = await database
      .prepare(`UPDATE seller_bank_accounts
        SET bank_code = ?, account_holder = ?, account_number = ?, is_active = ?, updated_at = ?
        WHERE id = ? AND store_id = ?`)
      .bind(
        input.bankCode,
        input.accountHolder,
        input.accountNumber,
        input.isActive ? 1 : 0,
        new Date().toISOString(),
        id,
        store.id,
      )
      .run();
    if (!result.meta.changes) return jsonError("Rekening bank tidak ditemukan.", 404);
    return jsonOk({ data: await listAccounts(database, store.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Rekening bank gagal diperbarui.", 400);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { database, store } = await databaseAndStore(locals);
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) return jsonError("ID rekening tidak valid.", 422);
    const result = await database
      .prepare("DELETE FROM seller_bank_accounts WHERE id = ? AND store_id = ?")
      .bind(id, store.id)
      .run();
    if (!result.meta.changes) return jsonError("Rekening bank tidak ditemukan.", 404);
    return jsonOk({ data: await listAccounts(database, store.id) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Rekening bank gagal dihapus.", 400);
  }
};
