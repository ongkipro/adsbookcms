import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_LOGIN_WINDOW_MS,
  adminLoginRateLimitBuckets,
  checkAdminLoginRateLimit,
  checkRateLimit,
  clearAdminLoginFailures,
  getClientIp,
  recordAdminLoginFailure,
} from './rate-limit.ts';

/** Enough of KV to count with: get, put and delete over a Map. TTLs are irrelevant here. */
function createKv() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
      delete: async (key: string) => {
        store.delete(key);
      },
    } as unknown as KVNamespace,
  };
}

async function failTimes(kv: KVNamespace, username: string, ip: string, times: number) {
  for (let attempt = 0; attempt < times; attempt += 1) {
    await recordAdminLoginFailure(kv, username, ip);
  }
}

test('a rate limit check can read a window without spending from it', async () => {
  const { kv, store } = createKv();

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const peeked = await checkRateLimit(kv, 'peek-me', 3, 60_000, false);
    assert.equal(peeked.allowed, true);
    assert.equal(peeked.remaining, 3);
  }
  assert.equal(store.size, 0, 'a peek must not write a counter');

  // The consuming path is unchanged, which is what the checkout callers rely on.
  assert.equal((await checkRateLimit(kv, 'peek-me', 3, 60_000)).remaining, 2);
  assert.equal((await checkRateLimit(kv, 'peek-me', 3, 60_000)).remaining, 1);
  assert.equal((await checkRateLimit(kv, 'peek-me', 3, 60_000)).remaining, 0);
  assert.equal((await checkRateLimit(kv, 'peek-me', 3, 60_000)).allowed, false);
});

test('a correct password costs the operator nothing', async () => {
  const { kv, store } = createKv();

  // Twenty successful logins in one window must not approach any ceiling: the
  // login screen checks without consuming and records only failures.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal((await checkAdminLoginRateLimit(kv, 'admin', '203.0.113.9')).allowed, true);
  }
  assert.equal(store.size, 0);
});

test('five failures brake the account from that address only', async () => {
  const { kv } = createKv();
  const attacker = '198.51.100.7';
  const operator = '203.0.113.4';

  await failTimes(kv, 'admin', attacker, 5);

  assert.equal(
    (await checkAdminLoginRateLimit(kv, 'admin', attacker)).allowed,
    false,
    'the sixth attempt from the same address is refused',
  );

  // The reason the brake is keyed on the pair: an attacker who knows the
  // operator's username must not be able to lock them out of their own store.
  assert.equal(
    (await checkAdminLoginRateLimit(kv, 'admin', operator)).allowed,
    true,
    'the real operator, elsewhere, still gets in',
  );
});

test('one address spraying many usernames trips the address ceiling', async () => {
  const { kv } = createKv();
  const source = '198.51.100.23';

  // Four failures each against five different usernames: no pair bucket reaches
  // its limit of five, so only the address ceiling can stop this.
  for (const username of ['admin', 'owner', 'root', 'operator', 'kasir']) {
    await failTimes(kv, username, source, 4);
  }

  assert.equal((await checkAdminLoginRateLimit(kv, 'admin', source)).allowed, false);
  assert.equal((await checkAdminLoginRateLimit(kv, 'baru', source)).allowed, false);
  assert.equal(
    (await checkAdminLoginRateLimit(kv, 'admin', '203.0.113.4')).allowed,
    true,
    'the ceiling is scoped to the address that sprayed',
  );
});

test('a distributed attempt is stopped on every address it uses', async () => {
  const { kv } = createKv();

  // Ten addresses, five failures each — every pair bucket is full and no single
  // address ceiling is. This used to also deny the account everywhere, which
  // made the backstop a lockout weapon; it now denies only the addresses that
  // spent the failures. See `checkAdminLoginRateLimit`.
  for (let host = 0; host < 10; host += 1) {
    await failTimes(kv, 'admin', `198.51.100.${host}`, 5);
  }

  assert.equal((await checkAdminLoginRateLimit(kv, 'admin', '198.51.100.3')).allowed, false);
  assert.equal(
    (await checkAdminLoginRateLimit(kv, 'owner', '203.0.113.4')).allowed,
    true,
    'a different account is unaffected',
  );
});

