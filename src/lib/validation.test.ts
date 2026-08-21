import assert from "node:assert/strict";
import test from "node:test";
import { orderSubmitSchema } from "./order-schema.ts";
import { normalizePhone } from "./validation.ts";
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
