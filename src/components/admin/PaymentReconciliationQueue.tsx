import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type PaymentTransaction = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  channelCode: string;
  billedAmount: number;
  providerReference: string;
  createdAt: string;
  expiresAt: string | null;
  status: string;
  confirmedBy: string;
  confirmedRole: string;
  confirmedAt: string | null;
  confirmationNote: string;
  confirmationEligible: boolean;
  confirmationBlockReason: string;
};

type QueueSummary = {
  pendingCount: number;
  pendingBilled: number;
  expiredCount: number;
  oldestCreatedAt: string | null;
};

type PaginationState = {
  page: number;
  totalPages: number;
  totalItems: number;
};

type Draft = {
  amount: string;
  reference: string;
  note: string;
  confirmed: boolean;
};

type FieldErrors = Partial<Record<keyof Draft, string>>;

const EMPTY_SUMMARY: QueueSummary = {
  pendingCount: 0,
  pendingBilled: 0,
  expiredCount: 0,
  oldestCreatedAt: null,
};

const EMPTY_DRAFT: Draft = {
  amount: "",
  reference: "",
  note: "",
  confirmed: false,
};

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

function firstString(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function firstNumber(row: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeTransaction(row: Record<string, unknown>): PaymentTransaction {
  return {
    id: firstNumber(row, "id", "transaction_id"),
    orderNumber: firstString(row, "order_number", "orderNumber") || "—",
    customerName: firstString(row, "customer_name", "customerName") || "—",
    customerPhone: firstString(row, "customer_phone", "customerPhone"),
    channelCode: firstString(row, "channel_code", "channelCode") || "—",
    billedAmount: firstNumber(
      row,
      "billed_amount",
      "total_amount",
      "billedAmount",
      "totalAmount",
      "amount",
    ),
    providerReference: firstString(
      row,
      "provider_reference",
      "provider_transaction_id",
      "providerReference",
      "providerTransactionId",
    ),
    createdAt: firstString(row, "created_at", "createdAt"),
    expiresAt: firstString(row, "expires_at", "expiresAt") || null,
    status: firstString(row, "status") || "pending",
    confirmedBy: firstString(row, "confirmed_by", "confirmedBy"),
    confirmedRole: firstString(row, "confirmed_role", "confirmedRole"),
    confirmedAt: firstString(row, "confirmed_at", "confirmedAt") || null,
    confirmationNote: firstString(row, "confirmation_note", "confirmationNote"),
    confirmationEligible:
      row.confirmation_eligible !== false && Number(row.confirmation_eligible ?? 1) !== 0,
    confirmationBlockReason: firstString(
      row,
      "confirmation_block_reason",
      "confirmationBlockReason",
    ),
  };
}

function normalizeSummary(
  row: Record<string, unknown>,
  transactions: PaymentTransaction[],
  totalItems: number,
): QueueSummary {
  return {
    pendingCount:
      firstNumber(row, "pending_count", "pendingCount") || totalItems,
    pendingBilled:
      firstNumber(row, "pending_billed", "pending_total", "pendingBilled") ||
      transactions.reduce((total, item) => total + item.billedAmount, 0),
    expiredCount: firstNumber(row, "overdue_count", "expired_count", "expiredCount"),
    oldestCreatedAt:
      firstString(row, "oldest_created_at", "oldest_pending_at", "oldestCreatedAt") ||
      transactions.at(-1)?.createdAt ||
      null,
  };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : `${dateTime.format(date)} WIB`;
}

function formatAge(value: string | null, now: number) {
  if (!value) return "Usia tidak tersedia";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Usia tidak tersedia";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam ${minutes % 60} menit`;
  return `${Math.floor(hours / 24)} hari ${hours % 24} jam`;
}

function isExpired(value: string | null, now: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= now;
}

function parseEnteredAmount(value: string) {
  const normalized = value.replace(/[^\d-]/g, "");
  return normalized ? Number(normalized) : Number.NaN;
}

function formatBlockReason(value: string) {
  const labels: Record<string, string> = {
    provider_reference_missing: "Referensi provider belum tersedia.",
    stock_restored: "Stok order sudah dipulihkan; pembayaran tidak boleh dikonfirmasi dari antrean ini.",
    shipping_not_pending: "Status pengiriman sudah berubah dari pending.",
    order_payment_status_locked: "Status pembayaran order sudah terkunci.",
    transaction_status_locked: "Status transaksi sudah berubah.",
  };
  return labels[value] || value || "Transaksi ini tidak memenuhi syarat konfirmasi.";
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const error = new Error(payload.error || "Permintaan gagal diproses.");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return payload;
}

function TransactionDetails({
  transaction,
  now,
}: {
  transaction: PaymentTransaction;
  now: number;
}) {
  const expired = isExpired(transaction.expiresAt, now);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{transaction.channelCode}</Badge>
        <Badge variant={expired ? "destructive" : "secondary"}>
          <Clock3 data-icon="inline-start" />
          {expired ? "Lewat batas — wajib periksa AutoLaris" : formatAge(transaction.createdAt, now)}
        </Badge>
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Tagihan tercatat</dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">
            {currency.format(transaction.billedAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Referensi provider</dt>
          <dd className="mt-1 break-all font-mono text-xs font-medium">
            {transaction.providerReference || "Belum tersedia"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Dibuat</dt>
          <dd className="mt-1 text-xs">{formatDate(transaction.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Kedaluwarsa</dt>
          <dd className="mt-1 text-xs">{formatDate(transaction.expiresAt)}</dd>
        </div>
      </dl>
    </>
  );
}

export default function PaymentReconciliationQueue() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [viewStatus, setViewStatus] = useState<"pending" | "paid">("pending");
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    totalPages: 0,
    totalItems: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<PaymentTransaction | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const amountRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const confirmedRef = useRef<HTMLButtonElement>(null);
  const serverErrorRef = useRef<HTMLDivElement>(null);
  const loadSequence = useRef(0);

  async function loadQueue(page = pagination.page, background = false) {
    const requestId = ++loadSequence.current;
    background ? setRefreshing(true) : setLoading(true);
    setLoadError("");
    try {
      const query = new URLSearchParams({
        status: viewStatus,
        page: String(page),
        page_size: "25",
      });
      const payload = await readJson(
        await fetch(`/api/admin/payment-reconciliation?${query}`, {
          headers: { Accept: "application/json" },
        }),
      );
      const data = payload.data && typeof payload.data === "object" ? payload.data : {};
      const rawTransactions = Array.isArray(data.transactions)
        ? data.transactions
        : Array.isArray(data.items)
          ? data.items
          : [];
      const nextTransactions = rawTransactions.map((row: Record<string, unknown>) =>
        normalizeTransaction(row),
      );
      const rawPagination =
        data.pagination && typeof data.pagination === "object" ? data.pagination : {};
      const nextPagination = {
        page: firstNumber(rawPagination, "page") || page,
        totalPages: firstNumber(rawPagination, "total_pages", "totalPages"),
        totalItems:
          firstNumber(rawPagination, "total", "total_items", "totalItems") ||
          nextTransactions.length,
      };
      const rawSummary = data.summary && typeof data.summary === "object" ? data.summary : {};
      if (requestId !== loadSequence.current) return;
      setTransactions(nextTransactions);
      setPagination(nextPagination);
      setSummary(normalizeSummary(rawSummary, nextTransactions, nextPagination.totalItems));
      setNow(Date.now());
    } catch (error) {
      if (requestId !== loadSequence.current) return;
      setLoadError(error instanceof Error ? error.message : "Antrean gagal dimuat.");
    } finally {
      if (requestId === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    void loadQueue(1);
  }, [viewStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (selected || viewStatus !== "pending") return;
    const timer = window.setInterval(() => {
      void loadQueue(pagination.page, true);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [pagination.page, selected, viewStatus]);

  function openVerification(transaction: PaymentTransaction) {
    if (viewStatus !== "pending" || !transaction.confirmationEligible) return;
    setSelected(transaction);
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setServerError("");
  }

  function closeVerification(open: boolean) {
    if (!open && !submitting) {
      setSelected(null);
      setFieldErrors({});
      setServerError("");
    }
  }

  function validateDraft(transaction: PaymentTransaction) {
    const nextErrors: FieldErrors = {};
    const enteredAmount = parseEnteredAmount(draft.amount);
    if (!Number.isFinite(enteredAmount) || enteredAmount !== transaction.billedAmount) {
      nextErrors.amount = "Masukkan nominal tagihan tercatat dengan tepat.";
    }
    if (!draft.reference.trim() || draft.reference.trim() !== transaction.providerReference) {
      nextErrors.reference = "Masukkan referensi provider yang sama persis.";
    }
    const noteLength = draft.note.trim().length;
    if (noteLength < 5 || noteLength > 500) {
      nextErrors.note = "Catatan audit wajib berisi 5–500 karakter.";
    }
    if (!draft.confirmed) {
      nextErrors.confirmed = "Konfirmasi pemeriksaan dashboard AutoLaris wajib dicentang.";
    }
    return nextErrors;
  }

  async function submitVerification(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!selected || submitting) return;
    const nextErrors = validateDraft(selected);
    setFieldErrors(nextErrors);
    setServerError("");
    const firstError = (Object.keys(nextErrors) as Array<keyof Draft>)[0];
    if (firstError) {
      const refs = {
        amount: amountRef,
        reference: referenceRef,
        note: noteRef,
        confirmed: confirmedRef,
      };
      refs[firstError].current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await readJson(
        await fetch("/api/admin/payment-reconciliation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transaction_id: selected.id,
            verified_amount: parseEnteredAmount(draft.amount),
            provider_reference: draft.reference.trim(),
            note: draft.note.trim(),
            confirmed: true,
          }),
        }),
      );
      const orderNumber = selected.orderNumber;
      setAnnouncement(`Pembayaran ${orderNumber} dikonfirmasi lunas di CMS.`);
      setSelected(null);
      await loadQueue(pagination.page, true);
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      setServerError(
        status === 409
          ? "Transaksi sudah berubah sejak halaman dimuat. Draft tetap tersimpan; periksa status terbaru sebelum mencoba lagi."
          : error instanceof Error
            ? error.message
            : "Konfirmasi gagal diproses.",
      );
      window.requestAnimationFrame(() => serverErrorRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  const oldestAge = formatAge(summary.oldestCreatedAt, now);

  return (
    <div className="space-y-5">
      {announcement && (
        <div
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-800"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          {announcement}
        </div>
      )}

      <Card className="border-destructive/30 bg-destructive/5" role="note">
        <CardContent className="flex gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-semibold">Verifikasi ini hanya memperbarui status di CMS.</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Konfirmasi di CMS tidak memindahkan atau menyelesaikan settlement dana di AutoLaris.
              Pastikan transaksi sudah berhasil di dashboard provider sebelum mengonfirmasi.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle as="h3">
                {viewStatus === "pending" ? "Pembayaran menunggu verifikasi" : "Verifikasi terbaru"}
              </CardTitle>
              <CardDescription className="mt-1">
                {viewStatus === "pending"
                  ? "Urutan terbaru dari D1. Periksa satu transaksi pada satu waktu."
                  : "Riwayat pembayaran yang sudah dikonfirmasi beserta bukti auditnya."}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="xl"
              className="w-full sm:w-auto"
              disabled={loading || refreshing}
              onClick={() => void loadQueue(pagination.page, true)}
            >
              {refreshing ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw aria-hidden="true" />
              )}
              {refreshing ? "Memperbarui…" : "Perbarui antrean"}
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-2" aria-label="Tampilan rekonsiliasi">
              <Button
                type="button"
                variant={viewStatus === "pending" ? "default" : "outline"}
                size="xl"
                onClick={() => setViewStatus("pending")}
              >
                Menunggu
                {!loading && <Badge variant="secondary">{summary.pendingCount.toLocaleString("id-ID")}</Badge>}
              </Button>
              <Button
                type="button"
                variant={viewStatus === "paid" ? "default" : "outline"}
                size="xl"
                onClick={() => setViewStatus("paid")}
              >
                Verifikasi terbaru
              </Button>
            </div>
            {!loading && viewStatus === "pending" && (
              <p className="text-xs leading-5 text-muted-foreground">
                {currency.format(summary.pendingBilled)} tercatat · tertua di halaman {oldestAge}
                {summary.expiredCount > 0 ? ` · ${summary.expiredCount} lewat batas` : ""}
              </p>
            )}
          </div>
        </CardHeader>

        {loadError && (
          <CardContent>
            <div
              className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                  <p className="font-medium">Antrean gagal diperbarui.</p>
                  <p className="mt-1 text-sm text-muted-foreground">{loadError}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="xl"
                onClick={() => void loadQueue(pagination.page)}
              >
                Coba lagi
              </Button>
            </div>
          </CardContent>
        )}

        {loading ? (
          <CardContent className="space-y-3" aria-label="Memuat antrean pembayaran">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-20 w-full" />
            ))}
          </CardContent>
        ) : transactions.length === 0 && !loadError ? (
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <p className="mt-4 font-semibold">
              {viewStatus === "pending" ? "Tidak ada pembayaran yang menunggu." : "Belum ada verifikasi manual."}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
              {viewStatus === "pending"
                ? "Antrean akan terisi saat checkout AutoLaris membuat transaksi QRIS atau virtual account baru."
                : "Riwayat muncul setelah owner atau admin mengonfirmasi pembayaran dari antrean."}
            </p>
          </CardContent>
        ) : (
          <>
            <div className="hidden lg:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">Order dan pembeli</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Tagihan tercatat</TableHead>
                    <TableHead>Referensi provider</TableHead>
                    <TableHead>{viewStatus === "pending" ? "Usia dan expiry" : "Dikonfirmasi"}</TableHead>
                    <TableHead className={viewStatus === "pending" ? "pr-4 text-right" : "pr-4"}>
                      {viewStatus === "pending" ? "Tindakan" : "Catatan audit"}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => {
                    const expired = isExpired(transaction.expiresAt, now);
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="pl-4 whitespace-normal">
                          <a
                            className="inline-flex min-h-11 items-center gap-1 font-mono font-semibold text-primary hover:underline"
                            href={`/admin/orders/${encodeURIComponent(transaction.orderNumber)}`}
                          >
                            {transaction.orderNumber}
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                          </a>
                          <p className="text-sm font-medium">{transaction.customerName}</p>
                          {transaction.customerPhone && (
                            <p className="text-xs text-muted-foreground">{transaction.customerPhone}</p>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="outline">{transaction.channelCode}</Badge></TableCell>
                        <TableCell className="font-mono font-semibold tabular-nums">
                          {currency.format(transaction.billedAmount)}
                        </TableCell>
                        <TableCell className="max-w-48 whitespace-normal break-all font-mono text-xs">
                          {transaction.providerReference || "Belum tersedia"}
                        </TableCell>
                        {viewStatus === "pending" ? (
                          <>
                            <TableCell className="whitespace-normal">
                              <Badge variant={expired ? "destructive" : "secondary"}>
                                <Clock3 data-icon="inline-start" />
                                {expired ? "Lewat batas" : formatAge(transaction.createdAt, now)}
                              </Badge>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {expired
                                  ? "Wajib periksa AutoLaris — status lokal bukan bukti provider."
                                  : `Exp. ${formatDate(transaction.expiresAt)}`}
                              </p>
                            </TableCell>
                            <TableCell className="pr-4 text-right whitespace-normal">
                              <Button
                                type="button"
                                size="xl"
                                disabled={!transaction.confirmationEligible || !transaction.providerReference}
                                onClick={() => openVerification(transaction)}
                              >
                                <ShieldCheck aria-hidden="true" />
                                Verifikasi
                              </Button>
                              {(!transaction.confirmationEligible || !transaction.providerReference) && (
                                <p className="mt-2 max-w-56 text-right text-xs leading-5 text-destructive">
                                  {formatBlockReason(transaction.confirmationBlockReason)}
                                </p>
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="whitespace-normal text-xs">
                              <p className="font-medium">{transaction.confirmedBy || "Operator tidak tersedia"}</p>
                              <p className="mt-1 text-muted-foreground">
                                {transaction.confirmedRole || "—"} · {formatDate(transaction.confirmedAt)}
                              </p>
                            </TableCell>
                            <TableCell className="max-w-64 whitespace-normal break-words pr-4 text-xs leading-5 text-muted-foreground">
                              {transaction.confirmationNote || "Tanpa catatan audit."}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-1 gap-3 p-3 lg:hidden">
              {transactions.map((transaction) => (
                <Card key={transaction.id} size="sm">
                  <CardHeader className="border-b">
                    <CardTitle as="h4">
                      <a
                        className="inline-flex min-h-11 items-center gap-1 break-all font-mono text-primary hover:underline"
                        href={`/admin/orders/${encodeURIComponent(transaction.orderNumber)}`}
                      >
                        {transaction.orderNumber}
                        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    </CardTitle>
                    <CardDescription>
                      {transaction.customerName}
                      {transaction.customerPhone ? ` · ${transaction.customerPhone}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <TransactionDetails transaction={transaction} now={now} />
                    {viewStatus === "paid" && (
                      <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5">
                        <p className="font-medium">Dikonfirmasi oleh {transaction.confirmedBy || "operator"}</p>
                        <p className="text-muted-foreground">
                          {transaction.confirmedRole || "—"} · {formatDate(transaction.confirmedAt)}
                        </p>
                        <p className="mt-2 break-words text-muted-foreground">
                          {transaction.confirmationNote || "Tanpa catatan audit."}
                        </p>
                      </div>
                    )}
                  </CardContent>
                  {viewStatus === "pending" && <CardFooter className="flex-col gap-2">
                    <Button
                      type="button"
                      size="xl"
                      className="w-full"
                      disabled={!transaction.confirmationEligible || !transaction.providerReference}
                      onClick={() => openVerification(transaction)}
                    >
                      <ShieldCheck aria-hidden="true" />
                      {transaction.confirmationEligible && transaction.providerReference
                        ? "Verifikasi pembayaran"
                        : "Tidak dapat dikonfirmasi"}
                    </Button>
                    {(!transaction.confirmationEligible || !transaction.providerReference) && (
                      <p className="text-xs leading-5 text-destructive">
                        {formatBlockReason(transaction.confirmationBlockReason)}
                      </p>
                    )}
                  </CardFooter>}
                </Card>
              ))}
            </div>
          </>
        )}

        {!loading && pagination.totalPages > 1 && (
          <CardFooter className="justify-between gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">
              Halaman {pagination.page} dari {pagination.totalPages}
            </p>
            <Pagination className="mx-0 w-auto" aria-label="Halaman antrean pembayaran">
              <PaginationContent>
                <PaginationItem>
                  <Button
                    type="button"
                    variant="outline"
                    size="xl"
                    disabled={pagination.page <= 1 || refreshing}
                    onClick={() => void loadQueue(pagination.page - 1, true)}
                  >
                    Sebelumnya
                  </Button>
                </PaginationItem>
                <PaginationItem>
                  <span className="flex h-11 min-w-11 items-center justify-center px-2 text-sm" aria-current="page">
                    {pagination.page}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <Button
                    type="button"
                    variant="outline"
                    size="xl"
                    disabled={pagination.page >= pagination.totalPages || refreshing}
                    onClick={() => void loadQueue(pagination.page + 1, true)}
                  >
                    Berikutnya
                  </Button>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </CardFooter>
        )}
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={closeVerification}>
        <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => amountRef.current?.focus());
        }}>
          {selected && (
            <form onSubmit={submitVerification} noValidate>
              <DialogHeader>
                <DialogTitle>Konfirmasi pembayaran {selected.orderNumber}</DialogTitle>
                <DialogDescription>
                  Cocokkan data D1 dengan dashboard AutoLaris. Tindakan ini mencatat order sebagai lunas di CMS dan masuk ke audit trail.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-5">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <TransactionDetails transaction={selected} now={now} />
                </div>

                <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" role="note">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                  <p>Konfirmasi di CMS tidak memindahkan atau menyelesaikan settlement dana di AutoLaris.</p>
                </div>

                <Separator />

                {serverError && (
                  <div
                    ref={serverErrorRef}
                    tabIndex={-1}
                    className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    role="alert"
                  >
                    <p className="font-medium">Konfirmasi belum tersimpan.</p>
                    <p className="mt-1 text-muted-foreground">{serverError}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium" htmlFor="verified-amount">
                      Ketik ulang nominal tagihan
                    </label>
                    <Input
                      ref={amountRef}
                      id="verified-amount"
                      className="mt-2 h-11 font-mono"
                      inputMode="numeric"
                      autoComplete="off"
                      value={draft.amount}
                      aria-invalid={Boolean(fieldErrors.amount)}
                      aria-describedby={fieldErrors.amount ? "verified-amount-error" : "verified-amount-help"}
                      onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                    />
                    <p id="verified-amount-help" className="mt-1.5 text-xs text-muted-foreground">
                      Nilai acuan: {currency.format(selected.billedAmount)}
                    </p>
                    {fieldErrors.amount && <p id="verified-amount-error" className="mt-1.5 text-xs text-destructive">{fieldErrors.amount}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-medium" htmlFor="provider-reference">
                      Ketik ulang referensi provider
                    </label>
                    <Input
                      ref={referenceRef}
                      id="provider-reference"
                      className="mt-2 h-11 font-mono"
                      autoComplete="off"
                      value={draft.reference}
                      aria-invalid={Boolean(fieldErrors.reference)}
                      aria-describedby={fieldErrors.reference ? "provider-reference-error" : "provider-reference-help"}
                      onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
                    />
                    <p id="provider-reference-help" className="mt-1.5 break-all text-xs text-muted-foreground">
                      Nilai acuan: {selected.providerReference}
                    </p>
                    {fieldErrors.reference && <p id="provider-reference-error" className="mt-1.5 text-xs text-destructive">{fieldErrors.reference}</p>}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-sm font-medium" htmlFor="audit-note">Catatan audit</label>
                    <span className="text-xs tabular-nums text-muted-foreground">{draft.note.length}/500</span>
                  </div>
                  <Textarea
                    ref={noteRef}
                    id="audit-note"
                    className="mt-2 min-h-24"
                    maxLength={500}
                    placeholder="Contoh: Status berhasil diperiksa di dashboard AutoLaris oleh operator."
                    value={draft.note}
                    aria-invalid={Boolean(fieldErrors.note)}
                    aria-describedby={fieldErrors.note ? "audit-note-error" : "audit-note-help"}
                    onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
                  />
                  <p id="audit-note-help" className="mt-1.5 text-xs text-muted-foreground">Wajib 5–500 karakter. Jangan masukkan data kartu, token, atau secret.</p>
                  {fieldErrors.note && <p id="audit-note-error" className="mt-1.5 text-xs text-destructive">{fieldErrors.note}</p>}
                </div>

                <div className="rounded-lg border p-3">
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm" htmlFor="dashboard-confirmed">
                    <Checkbox
                      ref={confirmedRef}
                      id="dashboard-confirmed"
                      className="mt-1"
                      checked={draft.confirmed}
                      aria-invalid={Boolean(fieldErrors.confirmed)}
                      aria-describedby={fieldErrors.confirmed ? "dashboard-confirmed-error" : undefined}
                      onCheckedChange={(checked) => setDraft((current) => ({ ...current, confirmed: checked === true }))}
                    />
                    <span>
                      <span className="font-medium">Sudah diverifikasi di dashboard AutoLaris</span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        Saya melihat transaksi ini berstatus berhasil dan nominalnya sesuai.
                      </span>
                    </span>
                  </label>
                  {fieldErrors.confirmed && <p id="dashboard-confirmed-error" className="mt-1 text-xs text-destructive">{fieldErrors.confirmed}</p>}
                </div>
              </div>

              <DialogFooter className="mt-5">
                <Button type="button" variant="outline" size="xl" disabled={submitting} onClick={() => closeVerification(false)}>
                  Batal
                </Button>
                <Button type="submit" size="xl" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                  {submitting ? "Menyimpan…" : "Konfirmasi lunas di CMS"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