test('a successful login clears the failures recorded before it', async () => {
  const { kv, store } = createKv();

  await failTimes(kv, 'admin', '203.0.113.4', 4);
  await clearAdminLoginFailures(kv, 'admin', '203.0.113.4');

  assert.equal(store.size, 0);
  assert.equal((await checkAdminLoginRateLimit(kv, 'admin', '203.0.113.4')).allowed, true);
});

test('login buckets are window-scoped and separate identifier from address', async () => {
  const buckets = adminLoginRateLimitBuckets('admin', '203.0.113.4');
  assert.deepEqual(
    buckets.map((bucket) => bucket.key),
    ['admin-login:pair:admin|203.0.113.4', 'admin-login:ip:203.0.113.4', 'admin-login:id:admin'],
  );
  assert.equal(ADMIN_LOGIN_WINDOW_MS, 900_000);
});

test('a missing KV binding fails open rather than locking the admin out', async () => {
  assert.equal((await checkAdminLoginRateLimit(undefined, 'admin', '203.0.113.4')).allowed, true);
  await recordAdminLoginFailure(undefined, 'admin', '203.0.113.4');
  await clearAdminLoginFailures(undefined, 'admin', '203.0.113.4');
});

test('the client address prefers the Cloudflare header over forwarded ones', () => {
  assert.equal(
    getClientIp(new Headers({ 'cf-connecting-ip': ' 203.0.113.4 ', 'x-forwarded-for': '1.1.1.1' })),
    '203.0.113.4',
  );
  assert.equal(getClientIp(new Headers({ 'x-forwarded-for': '203.0.113.5, 70.41.3.18' })), '203.0.113.5');
  assert.equal(getClientIp(new Headers()), 'unknown');
});

test('a distributed attempt cannot lock the operator out of their own admin', async () => {
  const { kv } = createKv();

  // Ten addresses, each spending its full pair allowance. That is 50 failures
  // on the identifier bucket — exactly its ceiling — for the cost of knowing
  // nothing but the username.
  for (let host = 0; host < 10; host += 1) {
    await failTimes(kv, 'operator', `203.0.113.${host}`, 5);
  }
  const identifierKey = adminLoginRateLimitBuckets('operator', 'x')[2].key;
  const windowStart =
    Math.floor(Date.now() / ADMIN_LOGIN_WINDOW_MS) * ADMIN_LOGIN_WINDOW_MS;
  assert.equal(Number(await kv.get(`${identifierKey}:${windowStart}`)), 50);

  // The operator, from an address that has never failed, must still get in.
  const operator = await checkAdminLoginRateLimit(kv, 'operator', '198.51.100.7');
  assert.equal(
    operator.allowed,
    true,
    'the identifier ceiling must not deny an address that has not failed here',
  );

  // Every address the attacker actually used stays shut.
  for (let host = 0; host < 10; host += 1) {
    const attacker = await checkAdminLoginRateLimit(kv, 'operator', `203.0.113.${host}`);
    assert.equal(attacker.allowed, false, `203.0.113.${host} must stay blocked`);
  }
});

test('the identifier ceiling still closes an address once it has failed here', async () => {
  const { kv } = createKv();

  for (let host = 0; host < 10; host += 1) {
    await failTimes(kv, 'operator', `203.0.113.${host}`, 5);
  }

  // A fresh address is open, then spends one failure of its own. From that
  // point the identifier ceiling applies to it, four short of its pair limit.
  const fresh = '198.51.100.9';
  assert.equal((await checkAdminLoginRateLimit(kv, 'operator', fresh)).allowed, true);
  await recordAdminLoginFailure(kv, 'operator', fresh);
  assert.equal((await checkAdminLoginRateLimit(kv, 'operator', fresh)).allowed, false);
});
