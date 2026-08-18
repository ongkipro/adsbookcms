import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_HEADLESS_API_SCOPES,
  hashApiKeySecret,
  normalizeApiKeyPolicy,
  parseStoredApiKeyScopes,
} from './developer-api-keys.ts';
import {
  parseDomainPattern,
  parseHeadlessAllowedOrigins,
  matchOriginAgainstPattern,
  isOriginAllowed,
  validateHeadlessRequest,
  resolveAllowedOrigins,
  buildCorsHeaders,
  headlessOk,
  headlessError,
  getRequestOrigin,
} from './headless-api.ts';

function createPolicyDatabase(options: {
  keyHash: string;
  scopes?: string | null;
  allowedOrigins?: string | null;
  minuteExhausted?: boolean;
  dailyExhausted?: boolean;
  auditFails?: boolean;
}) {
  const auditValues: unknown[][] = [];
  const usageValues: unknown[][] = [];
  const database = {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) {
          values = bound;
          return statement;
        },
        async first() {
          if (query.includes('SELECT headless_allowed_origins')) {
            return { headless_allowed_origins: options.allowedOrigins ?? null };
          }
          if (query.includes('FROM developer_api_keys')) {
            return {
              id: 7,
              key_hash: options.keyHash,
              scopes: options.scopes,
              rate_limit_per_minute: 2,
              daily_quota: 3,
            };
          }
          if (query.includes('INSERT INTO developer_api_key_usage')) {
            usageValues.push(values);
            const bucketKind = values[1];
            if (bucketKind === 'minute' && options.minuteExhausted) return null;
            if (bucketKind === 'day' && options.dailyExhausted) return null;
            return { request_count: 1 };
          }
          return null;
        },
        async run() {
          if (query.includes('INSERT INTO headless_api_audit_events')) {
            auditValues.push(values);
            if (options.auditFails) throw new Error('local audit store unavailable');
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { database, auditValues, usageValues };
}

test('parseDomainPattern parses wildcard and exact domain patterns', () => {
  assert.deepEqual(parseDomainPattern('*'), { raw: '*', host: '*', isWildcardSubdomain: false });
  assert.equal(parseDomainPattern('https://example.com')?.host, 'example.com');
  assert.equal(parseDomainPattern('*.example.com')?.isWildcardSubdomain, true);
  assert.equal(parseDomainPattern('*.example.com')?.host, 'example.com');
  assert.equal(parseDomainPattern('https://*.example.com')?.isWildcardSubdomain, true);
  assert.equal(parseDomainPattern('localhost')?.host, 'localhost');
});
test('parseHeadlessAllowedOrigins accepts scoped patterns and rejects broad or malformed input', () => {
  assert.deepEqual(
    parseHeadlessAllowedOrigins([
      'https://store.example.com',
      'https://*.example.com',
      'http://localhost:4321',
    ]),
    {
      valid: true,
      patterns: [
        'https://store.example.com',
        'https://*.example.com',
        'http://localhost:4321',
      ],
    },
  );
  for (const pattern of [
    '*',
    '*evil.example.com',
    'https://example.com/path',
    'https://user@example.com',
  ]) {
    assert.equal(parseHeadlessAllowedOrigins([pattern]).valid, false, pattern);
  }
});

test('headless origins stay separate from iframe embed origins', () => {
  const locals = {
    runtimeEnv: {
      PUBLIC_EMBED_ALLOWED_ORIGINS: 'https://embed-only.example',
      PUBLIC_HEADLESS_ALLOWED_ORIGINS: 'https://api-client.example',
    },
  } as unknown as App.Locals;
  const patterns = resolveAllowedOrigins(locals);
  assert.equal(patterns.includes('https://api-client.example'), true);
  assert.equal(patterns.includes('https://embed-only.example'), false);
});


test('matchOriginAgainstPattern correctly matches origins and subdomains', () => {
  // Wildcard open
  assert.equal(matchOriginAgainstPattern('https://any-domain.com', '*'), true);

  // Exact domain
  assert.equal(matchOriginAgainstPattern('https://permatamall.shop', 'permatamall.shop'), true);
  assert.equal(matchOriginAgainstPattern('https://permatamall.shop', 'https://permatamall.shop'), true);
  assert.equal(matchOriginAgainstPattern('https://other.com', 'permatamall.shop'), false);

  // Wildcard subdomain matching
  assert.equal(matchOriginAgainstPattern('https://app.permatamall.shop', '*.permatamall.shop'), true);
  assert.equal(matchOriginAgainstPattern('https://store.dev.permatamall.shop', '*.permatamall.shop'), true);
  assert.equal(matchOriginAgainstPattern('https://permatamall.shop', '*.permatamall.shop'), true);

  // Reject domain prefix spoofing (e.g. evil-permatamall.shop should NOT match *.permatamall.shop)
  assert.equal(matchOriginAgainstPattern('https://evil-permatamall.shop', '*.permatamall.shop'), false);

  // Local development
  assert.equal(matchOriginAgainstPattern('http://localhost:3000', 'localhost'), true);
  assert.equal(matchOriginAgainstPattern('http://127.0.0.1:5173', '127.0.0.1'), true);
});

test('isOriginAllowed permits valid origins and server-side calls without Origin header', () => {
  const allowedPatterns = ['permatamall.shop', '*.mybrand.com', 'localhost'];

  // Server-to-server / cURL / native mobile apps (no Origin header) -> allowed
  assert.equal(isOriginAllowed(null, allowedPatterns), true);

  // Allowed domain
  assert.equal(isOriginAllowed('https://permatamall.shop', allowedPatterns), true);
  assert.equal(isOriginAllowed('https://shop.mybrand.com', allowedPatterns), true);
  assert.equal(isOriginAllowed('http://localhost:4321', allowedPatterns), true);

  // Unauthorized domain -> rejected
  assert.equal(isOriginAllowed('https://unauthorized-hacker.com', allowedPatterns), false);
});

test('getRequestOrigin extracts origin from Origin or Referer header', () => {
  const req1 = new Request('https://api.permatamall.shop/api/v1/storefront', {
    headers: { origin: 'https://myfront.com' },
  });
  assert.equal(getRequestOrigin(req1), 'https://myfront.com');

  const req2 = new Request('https://api.permatamall.shop/api/v1/storefront', {
    headers: { referer: 'https://referrer-site.com/checkout' },
  });
  assert.equal(getRequestOrigin(req2), 'https://referrer-site.com');
});

test('validateHeadlessRequest returns 403 response for forbidden origin', async () => {
  const secret = 'cmsads_live_forbidden_origin_test_key';
  const keyHash = await hashApiKeySecret(secret);
  const req = new Request('https://api.permatamall.shop/api/v1/storefront', {
    headers: {
      origin: 'https://unauthorized-domain.com',
      'x-app-key': secret,
    },
  });
  const { database, auditValues, usageValues } = createPolicyDatabase({ keyHash });
  const locals = { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals;
  const res = await validateHeadlessRequest(req, locals, {
    operation: 'storefrontRead',
    extraAllowed: ['https://my-authorized-app.com'],
  });
  assert.equal(res.allowed, false);
  assert.notEqual(res.errorResponse, undefined);
  assert.equal(res.errorResponse?.status, 403);
  assert.deepEqual(usageValues, [], 'an origin-denied request must not consume minute or daily usage');
  assert.deepEqual(auditValues[0]?.slice(0, 4), [7, 'storefrontRead', 'origin_denied', 403]);
});
test('validateHeadlessRequest reads the persisted Headless API allowlist', async () => {
  const secret = 'cmsads_live_persisted_origin_test_key';
  const keyHash = await hashApiKeySecret(secret);
  const request = new Request('https://api.permatamall.shop/api/v1/storefront', {
    headers: {
      origin: 'https://store.partner.example',
      'x-app-key': secret,
    },
  });
  const { database } = createPolicyDatabase({
    keyHash,
    allowedOrigins: 'https://*.partner.example',
  });
  const locals = { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals;
  const result = await validateHeadlessRequest(request, locals, {
    operation: 'storefrontRead',
  });
  assert.equal(result.allowed, true);
});


test('validateHeadlessRequest rejects missing API keys before origin-only access', async () => {
  const req = new Request('https://api.permatamall.shop/api/v1/storefront');
  const res = await validateHeadlessRequest(req, undefined, { operation: 'storefrontRead' });
  assert.equal(res.allowed, false);
  assert.equal(res.errorResponse?.status, 401);
  const json = (await res.errorResponse?.json()) as { error?: { code?: string } };
  assert.equal(json.error?.code, 'API_KEY_REQUIRED');
});

test('headlessOk returns proper JSON structure and status', async () => {
  const res = headlessOk({ test_data: 'hello' }, 200);
  assert.equal(res.status, 200);
  const json = (await res.json()) as { success: boolean; test_data: string };
  assert.equal(json.success, true);
  assert.equal(json.test_data, 'hello');
});

test('headlessError returns proper error payload structure', async () => {
  const res = headlessError('Invalid request parameters', 400, { code: 'TEST_ERROR' });
  assert.equal(res.status, 400);
  const json = (await res.json()) as { success: boolean; error: { message: string; code: string } };
  assert.equal(json.success, false);
  assert.equal(json.error.message, 'Invalid request parameters');
  assert.equal(json.error.code, 'TEST_ERROR');
});

test('authenticated success responses are never stored by a shared cache', async () => {
  const cacheControl = headlessOk({ test_data: 'hello' }, 200).headers.get('cache-control') || '';

  // A shared cache keys on URL, not on the API key, so `public`/`s-maxage` would replay an
  // authenticated body to callers holding no key.
  assert.match(cacheControl, /(^|,\s*)private(,|$)/);
  assert.doesNotMatch(cacheControl, /public|s-maxage/);

  // No /api/v1 route may widen the default back to a shared-cacheable policy.
  const routeDir = path.join(import.meta.dirname, '..', 'pages', 'api', 'v1');
  const routeFiles = await readdir(routeDir, { recursive: true, withFileTypes: true });
  for (const entry of routeFiles) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const source = await readFile(path.join(entry.parentPath, entry.name), 'utf8');
    assert.doesNotMatch(
      source,
      /['"]\s*public\s*,|s-maxage/,
      `${entry.name} declares a shared-cacheable Cache-Control on an authenticated route`
    );
  }
});

test('headlessError echoes the same allowed origin as the success path', () => {
  const origin = 'https://my-authorized-app.com';
  const corsHeaders = buildCorsHeaders(origin);

  const failure = headlessError('Data order tidak valid.', 422, { code: 'VALIDATION_ERROR' }, corsHeaders);
  const success = headlessOk({ ok: true }, 200, corsHeaders);

  // A browser integration can only read the error body when the origin is echoed back.
  assert.equal(failure.headers.get('access-control-allow-origin'), origin);
  assert.equal(
    failure.headers.get('access-control-allow-origin'),
    success.headers.get('access-control-allow-origin')
  );
  assert.equal(failure.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(failure.headers.get('cache-control'), 'no-store');

  // Without CORS headers the error stays closed rather than falling back to a blanket '*'.
  assert.equal(
    headlessError('Data order tidak valid.', 422).headers.get('access-control-allow-origin'),
    null
  );
});

test('rejected requests carry CORS headers so the caller can read the reason', async () => {
  const req = new Request('https://api.permatamall.shop/api/v1/storefront', {
    headers: { origin: 'https://my-authorized-app.com' },
  });
  const res = await validateHeadlessRequest(req, undefined, { operation: 'storefrontRead' });
  assert.equal(res.allowed, false);
  if (res.allowed) throw new Error('missing API key must be rejected');
  assert.equal(res.errorResponse.status, 401);
  assert.equal(
    res.errorResponse.headers.get('access-control-allow-origin'),
    'https://my-authorized-app.com'
  );
});

test('stored policy defaults preserve existing key access after migration', async () => {
  assert.deepEqual(parseStoredApiKeyScopes(undefined), [...DEFAULT_HEADLESS_API_SCOPES]);
  const policy = normalizeApiKeyPolicy({});
  assert.equal(policy.valid, true);
  if (policy.valid) {
    assert.deepEqual(policy.policy.scopes, [...DEFAULT_HEADLESS_API_SCOPES]);
    assert.equal(policy.policy.rateLimitPerMinute, 120);
    assert.equal(policy.policy.dailyQuota, 10_000);
  }

  const secret = 'adsbook_live_existing_key_without_policy_columns';
  const keyHash = await hashApiKeySecret(secret);
  const { database } = createPolicyDatabase({ keyHash, scopes: undefined });
  const result = await validateHeadlessRequest(
    new Request('https://api.example/api/v1/products', {
      headers: { 'x-app-key': secret },
    }),
    { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals,
    { operation: 'catalogList' },
  );
  assert.equal(result.allowed, true);
});

test('scope denial is server enforced and audit values exclude credentials and payloads', async () => {
  const secret = 'adsbook_live_scope_denial_secret';
  const keyHash = await hashApiKeySecret(secret);
  const { database, auditValues } = createPolicyDatabase({
    keyHash,
    scopes: 'catalog:read',
  });
  const response = await validateHeadlessRequest(
    new Request('https://api.example/api/v1/checkout', {
      method: 'POST',
      headers: { 'x-app-key': secret, 'content-type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'Sensitive Customer',
        customer_phone: '081234567890',
        address: 'Sensitive address',
      }),
    }),
    { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals,
    { operation: 'checkoutCreate' },
  );
  assert.equal(response.allowed, false);
  assert.equal(response.errorResponse?.status, 403);
  const payload = await response.errorResponse?.json() as { error: { code: string } };
  assert.equal(payload.error.code, 'API_SCOPE_FORBIDDEN');
  assert.equal(auditValues.length, 1);
  assert.deepEqual(auditValues[0]?.slice(0, 4), [7, 'checkoutCreate', 'scope_denied', 403]);
  const serializedAudit = JSON.stringify(auditValues);
  assert.doesNotMatch(serializedAudit, /scope_denial_secret|Sensitive Customer|081234567890|Sensitive address/);
});

test('per-key minute rate and daily quota exhaustion return distinct bounded errors', async () => {
  const secret = 'adsbook_live_quota_test_secret';
  const keyHash = await hashApiKeySecret(secret);
  for (const scenario of [
    {
      options: { keyHash, minuteExhausted: true },
      code: 'API_RATE_LIMITED',
      outcome: 'rate_limited',
    },
    {
      options: { keyHash, dailyExhausted: true },
      code: 'API_QUOTA_EXHAUSTED',
      outcome: 'quota_exhausted',
    },
  ] as const) {
    const { database, auditValues, usageValues } = createPolicyDatabase(scenario.options);
    const result = await validateHeadlessRequest(
      new Request('https://api.example/api/v1/products', {
        headers: { 'x-app-key': secret },
      }),
      { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals,
      { operation: 'catalogList' },
    );
    assert.equal(result.allowed, false);
    assert.equal(result.errorResponse?.status, 429);
    const payload = await result.errorResponse?.json() as { error: { code: string } };
    assert.equal(payload.error.code, scenario.code);
    assert.equal(auditValues[0]?.[2], scenario.outcome);
    assert.deepEqual(
      usageValues.map((values) => values[1]),
      scenario.outcome === 'rate_limited' ? ['minute'] : ['minute', 'day'],
      'a minute-rejected request must not consume the daily quota',
    );
  }
});

test('allowed requests audit the final handler status exactly once', async () => {
  const secret = 'adsbook_live_final_status_test_secret';
  const keyHash = await hashApiKeySecret(secret);
  const { database, auditValues } = createPolicyDatabase({ keyHash });
  const validation = await validateHeadlessRequest(
    new Request('https://api.example/api/v1/checkout', {
      method: 'POST',
      headers: { 'x-app-key': secret },
    }),
    { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals,
    { operation: 'checkoutCreate' },
  );
  assert.equal(validation.allowed, true);
  assert.equal(auditValues.length, 0, 'authentication alone is not a completed route outcome');
  if (!validation.allowed) return;

  const response = headlessError('Data order tidak valid.', 422, {
    code: 'VALIDATION_ERROR',
  }, validation.corsHeaders);
  assert.equal(await validation.finalize(response), response);
  assert.equal(await validation.finalize(response), response);
  assert.deepEqual(auditValues.map((values) => values.slice(0, 4)), [
    [7, 'checkoutCreate', 'allowed', 422],
  ]);
});

test('final audit storage failure never turns an accepted handler response into a retry', async () => {
  const secret = 'adsbook_live_audit_failure_test_secret';
  const keyHash = await hashApiKeySecret(secret);
  const { database } = createPolicyDatabase({ keyHash, auditFails: true });
  const validation = await validateHeadlessRequest(
    new Request('https://api.example/api/v1/checkout', {
      method: 'POST',
      headers: { 'x-app-key': secret },
    }),
    { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals,
    { operation: 'checkoutCreate' },
  );
  assert.equal(validation.allowed, true);
  if (!validation.allowed) return;

  const response = headlessOk({ order: { id: 42 } }, 201, validation.corsHeaders);
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const finalized = await validation.finalize(response);
    assert.equal(finalized, response);
    assert.equal(finalized.status, 201);
  } finally {
    console.error = originalConsoleError;
  }
});

test('operator policy validation rejects empty scopes and unbounded limits', () => {
  assert.equal(normalizeApiKeyPolicy({ scopes: [] }).valid, false);
  assert.equal(normalizeApiKeyPolicy({ scopes: ['unknown'] }).valid, false);
  assert.equal(normalizeApiKeyPolicy({ rate_limit_per_minute: 601 }).valid, false);
  assert.equal(normalizeApiKeyPolicy({ daily_quota: 100_001 }).valid, false);
});
