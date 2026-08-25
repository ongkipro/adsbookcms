import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  isToastBlocked,
  nextBuyerIndex,
  shuffleBuyers,
  type SocialProofBlockers,
} from "./social-proof-visibility.ts";

const TOAST = readFileSync(
  "src/components/storefront/shared/SocialProofToast.astro",
  "utf8",
);
const PRODUCT_PAGE = readFileSync("src/pages/produk/[slug].astro", "utf8");
const LANDING_PAGE = readFileSync("src/pages/[slug].astro", "utf8");

const clear: SocialProofBlockers = {
  heroVisible: false,
  formVisible: false,
  formFocused: false,
  tabHidden: false,
};

// ---------------------------------------------------------------------------
// Behaviour: executed, not pattern-matched.
// ---------------------------------------------------------------------------

test("the toast shows only when nothing is in its way", () => {
  assert.equal(isToastBlocked(clear), false);
});

test("each blocker alone is enough to suppress the toast", () => {
  // Any one of these firing on its own must hide it. An `&&` slipped in where
  // an `||` belongs would still pass a "shows when clear" test and still pass
  // an "all four block" test — only the singles catch it.
  for (const key of [
    "heroVisible",
    "formVisible",
    "formFocused",
    "tabHidden",
  ] as const) {
    assert.equal(
      isToastBlocked({ ...clear, [key]: true }),
      true,
      `${key} alone must block the toast`,
    );
  }
});

test("the toast returns once every blocker clears", () => {
  // The real sequence on a product page: hero on screen, scrolled past, form
  // reached, a field focused, then blurred and scrolled back up.
  let state: SocialProofBlockers = { ...clear, heroVisible: true };
  assert.equal(isToastBlocked(state), true, "blocked over the hero");

  state = { ...state, heroVisible: false };
  assert.equal(isToastBlocked(state), false, "free between hero and form");

  state = { ...state, formVisible: true };
  assert.equal(isToastBlocked(state), true, "blocked over the form");

  state = { ...state, formFocused: true };
  assert.equal(isToastBlocked(state), true, "still blocked while typing");

  state = { ...state, formVisible: false, formFocused: false };
  assert.equal(isToastBlocked(state), false, "free again after leaving the form");
});

test("buyer rotation wraps instead of running off the end", () => {
  assert.equal(nextBuyerIndex(0, 3), 1);
  assert.equal(nextBuyerIndex(1, 3), 2);
  assert.equal(nextBuyerIndex(2, 3), 0);
  // An empty list must not produce NaN and index into nothing.
  assert.equal(nextBuyerIndex(0, 0), 0);
});

test("the shuffle is a real permutation, keeping every buyer exactly once", () => {
  const buyers = ["a", "b", "c", "d", "e", "f"];
  // A fixed generator pins the permutation, so this asserts the algorithm
  // rather than asserting on chance.
  const values = [0.9, 0.1, 0.7, 0.3, 0.5];
  let i = 0;
  const shuffled = shuffleBuyers(buyers, () => values[i++ % values.length]);

  assert.equal(shuffled.length, buyers.length, "no buyer dropped or duplicated");
  assert.deepEqual([...shuffled].sort(), [...buyers].sort(), "same set, reordered");
  assert.notDeepEqual(shuffled, buyers, "this generator must actually reorder");
  assert.deepEqual(buyers, ["a", "b", "c", "d", "e", "f"], "input must not be mutated");
});

test("a single-entry buyer list survives the shuffle", () => {
  assert.deepEqual(shuffleBuyers(["solo"]), ["solo"]);
  assert.deepEqual(shuffleBuyers([]), []);
});

// ---------------------------------------------------------------------------
// Markup and wiring facts, which only the source can answer.
// ---------------------------------------------------------------------------

