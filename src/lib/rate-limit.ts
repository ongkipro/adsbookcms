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

/**
 * KV-backed fixed window.
 *
 * The previous implementation kept buckets in a module-level Map. On Workers
 * every isolate holds its own copy and isolates come and go constantly, so the
 * effective limit was multiplied by the number of live isolates and reset at
 * random — it looked like a control while enforcing close to nothing. KV is
 * shared across isolates, which is why admin login already uses it.
 *
 * KV is eventually consistent, so a burst spread across colos can still slip a
 * few requests through. That is acceptable spam damping; it is not a quota.
 */
export async function checkRateLimit(
  sessions: KVNamespace | undefined,
  key: string,
  limit: number,
  windowMs: number,
  consume = true,
): Promise<RateLimitResult> {
  const now = Date.now();
  // Without KV there is nothing shared to count in; fail open rather than block
  // every order because a binding is missing.
  if (!sessions) return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };

  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const windowKey = `${key}:${windowStart}`;

  const count = Number(await sessions.get(windowKey)) || 0;
  if (count >= limit) return { allowed: false, remaining: 0, resetAt };

  // `consume: false` reads the window without spending from it. Admin login
  // needs that split: a correct password must not cost the operator an attempt,
  // so the check runs first and only a failure is recorded afterwards.
  if (!consume) return { allowed: true, remaining: limit - count, resetAt };

  await sessions.put(windowKey, String(count + 1), {
    expirationTtl: Math.max(60, Math.ceil((resetAt - now) / 1000) + 60),
  });
  return { allowed: true, remaining: Math.max(0, limit - count - 1), resetAt };
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
 * lazy: the pair bucket is the real brake and KV cannot make it exact —
 * `checkRateLimit` is a non-atomic get-then-put, so N simultaneous guesses all
 * read the same count and spend one slot between them. It damps sequential
 * guessing, which is what a credential-stuffing script does; it does not stop a
 * parallel one. Making it exact needs a Durable Object, tracked as A-71.
 */
export async function checkAdminLoginRateLimit(
  sessions: KVNamespace | undefined,
  username: string,
  ip: string,
): Promise<RateLimitResult> {
  const buckets = adminLoginRateLimitBuckets(username, ip);
  const [pair, address, identifier] = await Promise.all(
    buckets.map((bucket) =>
      checkRateLimit(sessions, bucket.key, bucket.limit, ADMIN_LOGIN_WINDOW_MS, false),
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
  sessions: KVNamespace | undefined,
  username: string,
  ip: string,
) {
  await Promise.all(
    adminLoginRateLimitBuckets(username, ip).map((bucket) =>
      checkRateLimit(sessions, bucket.key, bucket.limit, ADMIN_LOGIN_WINDOW_MS, true),
    ),
  );
}

/** A correct password clears the record, so earlier typos cannot follow the operator. */
export async function clearAdminLoginFailures(
  sessions: KVNamespace | undefined,
  username: string,
  ip: string,
) {
  if (!sessions) return;
  const windowStart = Math.floor(Date.now() / ADMIN_LOGIN_WINDOW_MS) * ADMIN_LOGIN_WINDOW_MS;
  await Promise.all(
    adminLoginRateLimitBuckets(username, ip).map((bucket) =>
      sessions.delete(`${bucket.key}:${windowStart}`),
    ),
  );
}

export function rateLimitHeaders(remaining: number, resetAt: number) {
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return {
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(Math.floor(resetAt / 1000)),
    'retry-after': String(retryAfterSec),
  };
}
