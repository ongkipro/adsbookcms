import assert from "node:assert/strict";
import test from "node:test";
import {
  activeNativeLandingPages,
  isNativeLandingId,
  isRegisteredNativeSlug,
  nativeLandingIdFor,
  validateNativeLandingPages,
  type NativeLandingPage,
} from "./native-landing-pages.ts";
import { nativeLandingPages } from "../data/native-landing-pages.ts";

const entry = (overrides: Partial<NativeLandingPage> = {}): NativeLandingPage => ({
  slug: "promo-lebaran",
  title: "Promo Lebaran",
  productSlug: "pupuk-organik",
  description: "Landing kampanye Lebaran.",
  ...overrides,
});

test("the register that actually ships is valid", () => {
  // The build must not carry a register that misrepresents the site, and this
  // is the only check standing between a typo and a listing that 404s.
  assert.deepEqual(validateNativeLandingPages(nativeLandingPages), []);
});

test("a duplicate slug is refused — two files cannot own one URL", () => {
  const errors = validateNativeLandingPages([entry(), entry({ title: "Lain" })]);
  assert.equal(errors.length, 1);
  assert.match(errors[0].reason, /lebih dari sekali/);
});

test("a slug that cannot match a route filename is refused", () => {
  for (const slug of ["Promo Lebaran", "promo_lebaran", "/promo", "", "promo--x"]) {
    const errors = validateNativeLandingPages([entry({ slug })]);
    assert.ok(errors.length > 0, `${slug || "(kosong)"} should be refused`);
  }
});

test("an entry missing what the CMS lists is refused, naming the field", () => {
  assert.match(validateNativeLandingPages([entry({ title: "" })])[0].reason, /title/);
  assert.match(
    validateNativeLandingPages([entry({ productSlug: "" })])[0].reason,
    /productSlug/,
  );
  assert.match(
    validateNativeLandingPages([entry({ description: "" })])[0].reason,
    /description/,
  );
});

test("a page can be registered before it is ready to be linked", () => {
  const entries = [entry(), entry({ slug: "draft", isActive: false })];
  assert.deepEqual(
    activeNativeLandingPages(entries).map((item) => item.slug),
    ["promo-lebaran"],
  );
  // The middleware redirect keys off the active set, so an inactive entry must
  // not make its slug look claimable.
  assert.equal(isRegisteredNativeSlug("draft", entries), false);
  assert.equal(isRegisteredNativeSlug("promo-lebaran", entries), true);
});

test("native ids are distinguishable from CMS ids, which is what gates editing", () => {
  assert.equal(nativeLandingIdFor("promo-lebaran"), "native:promo-lebaran");
  assert.equal(isNativeLandingId("native:promo-lebaran"), true);
  assert.equal(isNativeLandingId("01J8ZQ0000000000000000"), false);
});
