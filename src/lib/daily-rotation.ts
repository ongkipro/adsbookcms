/**
 * A stable-per-day pick from a list.
 *
 * The home hero falls back to catalogue photos when the operator has not
 * uploaded slides of their own, and it should not always be the same three
 * products. A per-request shuffle would do that, and would also change the LCP
 * image on every load — no returning visitor and no second visitor could reuse
 * the bytes already cached, which is the opposite of what the image work was
 * for. Seeding by the date keeps the rotation while letting every visitor that
 * day share one warm set.
 *
 * `seed` is the caller's clock so this stays pure and testable.
 */
export function dailySeed(now: Date): number {
  return (
    now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate()
  );
}

export function pickDaily<T>(items: readonly T[], count: number, seed: number): T[] {
  if (count <= 0 || items.length === 0) return [];
  if (items.length <= count) return [...items];

  // A small LCG. Not cryptography — it only has to be well spread and identical
  // for everyone on the same day.
  let state = (seed % 2147483647) || 1;
  const next = () => (state = (state * 48271) % 2147483647);

  const pool = [...items];
  const picked: T[] = [];
  for (let i = 0; i < count; i += 1) {
    picked.push(...pool.splice(next() % pool.length, 1));
  }
  return picked;
}
