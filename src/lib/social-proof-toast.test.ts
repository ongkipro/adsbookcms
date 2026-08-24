import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const TOAST = readFileSync(
  "src/components/storefront/shared/SocialProofToast.astro",
  "utf8",
);
const PRODUCT_PAGE = readFileSync("src/pages/produk/[slug].astro", "utf8");
const LANDING_PAGE = readFileSync("src/pages/[slug].astro", "utf8");

test("the toast can never intercept a tap, and is never announced", () => {
  // Both are load-bearing, and both are easy to lose in a restyle. The toast
  // sits over the top of the screen where a customer reaches to scroll, and
  // its content is marketing persuasion — repeated announcements would
  // harass a screen-reader user.
  const rootTag = TOAST.slice(
    TOAST.indexOf("<div\n  data-social-proof"),
    TOAST.indexOf("<div\n    class=\"flex items-center"),
  );
  assert.match(rootTag, /pointer-events-none/);
  assert.match(rootTag, /aria-hidden="true"/);
  // aria-hidden makes any focusable descendant a keyboard trap that a screen
  // reader cannot describe, so the toast must contain none.
  const markup = TOAST.slice(TOAST.indexOf("<div\n  data-social-proof"), TOAST.indexOf("<style>"));
  assert.doesNotMatch(markup, /<(a|button|input|select|textarea)[\s>]/);
});

test("the toast is pinned top-centre", () => {
  const rootTag = TOAST.slice(
    TOAST.indexOf("<div\n  data-social-proof"),
    TOAST.indexOf("<div\n    class=\"flex items-center"),
  );
  for (const cls of ["fixed", "left-1/2", "top-4", "-translate-x-1/2"]) {
    assert.ok(rootTag.includes(cls), `toast lost its top-centre class ${cls}`);
  }
});

test("every blocker that suppresses the toast is still wired", () => {
  // Hero, order form, focused field, and hidden tab. Losing any one of them
  // puts the toast over the product photo or over the form it exists to fill.
  assert.match(TOAST, /isHeroVisible \|\| isFormVisible \|\| isFormFocused \|\| document\.hidden/);
  assert.match(TOAST, /IntersectionObserver/);
  assert.match(TOAST, /visibilitychange/);
  assert.match(TOAST, /addEventListener\('focus'/);
});

test("a missing or invalid blocker selector degrades instead of stranding the toast", () => {
  // A landing page passes no hero selector at all. `querySelector('')` throws,
  // and an exception during init would leave the toast stuck at opacity-0
  // forever with no error anyone would notice.
  assert.match(TOAST, /const findBlocker = \(selector: string \| undefined\)/);
  assert.match(TOAST, /try \{\s*return document\.querySelector\(selector\);\s*\} catch/);
  // No hero must mean "never blocked by a hero", not "blocked forever".
  assert.match(TOAST, /else isHeroVisible = false;/);
});

test("init is deferred past load so the toast cannot touch LCP or INP", () => {
  assert.match(TOAST, /setTimeout\(initSocialProof, 2000\)/);
  assert.match(TOAST, /window\.addEventListener\('load'/);
});

test("buyer rotation uses a uniform shuffle", () => {
  // The comparator shuffle `sort(() => Math.random() - 0.5)` is not uniform —
  // its comparator is inconsistent, so some orderings appear far more often.
  // Assert on the code, not on the comment: the comment names that anti-pattern
  // in order to warn about it, so a naive source-wide search matches itself.
  const code = TOAST.split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
  assert.doesNotMatch(code, /\.sort\(/, "buyer rotation must not shuffle via sort()");
  // The in-place swap loop that makes it uniform.
  assert.match(code, /\[shuffled\[i\], shuffled\[j\]\] = \[shuffled\[j\], shuffled\[i\]\]/);
});

test("the toast reads no customer data", () => {
  // The buyer list is illustrative. Reading real orders would publish customer
  // names and cities to strangers on a public page — a disclosure, not proof.
  assert.doesNotMatch(TOAST, /OMS_DB|order-status|\/api\//);
});

test("both public product surfaces mount the toast with their own anchors", () => {
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
  assert.match(PRODUCT_PAGE, /id="sticky-purchase-bar"[^>]*style="transform: translateY\(100%\)/);
  assert.match(PRODUCT_PAGE, /if \(heroVisible \|\| formVisible\)/);
});
