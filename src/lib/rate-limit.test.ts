import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_LOGIN_WINDOW_MS,
  adminLoginRateLimitBuckets,
  checkAdminLoginRateLimit,
  checkRateLimit,
  clearAdminLoginFailures,
  getClientIp,
  purgeExpiredRateLimits,
  recordAdminLoginFailure,
  spendAdminLoginAttempt,
} from './rate-limit.ts';

/**
 * Enough of D1 to count with: the four statements `rate-limit.ts` issues,
 * interpreted over a Map. A `prepare` for any other SQL fails the test, so a
 * new statement in the module has to be taught here on purpose.
 */
export function createRateLimitDatabase() {
  const store = new Map<string, { count: number; resetAt: number }>();
  const database = {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) {
          values = next;
          return statement;
        },
        async first() {
          if (query.startsWith('SELECT count FROM rate_limits')) {
            const row = store.get(String(values[0]));
            return row ? { count: row.count } : null;
          }
          if (query.includes('INSERT INTO rate_limits')) {
            const key = String(values[0]);
            const row = store.get(key) ?? { count: 0, resetAt: Number(values[1]) };
            row.count += 1;
            store.set(key, row);
            return { count: row.count };
          }
          throw new Error(`unexpected first(): ${query}`);
        },
        async run() {
          if (query.startsWith('DELETE FROM rate_limits WHERE key IN')) {
            for (const key of values) store.delete(String(key));
            return { meta: { changes: values.length } };
          }
          if (query.startsWith('DELETE FROM rate_limits WHERE reset_at <=')) {
            let changes = 0;
            for (const [key, row] of store) {
              if (row.resetAt <= Number(values[0])) {
                store.delete(key);
                changes += 1;
              }
            }
            return { meta: { changes } };
          }
          throw new Error(`unexpected run(): ${query}`);
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return { store, database };
}

const createKv = () => {
  const { store, database } = createRateLimitDatabase();
  return { store, kv: database };
};

async function failTimes(kv: D1Database, username: string, ip: string, times: number) {
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

test('a missing database binding fails open rather than locking the admin out', async () => {
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
  const { kv, store } = createKv();

  // Ten addresses, each spending its full pair allowance. That is 50 failures
  // on the identifier bucket — exactly its ceiling — for the cost of knowing
  // nothing but the username.
  for (let host = 0; host < 10; host += 1) {
    await failTimes(kv, 'operator', `203.0.113.${host}`, 5);
  }
  const identifierKey = adminLoginRateLimitBuckets('operator', 'x')[2].key;
  const windowStart =
    Math.floor(Date.now() / ADMIN_LOGIN_WINDOW_MS) * ADMIN_LOGIN_WINDOW_MS;
  assert.equal(store.get(`${identifierKey}:${windowStart}`)?.count, 50);

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

test('a counter store that throws fails open and never blocks the request', async () => {
  const broken = {
    prepare() {
      throw new Error('D1_ERROR: no such table: rate_limits');
    },
  } as unknown as D1Database;
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    assert.equal((await checkRateLimit(broken, 'submit-order:203.0.113.4', 10, 60_000)).allowed, true);
    assert.equal((await checkAdminLoginRateLimit(broken, 'admin', '203.0.113.4')).allowed, true);
    await recordAdminLoginFailure(broken, 'admin', '203.0.113.4');
    await clearAdminLoginFailures(broken, 'admin', '203.0.113.4');
  } finally {
    console.error = original;
  }
  // Every failure is logged under one label and none of them carries the
  // client address or username.
  assert.ok(errors.length >= 2);
  for (const entry of errors) {
    assert.equal(entry[0], 'rate-limit-store-failed');
    assert.doesNotMatch(JSON.stringify(entry[1]), /203\.0\.113\.4|admin\|/);
  }
});

test('a refused window is refused from a read and costs no write', async () => {
  const { kv, store } = createKv();
  for (let attempt = 0; attempt < 3; attempt += 1) await checkRateLimit(kv, 'burst', 3, 60_000);
  const [key] = Array.from(store.keys());
  assert.equal(store.get(key)?.count, 3);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    assert.equal((await checkRateLimit(kv, 'burst', 3, 60_000)).allowed, false);
  }
  // Twenty refused attempts left the counter exactly where the limit put it.
  assert.equal(store.get(key)?.count, 3);
});

test('expired windows are purged and live ones are kept', async () => {
  const { kv, store } = createKv();
  await checkRateLimit(kv, 'live', 5, 60_000);
  const [liveKey] = Array.from(store.keys());
  store.set('stale:0', { count: 3, resetAt: Date.now() - 1 });

  assert.equal(await purgeExpiredRateLimits(kv), 1);
  assert.deepEqual(Array.from(store.keys()), [liveKey]);
});

test('a parallel wave of login guesses is capped, not all evaluated against a stale peek', async () => {
  const { database } = createRateLimitDatabase();
  const wave = await Promise.all(
    Array.from({ length: 30 }, () => spendAdminLoginAttempt(database, 'admin', '203.0.113.9')),
  );
  assert.equal(wave.filter((result) => result.allowed).length, 10);

  // The operator's correct password clears it, like every other login bucket.
  await clearAdminLoginFailures(database, 'admin', '203.0.113.9');
  assert.equal((await spendAdminLoginAttempt(database, 'admin', '203.0.113.9')).allowed, true);
});
