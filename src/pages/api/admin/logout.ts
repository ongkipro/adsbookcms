import type { APIRoute } from 'astro';
import { SESSION_COOKIE_NAME, getSessionCookie, verifyJwt } from '../../../lib/auth';
import { deleteAdminSession } from '../../../lib/admin-session';
import { getRuntimeEnv } from '../../../lib/env';
import { resolveAuthSecret } from '../../../lib/auth-secret';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = getRuntimeEnv(locals);
  const database = env?.OMS_DB as D1Database | undefined;
  const token = getSessionCookie(request);
  const session = token ? await verifyJwt(token, await resolveAuthSecret(env, database)) : null;

  if (database && session) {
    try {
      await deleteAdminSession(database, session.jti);
    } catch (error) {
      // The cookie is cleared regardless; the row expires on its own.
      console.error('admin-logout', error);
    }
  }
  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  return redirect('/hello', 303);
};
