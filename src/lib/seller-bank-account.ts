import {
  SELLER_BANK_OPTIONS,
  isSellerBankCode,
  type SellerBankCode,
} from "./payment-brand.ts";

export type SellerBankAccountInput = {
  bankCode: SellerBankCode;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  isActive: boolean;
};

const ACCOUNT_HOLDER_PATTERN = /^[\p{L} .'-]+$/u;
const ACCOUNT_NUMBER_PATTERN = /^\d{6,24}$/;
export function parseSellerBankAccountInput(value: unknown): SellerBankAccountInput {
  if (!value || typeof value !== "object") {
    throw new Error("Data rekening bank tidak valid.");
  }
  const row = value as Record<string, unknown>;
  const bankCode = String(row.bank_code || row.bankCode || "").trim().toUpperCase();
  const accountHolder = String(row.account_holder || row.accountHolder || "")
    .trim()
    .replace(/\s+/g, " ");
  const accountNumber = String(
    row.account_number || row.accountNumber || "",
  ).trim();

  if (!isSellerBankCode(bankCode)) {
    throw new Error("Jenis bank belum didukung.");
  }
  if (
    accountHolder.length < 2 ||
    accountHolder.length > 100 ||
    !ACCOUNT_HOLDER_PATTERN.test(accountHolder)
  ) {
    throw new Error(
      "Nama penerima hanya boleh berisi 2 sampai 100 huruf, spasi, titik, apostrof, atau tanda hubung.",
    );
  }
  if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
    throw new Error(
      "Nomor rekening harus berisi 6 sampai 24 digit angka tanpa spasi atau tanda baca.",
    );
  }

  return {
    bankCode,
    bankName:
      SELLER_BANK_OPTIONS.find((bank) => bank.code === bankCode)?.label || bankCode,
    accountHolder,
    accountNumber,
    isActive: row.is_active === undefined ? true : Boolean(row.is_active),
  };
}

export function sellerBankDuplicateKey(
  bankCode: string,
  accountNumber: string,
) {
  return `${bankCode.trim().toUpperCase()}:${accountNumber.replace(/\D/g, "")}`;
}
