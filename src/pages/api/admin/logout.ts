import type { APIRoute } from 'astro';
import { SESSION_COOKIE_NAME, getSessionCookie, verifyJwt } from '../../../lib/auth';
import { deleteAdminSession } from '../../../lib/admin-session';
import { getEnvValue, getRuntimeEnv } from '../../../lib/env';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = getRuntimeEnv(locals);
  const database = env?.OMS_DB as D1Database | undefined;
  const token = getSessionCookie(request);
  const session = token ? await verifyJwt(token, getEnvValue('AUTH_SECRET', env)) : null;

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
