import { useEffect, useRef, useState, type SubmitEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { SELLER_BANK_OPTIONS } from "../../lib/payment-brand";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type SellerBankAccount = {
  id: number;
  bank_code: string;
  account_holder: string;
  account_number: string;
  is_active: number | boolean;
};

type FormErrors = {
  holder?: string;
  number?: string;
};

const DEFAULT_BANK_CODE = SELLER_BANK_OPTIONS[0]?.code || "BCA";
const ACCOUNT_HOLDER_PATTERN = /^[\p{L} .'-]{2,100}$/u;
const ACCOUNT_NUMBER_PATTERN = /^\d{6,24}$/;
const bankByCode = new Map<string, (typeof SELLER_BANK_OPTIONS)[number]>(
  SELLER_BANK_OPTIONS.map((bank) => [bank.code, bank]),
);

function cleanAccountHolder(value: string) {
  return value.replace(/[^\p{L} .'-]/gu, "").replace(/\s{2,}/g, " ");
}
function cleanAccountNumber(value: string) {
  return value.replace(/\D/g, "").slice(0, 24);
}

export default function SellerBankAccounts() {
  const holderInput = useRef<HTMLInputElement>(null);
  const [accounts, setAccounts] = useState<SellerBankAccount[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [bankCode, setBankCode] = useState<string>(DEFAULT_BANK_CODE);
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState("Memuat rekening…");
  const [statusError, setStatusError] = useState(false);
  const [pending, setPending] = useState(false);

  const requestAccounts = async (
    method = "GET",
    body?: Record<string, unknown>,
  ) => {
    const response = await fetch("/api/admin/seller-bank-accounts", {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || "Rekening bank gagal diproses.");
    }
    const next = Array.isArray(payload.data) ? payload.data : [];
    setAccounts(next);
    return next as SellerBankAccount[];
  };

  useEffect(() => {
    void requestAccounts()
      .then(() => setStatus(""))
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "Rekening bank gagal dimuat.");
        setStatusError(true);
      });
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setBankCode(DEFAULT_BANK_CODE);
    setAccountHolder("");
    setAccountNumber("");
    setErrors({});
  };

  const validate = () => {
    const nextErrors: FormErrors = {};
    const normalizedHolder = accountHolder.trim().replace(/\s+/g, " ");
    if (!ACCOUNT_HOLDER_PATTERN.test(normalizedHolder)) {
      nextErrors.holder =
        "Gunakan 2–100 huruf. Spasi, titik, apostrof, dan tanda hubung diperbolehkan; angka tidak diperbolehkan.";
    }
    if (!ACCOUNT_NUMBER_PATTERN.test(accountNumber)) {
      nextErrors.number = "Gunakan 6–24 digit angka tanpa spasi atau tanda baca.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 ? normalizedHolder : null;
  };

  const mutate = async (
    method: "POST" | "PUT" | "DELETE",
    body: Record<string, unknown>,
    successMessage: string,
  ) => {
    setPending(true);
    setStatus("");
    setStatusError(false);
    try {
      await requestAccounts(method, body);
      setStatus(successMessage);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Rekening bank gagal diproses.");
      setStatusError(true);
      return false;
    } finally {
      setPending(false);
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedHolder = validate();
    if (!normalizedHolder) return;
    const currentAccount = accounts.find((account) => account.id === editingId);
    const saved = await mutate(
      editingId ? "PUT" : "POST",
      {
        id: editingId || undefined,
        bank_code: bankCode,
        account_holder: normalizedHolder,
        account_number: accountNumber,
        is_active: currentAccount ? Boolean(currentAccount.is_active) : true,
      },
      editingId ? "Perubahan rekening disimpan." : "Rekening bank ditambahkan.",
    );
    if (saved) resetForm();
  };

  const editAccount = (account: SellerBankAccount) => {
    setEditingId(account.id);
    setBankCode(account.bank_code);
    setAccountHolder(account.account_holder);
    setAccountNumber(account.account_number);
    setErrors({});
    requestAnimationFrame(() => holderInput.current?.focus());
  };

  const reorderAccount = async (index: number, delta: number) => {
    const reordered = [...accounts];
    const target = index + delta;
    if (!reordered[target]) return;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await mutate(
      "PUT",
      { ordered_ids: reordered.map((account) => account.id) },
      "Urutan rekening diperbarui.",
    );
  };

  const toggleAccount = async (account: SellerBankAccount) => {
    await mutate(
      "PUT",
      { ...account, is_active: !account.is_active },
      `Rekening ${account.is_active ? "dinonaktifkan" : "diaktifkan"}.`,
    );
  };

  const deleteAccount = async (account: SellerBankAccount) => {
    if (!window.confirm(`Hapus rekening ${account.bank_code} ${account.account_number}?`)) {
      return;
    }
    const deleted = await mutate(
      "DELETE",
      { id: account.id },
      "Rekening bank dihapus.",
    );
    if (deleted && editingId === account.id) resetForm();
  };

  return (
    <section className="mt-4 space-y-4" aria-labelledby="seller-bank-accounts-heading">
      {/* The panel had no heading at all, so a screen reader could not reach it
          by outline — it sits under the page h2 on /admin/payments. */}
      <h3
        id="seller-bank-accounts-heading"
        className="text-base leading-snug font-semibold text-slate-900"
      >
        Rekening tujuan transfer
      </h3>
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950">
        <strong className="block font-bold">Cek ulang sebelum menyimpan</strong>
        Pastikan pilihan bank, nama penerima, dan nomor rekening sama persis dengan
        buku tabungan atau aplikasi bank. Rekening aktif langsung tersedia di
        checkout sesuai urutan daftar.
      </div>

      <form
        className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-start"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="space-y-1.5">
          <label htmlFor="seller-bank-code" className="block text-xs font-bold text-slate-700">
            Bank
          </label>
          <Select
            value={bankCode}
            onValueChange={(value) => setBankCode(value || DEFAULT_BANK_CODE)}
            disabled={pending}
            required
          >
            <SelectTrigger id="seller-bank-code" className="h-11 border-slate-200 bg-white shadow-sm">
              <SelectValue>
                {bankByCode.get(bankCode)?.label || "Pilih bank"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SELLER_BANK_OPTIONS.map((bank) => (
                <SelectItem key={bank.code} value={bank.code}>
                  {bank.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="seller-bank-holder" className="block text-xs font-bold text-slate-700">
            Nama penerima
          </label>
          <Input
            ref={holderInput}
            id="seller-bank-holder"
            value={accountHolder}
            onChange={(event) => {
              setAccountHolder(cleanAccountHolder(event.target.value));
              setErrors((current) => ({ ...current, holder: undefined }));
            }}
            className="h-11 border-slate-200 bg-white shadow-sm"
            maxLength={100}
            autoComplete="off"
            aria-invalid={Boolean(errors.holder)}
            aria-describedby="seller-bank-holder-help"
            disabled={pending}
            required
          />
          <p
            id="seller-bank-holder-help"
            className={`text-[11px] leading-4 ${errors.holder ? "font-semibold text-rose-700" : "text-slate-500"}`}
          >
            {errors.holder || "Hanya huruf; tanpa angka. Harus sama dengan nama pemilik rekening."}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="seller-bank-number" className="block text-xs font-bold text-slate-700">
            Nomor rekening
          </label>
          <Input
            id="seller-bank-number"
            value={accountNumber}
            onChange={(event) => {
              setAccountNumber(cleanAccountNumber(event.target.value));
              setErrors((current) => ({ ...current, number: undefined }));
            }}
            className="h-11 border-slate-200 bg-white font-mono shadow-sm"
            inputMode="numeric"
            pattern="[0-9]{6,24}"
            minLength={6}
            maxLength={24}
            autoComplete="off"
            aria-invalid={Boolean(errors.number)}
            aria-describedby="seller-bank-number-help"
            disabled={pending}
            required
          />
          <p
            id="seller-bank-number-help"
            className={`text-[11px] leading-4 ${errors.number ? "font-semibold text-rose-700" : "text-slate-500"}`}
          >
            {errors.number || "Hanya 6–24 digit angka; tanpa huruf, spasi, atau tanda baca."}
          </p>
        </div>

        <div className="flex min-h-11 gap-2 md:pt-[25px]">
          <Button type="submit" size="xl" className="min-w-32" disabled={pending}>
            {pending ? "Menyimpan…" : editingId ? "Simpan Perubahan" : "Tambah Rekening"}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="outline"
              size="xl"
              onClick={resetForm}
              disabled={pending}
              aria-label="Batalkan perubahan rekening"
            >
              <X />
              Batal
            </Button>
          )}
        </div>
      </form>

      <p
        className={`min-h-5 text-xs font-bold ${statusError ? "text-rose-700" : "text-emerald-700"}`}
        role={statusError ? "alert" : "status"}
        aria-live="polite"
      >
        {status}
      </p>

      <div className="grid-cols-1 grid gap-2" aria-live="polite">
        {!statusError && status === "Memuat rekening…" ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            Memuat rekening…
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
            Belum ada rekening transfer bank.
          </div>
        ) : (
          accounts.map((account, index) => {
            const bank = bankByCode.get(account.bank_code);
            return (
              <article
                key={account.id}
                className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center"
              >
                <img
                  src={bank?.asset || `/images/payment/${account.bank_code.toLowerCase()}.svg`}
                  alt={bank?.label || account.bank_code}
                  className="h-12 w-20 rounded-lg border border-slate-200 bg-white object-contain px-1"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-slate-950">
                      {account.bank_code} · {account.account_holder}
                    </p>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${account.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                      {account.is_active && <CheckCircle2 className="size-3" />}
                      {account.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-slate-600">{account.account_number}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 sm:justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => void reorderAccount(index, -1)} disabled={pending || index === 0} aria-label={`Naikkan urutan ${account.bank_code}`}>
                    <ArrowUp /> Naik
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void reorderAccount(index, 1)} disabled={pending || index === accounts.length - 1} aria-label={`Turunkan urutan ${account.bank_code}`}>
                    <ArrowDown /> Turun
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => void toggleAccount(account)} disabled={pending}>
                    {account.is_active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => editAccount(account)} disabled={pending}>
                    <Pencil /> Edit
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void deleteAccount(account)} disabled={pending}>
                    <Trash2 /> Hapus
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