test("the toast can never intercept a tap, and is never announced", () => {
  const rootTag = TOAST.slice(
    TOAST.indexOf("<div\n  data-social-proof"),
    TOAST.indexOf('<div\n    class="flex items-center'),
  );
  assert.match(rootTag, /pointer-events-none/);
  assert.match(rootTag, /aria-hidden="true"/);
  // An aria-hidden focusable descendant is a keyboard trap a screen reader
  // cannot describe, so the toast must contain none.
  const markup = TOAST.slice(
    TOAST.indexOf("<div\n  data-social-proof"),
    TOAST.indexOf("<style>"),
  );
  assert.doesNotMatch(markup, /<(a|button|input|select|textarea)[\s>]/);
});

test("the toast is pinned top-centre", () => {
  const rootTag = TOAST.slice(
    TOAST.indexOf("<div\n  data-social-proof"),
    TOAST.indexOf('<div\n    class="flex items-center'),
  );
  for (const cls of ["fixed", "left-1/2", "top-4", "-translate-x-1/2"]) {
    assert.ok(rootTag.includes(cls), `toast lost its top-centre class ${cls}`);
  }
});

test("the component wires every input the decision logic expects", () => {
  // isToastBlocked is only as good as the signals fed to it.
  assert.match(TOAST, /isToastBlocked\(\{/);
  assert.match(TOAST, /IntersectionObserver/, "hero and form visibility");
  assert.match(TOAST, /visibilitychange/, "tab visibility");
  assert.match(TOAST, /addEventListener\('focus'/, "form focus");
  assert.match(TOAST, /shuffleBuyers\(buyers\)/);
  assert.match(TOAST, /nextBuyerIndex\(currentIndex, shuffled\.length\)/);
});

test("a missing or invalid blocker selector degrades instead of stranding the toast", () => {
  // A landing page passes no hero selector. `querySelector('')` throws, and an
  // exception during init would leave the toast at opacity-0 forever with no
  // error anyone would notice.
  assert.match(TOAST, /const findBlocker = \(selector: string \| undefined\)/);
  assert.match(TOAST, /try \{\s*return document\.querySelector\(selector\);\s*\} catch/);
  // No hero must mean "never blocked by a hero", not "blocked forever".
  assert.match(TOAST, /else isHeroVisible = false;/);
});

test("init is deferred past load so the toast cannot touch LCP or INP", () => {
  assert.match(TOAST, /setTimeout\(initSocialProof, 2000\)/);
  assert.match(TOAST, /window\.addEventListener\('load'/);
});

test("the toast reads no customer data", () => {
  // The buyer list is illustrative. Reading real orders would publish customer
  // names and cities to strangers on a public page — a disclosure, not proof.
  assert.doesNotMatch(TOAST, /OMS_DB|order-status|\/api\//);
});

test("both public product surfaces mount the toast against anchors they render", () => {
  assert.match(PRODUCT_PAGE, /<SocialProofToast/);
  assert.match(LANDING_PAGE, /<SocialProofToast/);
  // The landing page's checkout anchor differs from the product page's, and a
  // wrong selector fails silently — the toast simply never hides over the form.
  assert.match(LANDING_PAGE, /formSelector="#checkout-form"/);
  assert.ok(
    LANDING_PAGE.includes('id="checkout-form"'),
    "the landing page must still render the #checkout-form anchor the toast watches",
  );
  assert.ok(
    PRODUCT_PAGE.includes('id="form-pemesanan"'),
    "the product page must still render the #form-pemesanan anchor the toast watches",
  );
});

test("the sticky purchase bar ships hidden and hides over the hero as well as the form", () => {
  // The hero fills the first viewport, so a bar that waits for the observer's
  // first callback flashes over the product photo on load.
  assert.match(
    PRODUCT_PAGE,
    /id="sticky-purchase-bar"[^>]*style="transform: translateY\(100%\)/,
  );
  assert.match(PRODUCT_PAGE, /if \(heroVisible \|\| formVisible\)/);
});
