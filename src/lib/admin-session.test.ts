import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteAdminSession,
  readActiveAdminSession,
  resolveAdminSession,
  revokeAdminSessions,
  storeAdminSession,
} from './admin-session.ts';
import { SESSION_COOKIE_NAME, signJwt, type AdminSession } from './auth.ts';

const SECRET = 'unit-test-secret-that-is-at-least-32-characters-long';

type SessionRow = {
  jti: string;
  username: string;
  role: string;
  must_change_password: number;
  credential_updated_at: string;
  expires_at: string;
};
type CredentialRow = { username: string; role: string; updated_at: string };

/** The session table joined to the credential table, over two Maps. */
function createDatabase(credentials: CredentialRow[]) {
  const sessions = new Map<string, SessionRow>();
  const creds = new Map(credentials.map((row) => [row.username, row]));
  const statement = (query: string) => {
    let values: unknown[] = [];
    const self = {
      bind(...next: unknown[]) {
        values = next;
        return self;
      },
      async first() {
        assert.match(query, /FROM admin_sessions s/);
        const row = sessions.get(String(values[0]));
        if (!row || row.expires_at <= String(values[1])) return null;
        const credential = creds.get(row.username);
        return {
          username: row.username,
          role: row.role,
          must_change_password: row.must_change_password,
          credential_updated_at: row.credential_updated_at,
          current_updated_at: credential?.updated_at ?? null,
          current_role: credential?.role ?? null,
        };
      },
      async run() {
        if (query.startsWith('DELETE FROM admin_sessions WHERE jti = ?')) {
          sessions.delete(String(values[0]));
        } else if (query.startsWith('DELETE FROM admin_sessions WHERE username = ?')) {
          for (const [jti, row] of sessions) {
            if (row.username === values[0]) sessions.delete(jti);
          }
        } else if (query === 'DELETE FROM admin_sessions') {
          sessions.clear();
        } else if (query.startsWith('DELETE FROM admin_sessions WHERE expires_at <= ?')) {
          for (const [jti, row] of sessions) {
            if (row.expires_at <= String(values[0])) sessions.delete(jti);
          }
        } else if (query.includes('INSERT INTO admin_sessions')) {
          const [jti, username, role, must, updatedAt, expiresAt] = values as string[];
          sessions.set(jti, {
            jti,
            username,
            role,
            must_change_password: Number(must),
            credential_updated_at: updatedAt,
            expires_at: expiresAt,
          });
        } else {
          throw new Error(`unexpected run(): ${query}`);
        }
        return { meta: { changes: 1 } };
      },
    };
    return self;
  };
  const database = {
    prepare: statement,
    async batch(statements: Array<{ run(): Promise<unknown> }>) {
      const results = [];
      for (const item of statements) results.push(await item.run());
      return results;
    },
  } as unknown as D1Database;
  return { database, sessions, creds };
}

const OWNER: CredentialRow = { username: 'owner', role: 'owner', updated_at: '2026-08-01T00:00:00.000Z' };

async function login(database: D1Database, credential = OWNER, mustChangePassword = false) {
  const { token, session } = await signJwt(
    { username: credential.username, role: credential.role as AdminSession['role'] },
    SECRET,
  );
  await storeAdminSession(database, session, {
    mustChangePassword,
    updatedAt: credential.updated_at,
  });
  return { token, session };
}

test('a stored session is active and carries the password-change flag', async () => {
  const { database } = createDatabase([OWNER]);
  const { session } = await login(database, OWNER, true);
  assert.deepEqual(await readActiveAdminSession(database, session), {
    username: 'owner',
    role: 'owner',
    mustChangePassword: true,
  });
});

test('rotating the credential closes every session issued before it', async () => {
  const { database, creds } = createDatabase([OWNER]);
  const { session } = await login(database);
  creds.set('owner', { ...OWNER, updated_at: '2026-08-02T00:00:00.000Z' });
  assert.equal(await readActiveAdminSession(database, session), null);
});

test('a role change and a removed credential both close the session', async () => {
  const { database, creds } = createDatabase([OWNER]);
  const { session } = await login(database);
  creds.set('owner', { ...OWNER, role: 'admin' });
  assert.equal(await readActiveAdminSession(database, session), null);
  creds.delete('owner');
  assert.equal(await readActiveAdminSession(database, session), null);
});

test('a token whose claims disagree with the stored row is rejected', async () => {
  const { database } = createDatabase([OWNER]);
  const { session } = await login(database);
  assert.equal(await readActiveAdminSession(database, { ...session, role: 'admin' }), null);
  assert.equal(await readActiveAdminSession(database, { ...session, username: 'other' }), null);
  assert.equal(await readActiveAdminSession(database, { ...session, jti: 'unknown-jti-value-1' }), null);
});

test('an expired row is inactive and is swept by the next login', async () => {
  const { database, sessions } = createDatabase([OWNER]);
  const { session } = await login(database);
  sessions.get(session.jti)!.expires_at = '2000-01-01T00:00:00.000Z';
  assert.equal(await readActiveAdminSession(database, session), null);
  await login(database);
  assert.equal(sessions.has(session.jti), false);
  assert.equal(sessions.size, 1);
});

test('logout deletes one session; revocation deletes one operator or everyone', async () => {
  const cs: CredentialRow = { username: 'cs', role: 'customer_service', updated_at: OWNER.updated_at };
  const { database, sessions } = createDatabase([OWNER, cs]);
  const owner1 = await login(database);
  await login(database);
  await login(database, cs);
  assert.equal(sessions.size, 3);

  await deleteAdminSession(database, owner1.session.jti);
  assert.equal(sessions.size, 2);
  await revokeAdminSessions(database, 'owner');
  assert.deepEqual(Array.from(sessions.values()).map((row) => row.username), ['cs']);
  await revokeAdminSessions(database);
  assert.equal(sessions.size, 0);
});

test('resolveAdminSession goes from cookie to record and fails closed', async () => {
  const { database } = createDatabase([OWNER]);
  const { token } = await login(database);
  const request = (cookie?: string) =>
    new Request('https://store.example.test/admin', {
      headers: cookie ? { cookie } : {},
    });

  const active = await resolveAdminSession(database, request(`${SESSION_COOKIE_NAME}=${token}`), SECRET);
  assert.equal(active?.username, 'owner');
  assert.equal(await resolveAdminSession(database, request(), SECRET), null);
  assert.equal(await resolveAdminSession(database, request(`${SESSION_COOKIE_NAME}=${token}x`), SECRET), null);
  assert.equal(await resolveAdminSession(undefined, request(`${SESSION_COOKIE_NAME}=${token}`), SECRET), null);

  const broken = { prepare() { throw new Error('D1_ERROR'); } } as unknown as D1Database;
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await resolveAdminSession(broken, request(`${SESSION_COOKIE_NAME}=${token}`), SECRET), null);
  } finally {
    console.error = original;
  }
});
