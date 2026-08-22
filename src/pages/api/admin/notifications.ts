import type { APIRoute } from "astro";
import { z } from "zod";
import { jsonError, jsonOk } from "../../../lib/api.ts";
import { getRuntimeEnv } from "../../../lib/env.ts";
import {
  canReceiveCommerceNotifications,
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../../lib/notifications.ts";

export const prerender = false;

function databaseFrom(locals: App.Locals) {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  return database &&
    typeof database === "object" &&
    typeof (database as D1Database).prepare === "function"
    ? (database as D1Database)
    : null;
}

/**
 * The middleware already proved the session and that this role may reach the
 * route at all. This is the narrower product rule: `advertiser` runs ads and
 * never works an order, so commerce events are not theirs (REQ-150).
 */
function operatorFrom(locals: App.Locals) {
  const admin = locals.admin;
  if (!admin) return null;
  return canReceiveCommerceNotifications(admin.role) ? admin : null;
}

const mutationSchema = z.union([
  z.object({ action: z.literal("read"), id: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("read-all") }).strict(),
]);

export const GET: APIRoute = async ({ request, locals }) => {
  const operator = operatorFrom(locals);
  if (!operator) return jsonError("Notifikasi tidak tersedia untuk peran ini.", 403);
  const database = databaseFrom(locals);
  if (!database) return jsonError("Database notifikasi belum tersedia.", 503);

  const url = new URL(request.url);
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(30),
      // The bell polls for the badge alone; the panel asks for the list.
      // Not `z.coerce.boolean()`: that is `Boolean(string)`, so the string
      // "false" would coerce to true and silently invert the caller's intent.
      count_only: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return jsonError("Parameter notifikasi tidak valid.", 422);

  try {
    const unread = await countUnreadNotifications(database, operator.username);
    if (parsed.data.count_only) return jsonOk({ unread });
    return jsonOk({
      unread,
      notifications: await listNotifications(
        database,
        operator.username,
        parsed.data.limit,
      ),
    });
  } catch (error) {
    console.error("admin-notifications-read", error);
    return jsonError("Notifikasi gagal dimuat.", 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const operator = operatorFrom(locals);
  if (!operator) return jsonError("Notifikasi tidak tersedia untuk peran ini.", 403);
  const database = databaseFrom(locals);
  if (!database) return jsonError("Database notifikasi belum tersedia.", 503);

  const parsed = mutationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return jsonError("Aksi notifikasi tidak valid.", 422);

  try {
    if (parsed.data.action === "read-all") {
      await markAllNotificationsRead(database, operator.username);
    } else {
      await markNotificationRead(database, parsed.data.id, operator.username);
    }
    return jsonOk({
      unread: await countUnreadNotifications(database, operator.username),
    });
  } catch (error) {
    console.error("admin-notifications-write", error);
    return jsonError("Notifikasi gagal diperbarui.", 500);
  }
};
