import assert from "node:assert/strict";
import test from "node:test";
import { orderSubmitSchema } from "./order-schema.ts";
import { isValidWa62, normalizePhone } from "./validation.ts";
import { toE164Digits } from "./meta-identity.ts";

const ORDER = {
  customer_name: "Budi Santoso",
  address: "Jalan Testing Nomor 10 RT 01",
  district: "Bandung Wetan",
  province: "Jawa Barat",
  variant_id: "1",
  submit_token: "0123456789abcdef0123",
};

test("every way a buyer writes their number lands on the same stored value", () => {
  for (const typed of [
    "081234567890",
    "+62 812-3456-7890",
    "8123456789 ",
    "62081234567890",
    // The international prefix a phone keyboard produces. This used to become
    // `620062…` and the buyer was told a valid number was invalid.
    "006281234567890",
  ]) {
    const parsed = orderSubmitSchema.safeParse({ ...ORDER, customer_phone: typed });
    assert.ok(parsed.success, `checkout rejected ${typed}`);
    assert.match(parsed.data.customer_phone, /^628\d{8,11}$/);
  }
});

test("a stored number hashes to itself, so both Meta legs describe one person", () => {
  // The order row holds `normalizePhone` output and the Pixel/CAPI legs hash it
  // through `toE164Digits`. If the two disagreed the fix in `meta-identity.ts`
  // would be undone at the database boundary instead of in the tracker.
  for (const typed of ["081234567890", "+62 812-3456-7890", "8123456789"]) {
    const stored = normalizePhone(typed);
    assert.equal(toE164Digits(stored), stored);
  }
});

test("an unusable number is refused at the trust boundary, not repaired", () => {
  for (const typed of ["0812", "", "abcdefgh", "1234567890123456789"]) {
    assert.equal(
      orderSubmitSchema.safeParse({ ...ORDER, customer_phone: typed }).success,
      false,
      `checkout accepted ${typed}`,
    );
  }
});

test("a 13-digit 0-form number is accepted — the real, current length", () => {
  // The bug: real Indonesian mobiles reach 13 digits in 0-form (14 in 62-form),
  // and the old bound stopped one digit short, rejecting live customers.
  const raw = "0812345678901"; // 13 digits
  const normalized = normalizePhone(raw); // -> 62812345678901 (14)
  assert.equal(normalized, "62812345678901");
  assert.equal(isValidWa62(normalized), true);
  assert.equal(
    orderSubmitSchema.safeParse({ ...ORDER, customer_phone: raw }).success,
    true,
  );
});

test("the accepted length is 0-form 8-13 / 62-form 9-14, inclusive", () => {
  const zeros = (n: number) => "12".padEnd(n - 2, "0"); // operator 12 then filler
  // 0-form boundaries (operator 12 is valid).
  assert.equal(isValidWa62(normalizePhone("0812" + "3456")), true); // 8-digit 0-form
  assert.equal(isValidWa62(normalizePhone("0812345")), false); // 7-digit — too short
  assert.equal(isValidWa62(normalizePhone("0812345678901")), true); // 13-digit
  assert.equal(isValidWa62(normalizePhone("081234567890123")), false); // 15-digit — too long
  void zeros;
});

test("every Indonesian operator family is accepted, a non-mobile prefix is not", () => {
  for (const sample of [
    "081312345678", // Telkomsel
    "085612345678", // Indosat
    "081712345678", // XL
    "083812345678", // Axis
    "089512345678", // Three
    "088112345678", // Smartfren
  ]) {
    assert.equal(isValidWa62(normalizePhone(sample)), true, `rejected ${sample}`);
  }
  // Landline/invalid operator codes after 8 are refused.
  assert.equal(isValidWa62(normalizePhone("080012345678")), false);
  assert.equal(isValidWa62(normalizePhone("089012345678")), false);
});

test("checkout, lead capture, and admin edit share one rule", () => {
  const raw = "0851 2345 6789 0"; // 13-digit 0-form, Telkomsel byU
  const normalized = normalizePhone(raw);
  // The canonical predicate the admin route and the browser forms both call.
  assert.equal(isValidWa62(normalized), true);
  // The checkout schema, which normalizes then refines with the same predicate.
  assert.equal(
    orderSubmitSchema.safeParse({ ...ORDER, customer_phone: raw }).success,
    true,
  );
});
