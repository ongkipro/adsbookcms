import { defineMiddleware } from 'astro:middleware';
import {
  CLICK_ID_COOKIE,
  hasClickId,
  parseClickIdsFromUrl,
  serializeClickIds,
} from './lib/click-ids';
import {
  canAccessAdminRoute,
  getDefaultAdminRoute,
  getSessionCookie,
  verifyJwt,
  type AdminRole,
} from './lib/auth';
import { getEnvValue, getRuntimeEnv } from './lib/env';
import { readStoreIdentity, resolveTenantConfig } from './lib/tenant';
import {
  buildEmbedFrameAncestors,
  resolveEmbedAllowedOrigins,
} from './lib/embed-security';

const JSON_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function applySecurityHeaders(
  response: Response,
  isPrivate: boolean,
  frameAncestors?: string,
) {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  if (frameAncestors) {
    response.headers.delete('X-Frame-Options');
    response.headers.set('Content-Security-Policy', frameAncestors);
  } else {
    response.headers.set('X-Frame-Options', 'DENY');
  }
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isPrivate) response.headers.set('Cache-Control', 'no-store');
  return response;
}

function readStoredSession(
  value: string | null,
  username: string,
  role: AdminRole,
) {
  if (!value) {
    return {
      active: false,
      mustChangePassword: false,
      credentialUpdatedAt: "",
    };
  }
  try {
    const parsed = JSON.parse(value) as {
      username?: unknown;
      role?: unknown;
      must_change_password?: unknown;
      credential_updated_at?: unknown;
    };
    const active =
      parsed.username === username &&
      parsed.role === role &&
      typeof parsed.credential_updated_at === "string";
    return {
      active,
      mustChangePassword: active && parsed.must_change_password === true,
      credentialUpdatedAt: active
        ? (parsed.credential_updated_at as string)
        : "",
    };
  } catch {
    return {
      active: false,
      mustChangePassword: false,
      credentialUpdatedAt: "",
    };
  }
}
async function loadStoredEmbedAllowedOrigins(
  database: D1Database | undefined,
) {
  if (!database) return null;
  try {
    const row = await database
      .prepare(
        'SELECT embed_allowed_origins FROM stores ORDER BY id LIMIT 1',
      )
      .first<{ embed_allowed_origins: string | null }>();
    return row?.embed_allowed_origins ?? null;
  } catch {
    // A database failure must not silently restore a stale, broader allowlist.
    return "";
  }
}



/**
 * Paths the installer needs before a store exists. Everything else is
 * unreachable until the wizard has run, because everything else assumes a store
 * row that is not there yet.
 */
