import type { APIRoute } from 'astro';
import {
  getAdminCredential,
  revokeAdminSessions,
  updateAdminCredential,
} from '../../../lib/admin-credentials';
import { jsonError, jsonOk } from '../../../lib/api';
import { SESSION_COOKIE_NAME } from '../../../lib/auth';
import { getRuntimeEnv } from '../../../lib/env';

export const prerender = false;

type ProfilePayload = {
  current_password?: unknown;
  username?: unknown;
  new_password?: unknown;
  confirm_password?: unknown;
};

function runtime(locals: App.Locals) {
  const env = getRuntimeEnv(locals);
  const database = env?.OMS_DB as D1Database | undefined;
  const sessions = env?.SESSION as KVNamespace | undefined;
  return { database, sessions };
}

export const GET: APIRoute = async ({ locals }) => {
  const { database } = runtime(locals);
  if (!database) return jsonError('Database profil admin belum tersedia.', 503);

  try {
    const credential = await getAdminCredential(database, locals.admin?.username);
    if (!credential) return jsonError('Kredensial admin belum tersedia.', 404);
    return jsonOk({
      data: {
        username: credential.username,
        role: credential.role,
        display_name: credential.displayName,
        email: credential.email,
        must_change_password: credential.mustChangePassword,
        updated_at: credential.updatedAt,
      },
    });
  } catch (error) {
    console.error('admin-profile-get', error);
    return jsonError('Gagal mengambil profil admin.', 500);
  }
};

export const PUT: APIRoute = async ({ request, locals, cookies }) => {
  const { database, sessions } = runtime(locals);
  if (!database || !sessions) return jsonError('Penyimpanan profil admin belum tersedia.', 503);

  const body = await request.json().catch(() => null) as ProfilePayload | null;
  if (!body) return jsonError('Payload tidak valid.', 400);

  const currentPassword = typeof body.current_password === 'string' ? body.current_password : '';
  const username = typeof body.username === 'string' ? body.username : '';
  const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
  const confirmPassword = typeof body.confirm_password === 'string' ? body.confirm_password : '';
  if (!currentPassword || !username || !newPassword || !confirmPassword) {
    return jsonError('Username, password saat ini, dan password baru wajib diisi.', 400);
  }
  if (newPassword !== confirmPassword) return jsonError('Konfirmasi password baru tidak sama.', 400);

  try {
    const actorUsername = locals.admin?.username || '';
    const result = await updateAdminCredential(
      database,
      actorUsername,
      currentPassword,
      username,
      newPassword,
    );
    if (!result.ok) return jsonError(result.error, 400);

    await revokeAdminSessions(sessions, actorUsername);
    cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return jsonOk({
      message: 'Profil admin diperbarui. Silakan login kembali.',
      data: { username: result.username, reauthenticate: true },
    });
  } catch (error) {
    console.error('admin-profile-put', error);
    return jsonError('Gagal memperbarui profil admin.', 500);
  }
};
