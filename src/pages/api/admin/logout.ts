import type { APIRoute } from 'astro';
import { SESSION_COOKIE_NAME, getSessionCookie, verifyJwt } from '../../../lib/auth';
import { getEnvValue, getRuntimeEnv } from '../../../lib/env';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals, cookies, redirect }) => {
  const env = getRuntimeEnv(locals);
  const sessions = env?.SESSION as KVNamespace | undefined;
  const token = getSessionCookie(request);
  const session = token ? await verifyJwt(token, getEnvValue('AUTH_SECRET', env)) : null;

  if (sessions && session) {
    await sessions.delete(`admin-session:${session.jti}`);
  }
  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  return redirect('/hello', 303);
};
