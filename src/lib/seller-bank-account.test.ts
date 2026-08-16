import assert from "node:assert/strict";
import test from "node:test";
import {
  parseSellerBankAccountInput,
  sellerBankDuplicateKey,
} from "./seller-bank-account.ts";

test("seller bank input normalizes holder spacing and account identity", () => {
  assert.deepEqual(
    parseSellerBankAccountInput({
      bank_code: "bca",
      account_holder: "  Siti   Aminah  ",
      account_number: "1234567890",
      is_active: true,
    }),
    {
      bankCode: "BCA",
      bankName: "BCA",
      accountHolder: "Siti Aminah",
      accountNumber: "1234567890",
      isActive: true,
    },
  );
});

test("seller bank input rejects unsupported banks and invalid identities", () => {
  assert.throws(() =>
    parseSellerBankAccountInput({
      bank_code: "UNKNOWN",
      account_holder: "Siti Aminah",
      account_number: "1234567890",
    }),
  );
  assert.throws(() =>
    parseSellerBankAccountInput({
      bank_code: "BCA",
      account_holder: "Siti Aminah 2",
      account_number: "1234567890",
    }),
  );
  assert.throws(() =>
    parseSellerBankAccountInput({
      bank_code: "BCA",
      account_holder: "Siti Aminah",
      account_number: "123-456-7890",
    }),
  );
  assert.throws(() =>
    parseSellerBankAccountInput({
      bank_code: "BCA",
      account_holder: "Siti Aminah",
      account_number: "123",
    }),
  );
});

test("seller bank duplicate key ignores formatting", () => {
  assert.equal(
    sellerBankDuplicateKey("bca", "123-456"),
    sellerBankDuplicateKey("BCA", "123456"),
  );
});
