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
import { isRegisteredNativeSlug } from './lib/native-landing-pages';
import { readStoreIdentity, resolveTenantConfig } from './lib/tenant';
import {
  buildEmbedFrameAncestors,
  resolveEmbedAllowedOrigins,
} from './lib/embed-security';
import {
  ensureSchemaUpgraded,
  SCHEMA_UPGRADE_ERROR_LABEL,
  SchemaUpgradeError,
} from './lib/schema-version';
import {
  evaluateOperationalAlerts,
  schemaAlertFromError,
} from './lib/operational-alerts';
import { CMS_VERSION } from './lib/version';

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
  // Sent unconditionally on purpose. RFC 6797 section 8.1 requires a user agent
  // to ignore an STS header received over insecure transport, so this is inert
  // on http and on local dev, and there is no protocol to branch on here.
  //
  // No includeSubDomains: this ships to every install, and committing every
  // future subdomain of every store to HTTPS is not a promise this file can
  // keep. No preload either - that one is close to irreversible. A store that
  // wants both can turn on zone-level HSTS in Cloudflare.
  response.headers.set('Strict-Transport-Security', 'max-age=31536000');
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
/**
 * The product slug a native landing page has taken over, or null.
 *
 * Reads only when the caller has already established the path is a registered
 * native slug, so this is not a per-request database hit.
 */
async function readNativeProductPageSlug(
  database: D1Database | undefined,
  slug: string,
): Promise<string | null> {
  if (!database?.prepare || !slug) return null;
  try {
    const row = await database
      .prepare(
        `SELECT p.slug AS product_slug
           FROM landing_pages lp
           INNER JOIN products p ON CAST(p.id AS TEXT) = lp.product_id
          WHERE lp.slug = ?
            AND lp.source = 'native'
            AND lp.is_product_page = 1
            AND lp.is_active = 1
          LIMIT 1`,
      )
      .bind(slug)
      .first<{ product_slug: string }>();
    return row?.product_slug || null;
  } catch (error) {
    // Never take a live landing page down because the claim could not be read.
    console.error('native-landing-claim-read-failed', error);
    return null;
  }
}

function isInstallerRoute(pathname: string): boolean {
  return (
    pathname === '/install' ||
    pathname === '/install/' ||
    pathname === '/api/install'
  );
}

/**
 * The installer's own routes plus the assets its page needs to render. Used
 * only while the store is *not* installed, to let the wizard through.
 *
 * Deliberately not reused for the installed case: an installed store that
 * redirected `/images/…` would answer a missing image with a 302 to the login
 * screen instead of a 404 — which is what it did.
 */
function isInstallerPath(pathname: string): boolean {
  return (
    isInstallerRoute(pathname) ||
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/images/') ||
    pathname === '/favicon.ico' ||
    pathname === '/favicon.png'
  );
}