function isInstallerPath(pathname: string): boolean {
  return (
    pathname === '/install' ||
    pathname === '/install/' ||
    pathname === '/api/install' ||
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/images/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png'
  );
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const runtime = getRuntimeEnv(context.locals);

  // Store identity is resolved once per request and handed to every consumer
  // through locals. Doing it here rather than per page keeps consumers
  // synchronous — 125 call sites cannot each be an opportunity to forget an
  // await for a value that cannot change mid-request. ADR-003.
  const identityDb = runtime?.OMS_DB as D1Database | undefined;
  const identity =
    identityDb && typeof identityDb === 'object'
      ? await readStoreIdentity(identityDb)
      : ({ state: 'unknown' } as const);
  context.locals.tenant = resolveTenantConfig(
    identity.state === 'installed' ? identity.row : null,
  );

  // A migrated database with no store row has never been set up: no migration
  // inserts one. Send the operator to the wizard rather than to twenty call
  // sites that each silently read null. Only `uninstalled` redirects —
  // `unknown` means the query failed, and a transient database fault must never
  // route a live store to its own installer.
  if (identity.state === 'uninstalled' && !isInstallerPath(url.pathname)) {
    return applySecurityHeaders(context.redirect('/install'), true);
  }
  // Once installed the wizard is gone for good; it is unauthenticated, so it
  // must not linger as a re-runnable surface.
  if (identity.state === 'installed' && isInstallerPath(url.pathname)) {
    return applySecurityHeaders(context.redirect('/hello'), true);
  }
  const siteUrl = getEnvValue('PUBLIC_SITE_URL', runtime);
  if (siteUrl && url.hostname.startsWith('www.')) {
    try {
      const canonical = new URL(siteUrl);
      if (url.hostname.slice(4) === canonical.hostname) {
        const targetUrl = new URL(context.request.url);
        targetUrl.hostname = canonical.hostname;
        targetUrl.protocol = canonical.protocol;
        targetUrl.port = canonical.port;
        return applySecurityHeaders(
          context.redirect(targetUrl.toString(), 301),
          false,
        );
      }
    } catch {}
  }
  const isEmbedForm =
    url.pathname === '/embed/form' || url.pathname === '/embed/form/';
  const embedFrameAncestors = isEmbedForm
    ? buildEmbedFrameAncestors(
        resolveEmbedAllowedOrigins(
          await loadStoredEmbedAllowedOrigins(
            runtime?.OMS_DB as D1Database | undefined,
          ),
          getEnvValue('PUBLIC_EMBED_ALLOWED_ORIGINS', runtime),
        ).origins,
      )
    : undefined;
  const isLoginPage = url.pathname === '/hello';
  const isAdminPage = url.pathname.startsWith('/admin');
  const isAdminApi =
    url.pathname === '/api/admin' || url.pathname.startsWith('/api/admin/');
  const isPrivate = isAdminPage || isAdminApi;

  if (isAdminApi && UNSAFE_METHODS.has(context.request.method)) {
    const origin = context.request.headers.get('origin');
    const fetchSite = context.request.headers.get('sec-fetch-site');
    if ((origin && origin !== url.origin) || fetchSite === 'cross-site') {
      return applySecurityHeaders(new Response(JSON.stringify({ success: false, error: 'Forbidden request origin' }), {
        status: 403,
        headers: JSON_HEADERS,
      }), true);
    }
  }

  if (isPrivate) {
    const env = getRuntimeEnv(context.locals);
    const secret = getEnvValue('AUTH_SECRET', env);
    const sessions = env?.SESSION as KVNamespace | undefined;
    const database = env?.OMS_DB as D1Database | undefined;
    const token = getSessionCookie(context.request);
    const session = token ? await verifyJwt(token, secret) : null;
    let active = false;
    let mustChangePassword = false;
    if (session && sessions && database) {
      try {
        const stored = readStoredSession(
          await sessions.get(`admin-session:${session.jti}`),
          session.username,
          session.role,
        );
        if (stored.active) {
          const credential = await database.prepare(
            `SELECT updated_at, role
            FROM admin_credentials
            WHERE username = ?
            LIMIT 1`,
          ).bind(session.username).first<{
            updated_at: string;
            role: string;
          }>();
          active =
            credential?.updated_at === stored.credentialUpdatedAt &&
            credential.role === session.role;
          mustChangePassword = active && stored.mustChangePassword;
        }
      } catch {
        active = false;
      }
    }
    if (!session || !active) {
      if (isAdminApi) {
        return applySecurityHeaders(new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401,
          headers: JSON_HEADERS,
        }), true);
      }
      return applySecurityHeaders(context.redirect('/hello'), true);
    }
    context.locals.admin = {
      username: session.username,
      role: session.role,
    };
    if (!canAccessAdminRoute(session.role, url.pathname)) {
      if (isAdminApi) {
        return applySecurityHeaders(
          new Response(
            JSON.stringify({
              success: false,
              error: "Permission denied.",
              code: "PERMISSION_DENIED",
            }),
            { status: 403, headers: JSON_HEADERS },
          ),
          true,
        );
      }
      return applySecurityHeaders(
        context.redirect(getDefaultAdminRoute(session.role)),
        true,
      );
    }
    if (url.pathname === "/admin") {
      return applySecurityHeaders(
        context.redirect(getDefaultAdminRoute(session.role)),
        true,
      );
    }
    if (mustChangePassword) {
      const mayChangePassword = url.pathname === '/admin/profile'
        || url.pathname === '/api/admin/profile'
        || url.pathname === '/api/admin/logout';
      if (!mayChangePassword) {
        if (isAdminApi) {
          return applySecurityHeaders(new Response(JSON.stringify({
            success: false,
            error: 'Ganti password default sebelum melanjutkan.',
            code: 'PASSWORD_CHANGE_REQUIRED',
          }), { status: 403, headers: JSON_HEADERS }), true);
        }
        return applySecurityHeaders(context.redirect('/admin/profile'), true);
      }
    }
  }

  const response = applySecurityHeaders(
    await next(),
    isPrivate || isLoginPage || isEmbedForm,
    embedFrameAncestors,
  );

  // Persist ad attribution click ids (Google, Meta, TikTok, UTMs) from landing/embed URL.
  if (!isPrivate) {
    const clickIds = parseClickIdsFromUrl(url);
    if (hasClickId(clickIds)) {
      const sameSiteAttr = url.protocol === 'https:' ? ' SameSite=None; Secure;' : ' SameSite=Lax;';
      response.headers.append(
        'Set-Cookie',
        `${CLICK_ID_COOKIE}=${encodeURIComponent(serializeClickIds(clickIds))};` +
          ` Path=/; Max-Age=${90 * 24 * 60 * 60};${sameSiteAttr}`,
      );
      if (clickIds._fbp) {
        response.headers.append(
          'Set-Cookie',
          `_fbp=${encodeURIComponent(clickIds._fbp)}; Path=/; Max-Age=${90 * 24 * 60 * 60};${sameSiteAttr}`,
        );
      }
      if (clickIds._fbc) {
        response.headers.append(
          'Set-Cookie',
          `_fbc=${encodeURIComponent(clickIds._fbc)}; Path=/; Max-Age=${90 * 24 * 60 * 60};${sameSiteAttr}`,
        );
      }
    }
  }

  return response;
});
