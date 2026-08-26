export function getClientIp(headers: Headers) {
  const cfConnectingIp = headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();

  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();

  return headers.get('x-real-ip') || 'unknown';
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

const RATE_LIMIT_STORE_ERROR_LABEL = 'rate-limit-store-failed';

/**
 * D1-backed fixed window (ADR-021).
 *
 * Two earlier homes for this counter both failed in production. A module-level
 * Map was multiplied by the number of live isolates and reset at random. KV
 * was shared across isolates but its writes count against the Workers Free
 * plan's 1,000-per-day allowance for the *whole account*: every install on the
 * account spent from the same pool, one keystroke in a kecamatan search cost
 * one write, and when the pool ran dry every login and every search on every
 * store failed with `KV put() limit exceeded for the day`.
 *
 * D1 has a hundred times that allowance and, unlike KV, the spend is one
 * statement: `INSERT … ON CONFLICT DO UPDATE … RETURNING count` is atomic, so
 * N simultaneous requests see N distinct counts. That closes A-71 as well.
 *
 * A store failure fails open. This is spam damping, not a quota — a counter
 * that cannot be read must never take checkout or the admin down with it.
 */
export async function checkRateLimit(
  database: D1Database | undefined,
  key: string,
  limit: number,
  windowMs: number,
  consume = true,
): Promise<RateLimitResult> {
  const now = Date.now();
  // Without a database there is nothing shared to count in; fail open rather
  // than block every order because a binding is missing.
  if (!database) return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };

  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const windowKey = `${key}:${windowStart}`;

  try {
    // `consume: false` reads the window without spending from it. Admin login
    // needs that split: a correct password must not cost the operator an
    // attempt, so the check runs first and only a failure is recorded afterwards.
    if (!consume) {
      const row = await database
        .prepare('SELECT count FROM rate_limits WHERE key = ?')
        .bind(windowKey)
        .first<{ count: number }>();
      const count = Number(row?.count) || 0;
      if (count >= limit) return { allowed: false, remaining: 0, resetAt };
      return { allowed: true, remaining: limit - count, resetAt };
    }

    // A window already at its limit is refused from a read alone. Rows written
    // are the scarce D1 resource (100k/day on the Free plan, account-wide);
    // without this, a source that is being refused still cost one write per
    // attempt and could spend the day's allowance on requests that were never
    // going to be served. Reads are fifty times cheaper.
    const current = await database
      .prepare('SELECT count FROM rate_limits WHERE key = ?')
      .bind(windowKey)
      .first<{ count: number }>();
    if ((Number(current?.count) || 0) >= limit) return { allowed: false, remaining: 0, resetAt };

    const row = await database
      .prepare(
        `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = count + 1
         RETURNING count`,
      )
      .bind(windowKey, resetAt)
      .first<{ count: number }>();
    const count = Number(row?.count) || 1;
    if (count > limit) return { allowed: false, remaining: 0, resetAt };
    return { allowed: true, remaining: Math.max(0, limit - count), resetAt };
  } catch (error) {
    // The bucket name only — the rest of the key is a client address or a
    // username, neither of which belongs in a log line.
    console.error(RATE_LIMIT_STORE_ERROR_LABEL, {
      bucket: key.split(':')[0],
      error: error instanceof Error ? error.message : String(error),
    });
    // A peek that failed must report nothing spent: the login brake reads
    // `remaining < limit` as "this address has already failed here", and a
    // store error must not turn into a lockout of the real operator.
    return { allowed: true, remaining: consume ? limit - 1 : limit, resetAt };
  }
}

/** Hourly housekeeping: a window that has reset is never read again. */
export async function purgeExpiredRateLimits(database: D1Database, now = new Date()) {
  const result = await database
    .prepare('DELETE FROM rate_limits WHERE reset_at <= ?')
    .bind(now.getTime())
    .run();
  return result.meta.changes;
}

/** LOGIN-19. One window for every login bucket; also the lockout ceiling. */
export const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

/**
 * The three buckets a failed admin login is counted in.
 *
 * Neither half of the pair works alone. Keyed on the identifier alone, anyone
 * who knows the operator's username can lock them out of their own store from
 * a single request loop. Keyed on the address alone it is close to useless:
 * Indonesian mobile networks put whole cities behind one CGNAT egress, so a
 * limit low enough to stop an attacker also stops the merchant, and an attacker
 * on a residential proxy pool moves address on every attempt anyway.
 *
 * So the brake is the pair, and the two single-axis buckets are ceilings above
 * it rather than the primary control.
 */
