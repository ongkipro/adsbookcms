import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { metaNameParts, normalizeMetaText, toE164Digits } from "./meta-identity.ts";

const THANKS_TRACKER = readFileSync(
  "src/components/storefront/tracking/MetaThanksTracker.astro",
  "utf8",
);

test("a phone reaches Meta as E.164 digits whichever way the buyer typed it", () => {
  // Every one of these is a real Indonesian checkout input. Before this module
  // the browser leg converted only the leading zero, so `8...` and `+62...`
  // hashed to something the server leg never produced.
  assert.equal(toE164Digits("081234567890"), "6281234567890");
  assert.equal(toE164Digits("81234567890"), "6281234567890");
  assert.equal(toE164Digits("+62 812-3456-7890"), "6281234567890");
  assert.equal(toE164Digits("006281234567890"), "6281234567890");
  assert.equal(toE164Digits("62081234567890"), "6281234567890");
  assert.equal(toE164Digits("0812"), undefined);
  assert.equal(toE164Digits(""), undefined);
});

test("Meta name parts are lowercased and stripped of punctuation", () => {
  assert.deepEqual(metaNameParts("Budi Santoso"), {
    firstName: "budi",
    lastName: "santoso",
  });
  assert.deepEqual(metaNameParts("  Siti   Nur Aisyah "), {
    firstName: "siti",
    lastName: "nuraisyah",
  });
  assert.deepEqual(metaNameParts("Andi"), {
    firstName: "andi",
    lastName: undefined,
  });
  assert.deepEqual(metaNameParts("O'Brien Jr."), {
    firstName: "obrien",
    lastName: "jr",
  });
  assert.equal(normalizeMetaText("  Jakarta Selatan  "), "jakartaselatan");
  assert.equal(normalizeMetaText("   "), undefined);
});

test("the inline thanks tracker normalises identically to this module", () => {
  // `define:vars` forces `is:inline`, which Astro never bundles, so the tracker
  // carries a copy of these rules. A copy that drifts sends Meta two different
  // people for one purchase, and no type or runtime error would ever say so.
  for (const branch of [
    "digits.startsWith('00')",
    "digits.startsWith('620')",
    "digits.startsWith('0')",
    "digits.startsWith('8')",
    "digits.length >= 8 && digits.length <= 15",
    "replace(/[^a-z0-9]/g, '')",
  ]) {
    assert.ok(
      THANKS_TRACKER.includes(branch),
      `MetaThanksTracker.astro lost the normalisation branch ${branch}`,
    );
  }
});

test("Google enhanced-conversion names are nested where gtag reads them", () => {
  // Sent at the top level of `user_data`, gtag ignores them: the hashing cost is
  // paid and nobody is matched. They belong inside `address`, beside the
  // unhashed postal code and country.
  assert.match(
    THANKS_TRACKER,
    /address:\s*\{[\s\S]{0,400}?sha256_first_name/,
    "Google first name must sit inside user_data.address",
  );
  assert.match(
    THANKS_TRACKER,
    /address:\s*\{[\s\S]{0,600}?country:\s*'id'/,
    "Google address match key needs country beside the hashed name",
  );
  // Google trims and lowercases; it does not strip punctuation, so a multi-word
  // family name must keep its space here even though Meta removes it.
  assert.ok(
    THANKS_TRACKER.includes("nameParts.slice(1).join(' ')"),
    "Google last name must keep the space Meta strips",
  );
});
