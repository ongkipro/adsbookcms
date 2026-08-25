/**
 * The decision logic behind the storefront's purchase social-proof toast.
 *
 * It lives here, not inside the component, because the component's own script
 * is DOM wiring — observers, listeners, class toggles — which a unit test can
 * only inspect as text. Text assertions prove a line still exists, never that
 * it still behaves. Extracting the decisions means the rules that actually
 * matter can be executed and asserted, the same reason `meta-identity.ts` was
 * pulled out of the two checkout scripts that had drifted apart.
 */

export type SocialProofBlockers = {
  /** The product gallery is on screen. */
  heroVisible: boolean;
  /** The order form section is on screen. */
  formVisible: boolean;
  /** A field inside the order form holds focus. */
  formFocused: boolean;
  /** The browser tab is not the visible one. */
  tabHidden: boolean;
};

/**
 * Whether the toast must stay hidden.
 *
 * Over the hero it covers the product photo before the visitor has read
 * anything; over the form it competes with the very action it exists to
 * cause; while a field has focus it is a distraction mid-typing; and in a
 * hidden tab it persuades nobody while still burning timers.
 */
export function isToastBlocked(blockers: SocialProofBlockers): boolean {
  return (
    blockers.heroVisible ||
    blockers.formVisible ||
    blockers.formFocused ||
    blockers.tabHidden
  );
}

/**
 * Fisher-Yates. `sort(() => Math.random() - 0.5)` is not a uniform shuffle:
 * its comparator is inconsistent, so some orderings appear far more often
 * than others — a "random" rotation that visibly repeats.
 *
 * `random` is injected so a test can pin the permutation instead of asserting
 * on chance.
 */
export function shuffleBuyers<T>(
  list: readonly T[],
  random: () => number = Math.random,
): T[] {
  const shuffled = [...list];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/** Rotates through the buyer list, wrapping at the end rather than stopping. */
export function nextBuyerIndex(current: number, total: number): number {
  if (total <= 0) return 0;
  return (current + 1) % total;
}