export function adminLoginRateLimitBuckets(username: string, ip: string) {
  return [
    // The brake. Five wrong passwords for this account from this address.
    { key: `admin-login:pair:${username}|${ip}`, limit: 5 },
    // Address ceiling: one source spraying many usernames. Loose enough that a
    // shared NAT egress does not trip it on ordinary typos.
    { key: `admin-login:ip:${ip}`, limit: 20 },
    // Identifier backstop: a distributed attempt on one account. It counts
    // everywhere but only denies an address that has itself failed for this
    // account — see `checkAdminLoginRateLimit`.
    { key: `admin-login:id:${username}`, limit: 50 },
  ];
}

/**
 * Reads every login bucket without spending from any of them.
 *
 * The identifier bucket is deliberately not allowed to deny on its own. It
 * could be reached by anyone who knows the operator's username — sixty requests
 * from ten addresses, no password guessing required — and it then refused the
 * real operator, with the correct password, from an address that had never
 * failed. Measured: 10 addresses × 5 (the pair limit) = 50 = the ceiling, after
 * which the operator got a 429 for the rest of the window, repeatable
 * indefinitely at four requests a minute. A backstop that hands an attacker the
 * ability to lock the merchant out of their own admin is not a backstop.
 *
 * So it denies only an address that has itself failed for this account inside
 * the window. An attacker cannot put a failure on an address they do not
 * control, which leaves the operator a way in from anywhere; a distributed
 * attempt still hits its ceiling on every address it actually uses.
 *
 * The pair bucket is the real brake, and since ADR-021 it is exact: the spend
 * is one atomic D1 upsert, so N simultaneous guesses spend N slots (A-71).
 */
export async function checkAdminLoginRateLimit(
  database: D1Database | undefined,
  username: string,
  ip: string,
): Promise<RateLimitResult> {
  const buckets = adminLoginRateLimitBuckets(username, ip);
  const [pair, address, identifier] = await Promise.all(
    buckets.map((bucket) =>
      checkRateLimit(database, bucket.key, bucket.limit, ADMIN_LOGIN_WINDOW_MS, false),
    ),
  );

  if (!pair.allowed) return pair;
  if (!address.allowed) return address;
  // `remaining < limit` is "this address has already failed for this account".
  const addressHasFailedHere = pair.remaining < buckets[0].limit;
  if (!identifier.allowed && addressHasFailedHere) return identifier;

  return [pair, address].reduce((tightest, result) =>
    result.remaining < tightest.remaining ? result : tightest,
  );
}

/** Counts one failed attempt in every bucket. A bucket already at its limit stays there. */
export async function recordAdminLoginFailure(
  database: D1Database | undefined,
  username: string,
  ip: string,
) {
  await Promise.all(
    adminLoginRateLimitBuckets(username, ip).map((bucket) =>
      checkRateLimit(database, bucket.key, bucket.limit, ADMIN_LOGIN_WINDOW_MS, true),
    ),
  );
}

/** A correct password clears the record, so earlier typos cannot follow the operator. */
export async function clearAdminLoginFailures(
  database: D1Database | undefined,
  username: string,
  ip: string,
) {
  if (!database) return;
  const windowStart = Math.floor(Date.now() / ADMIN_LOGIN_WINDOW_MS) * ADMIN_LOGIN_WINDOW_MS;
  const keys = adminLoginRateLimitBuckets(username, ip).map(
    (bucket) => `${bucket.key}:${windowStart}`,
  );
  try {
    await database
      .prepare('DELETE FROM rate_limits WHERE key IN (?, ?, ?)')
      .bind(...keys)
      .run();
  } catch (error) {
    // Best effort: a stale failure count can only make the next window stricter.
    console.error(RATE_LIMIT_STORE_ERROR_LABEL, {
      bucket: 'admin-login-clear',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function rateLimitHeaders(remaining: number, resetAt: number) {
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return {
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(Math.floor(resetAt / 1000)),
    'retry-after': String(retryAfterSec),
  };
}