export function createMiddleware(
  ensureSchemaReady: (database: D1Database) => Promise<unknown> =
    ensureSchemaUpgraded,
) {
  return defineMiddleware(async (context, next) => {
  // `context.url`, never a URL built from the raw request. Astro routes on a
  // normalized pathname — it decodes percent-escapes in a loop and collapses
  // duplicate slashes — and exposes the result here, while leaving
  // `context.request` at the raw bytes the client sent. Reading the raw URL
  // meant this middleware classified one path while Astro served another:
  // `//api/admin/settings` and `/%61pi/admin/settings` were not "private", so
  // the session check, the role check, the CSRF origin check and the rotation
  // gate were all skipped and the handler ran anyway. Every admin surface was
  // readable, and writable cross-site, with no session at all.
  const url = context.url;
  const runtime = getRuntimeEnv(context.locals);
  const identityDb = runtime?.OMS_DB as D1Database | undefined;
  try {
    if (!identityDb?.prepare) {
      throw new SchemaUpgradeError(
        'SCHEMA_UPGRADE_NO_DATABASE',
        CMS_VERSION.schemaVersion,
        null,
      );
    }
    await ensureSchemaReady(identityDb);
  } catch (error) {
    const schemaError =
      error instanceof SchemaUpgradeError
        ? error
        : new SchemaUpgradeError(
            'SCHEMA_UPGRADE_READ_FAILED',
            CMS_VERSION.schemaVersion,
            null,
          );
    console.error(SCHEMA_UPGRADE_ERROR_LABEL, {
      code: schemaError.code,
      expected: schemaError.expected,
      applied: schemaError.applied,
      migration: schemaError.migration,
    });
    await evaluateOperationalAlerts([schemaAlertFromError(schemaError)], {
      store: runtime?.SESSION as KVNamespace | undefined,
      webhookUrl: getEnvValue('OPS_ALERT_WEBHOOK_URL', runtime),
    });

    const apiRequest = url.pathname === '/api' || url.pathname.startsWith('/api/');
    const response = apiRequest
      ? new Response(
          JSON.stringify({
            success: false,
            error: 'Database belum siap menerima permintaan.',
            code: 'SCHEMA_UPGRADE_FAILED',
          }),
          { status: 503, headers: JSON_HEADERS },
        )
      : new Response(
          'Database toko belum siap. Periksa status migrasi di Workers Logs.',
          {
            status: 503,
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          },
        );
    return applySecurityHeaders(response, true);
  }

  // Canonical host first. This used to sit below the installer redirects, which
  // are relative - so `www` reached `/install` and the wizard was served on the
  // non-canonical host, and an installed store took two hops to get home. It is
  // also a host-level decision that needs no store row, so answering it here
  // spares a D1 read on every `www` request.
  const siteUrl = getEnvValue('PUBLIC_SITE_URL', runtime);
  if (siteUrl && url.hostname.startsWith('www.')) {
    try {
      const canonical = new URL(siteUrl);
      if (url.hostname.slice(4) === canonical.hostname) {
        const targetUrl = new URL(url);
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

  // Store identity is resolved once per request and handed to every consumer
  // through locals. Doing it here rather than per page keeps consumers
  // synchronous — 125 call sites cannot each be an opportunity to forget an
  // await for a value that cannot change mid-request. ADR-003.
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
  if (
    (identity.state === 'uninstalled' || identity.state === 'unmigrated') &&
    !isInstallerPath(url.pathname)
  ) {
    return applySecurityHeaders(context.redirect('/install'), true);
  }
  // Once installed the wizard is gone for good; it is unauthenticated, so it
  // must not linger as a re-runnable surface.
  if (identity.state === 'installed' && isInstallerRoute(url.pathname)) {
    return applySecurityHeaders(context.redirect('/hello'), true);
  }

  // A native landing page that has taken over a product page must answer on
  // the product URL only. Its route is a real file, so it never reaches the
  // `[slug].astro` catch-all that redirects CMS pages — this is the only place
  // that sees it.
  //
  // Ordered to stay cheap: the register is compiled in, so a path that is not
  // a registered native slug is ruled out in memory and never touches D1. The
  // header check comes first because `/produk/<slug>` rewrites here, and
  // redirecting a rewrite would put the two routes in the loop A21 already
  // paid for once.
  if (
    identity.state === 'installed' &&
    !context.request.headers.get('x-adsbook-product-page') &&
    isRegisteredNativeSlug(url.pathname.replace(/^\/|\/$/g, ''))
  ) {
    const claimedProductSlug = await readNativeProductPageSlug(
      identityDb,
      url.pathname.replace(/^\/|\/$/g, ''),
    );
    if (claimedProductSlug) {
      return applySecurityHeaders(
        context.redirect(`/produk/${claimedProductSlug}`, 308),
        false,
      );
    }
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
  // Not `startsWith('/admin')`: that also claims `/admin-sale` and
  // `/administrasi`, so a landing page whose slug merely begins with those
  // letters would send every customer to the login screen.
  const isAdminPage =
    url.pathname === '/admin' || url.pathname.startsWith('/admin/');
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
      mustChangePassword,
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
}

export const onRequest = createMiddleware();
