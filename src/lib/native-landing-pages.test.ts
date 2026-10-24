import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  activeNativeLandingPages,
  isNativeLandingId,
  isRegisteredNativeSlug,
  nativeLandingIdFor,
  nonCanonicalNativeSlugs,
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

test("a register image must be a site path or an https URL", async () => {
  const { validateNativeLandingPages } = await import("./native-landing-pages.ts");
  const base = { slug: "promo", title: "Promo", productSlug: "pupuk", description: "Landing promo." };
  assert.deepEqual(validateNativeLandingPages([{ ...base, image: "/images/landing/promo.webp" }]), []);
  assert.deepEqual(validateNativeLandingPages([{ ...base, image: "https://cdn.test/promo.webp" }]), []);
  for (const image of ["javascript:alert(1)", "//evil.test/x.webp", "http://insecure.test/x.webp", "promo.webp"]) {
    assert.equal(validateNativeLandingPages([{ ...base, image }]).length, 1, image);
  }
});

test("a second ad slug canonical to another page stays out of the sitemap", () => {
  const entries = [entry({ slug: "promo-a" }), entry({ slug: "promo-a-2", canonicalSlug: "promo-a" })];
  assert.deepEqual([...nonCanonicalNativeSlugs(entries)], ["promo-a-2"]);
  assert.deepEqual(validateNativeLandingPages(entries), []);
  // Pointing at itself or at a malformed slug is a register mistake.
  for (const canonicalSlug of ["promo-a", "Bad Slug"]) {
    const errors = validateNativeLandingPages([entry({ slug: "promo-a", canonicalSlug })]);
    assert.equal(errors[0]?.reason, "canonicalSlug harus slug halaman lain.", canonicalSlug);
  }
  // The sitemap reads this set.
  const sitemap = readFileSync(new URL("../pages/sitemap.xml.ts", import.meta.url), "utf8");
  assert.match(sitemap, /!duplicates\.has\(p\.slug\)/);
});
