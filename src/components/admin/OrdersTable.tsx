import { formatIdr } from "@/lib/format-idr";
import { TrafficSourceBadge } from "./TrafficSourceBadge";
import { CrmActionGroup } from "./CrmActionGroup";
import type { CrmStepKey } from "./CrmActionButton";
import { useEffect, useMemo, useState } from "react";
import {
  buildWaUrl,
  defaultCrmTemplates,
  renderCrmMessage,
} from "../../lib/crm-template";
import {
  ADMIN_DATE_FILTER_OPTIONS,
  getAdminDateFilterLabel,
} from "../../lib/admin-date-filter";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationEllipsis,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "../ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  MoreHorizontal,
  ChevronDown,
  Eye,
  Truck,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export type OrderItem = {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  productName: string;
  variantName?: string;
  productPrice: number;
  shippingCost: number;
  district: string;
  city: string;
  province: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  shippingStatus: string;
  courierCode: string;
  cnoteNo: string;
  sellerName: string;
  bankAccounts: string;
  epaymentLink: string;
  receiverDeliveryRate: number;
  receiverRiskLabel: RiskLevel;
  createdAt: string;
  dispatchEligible: boolean;
  dispatchReason: string;
  providerDispatchError: string | null;
  providerOrderId: string | null;
  adClickIds?: string | null;
};

type OrderRow = {
  id: number | string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  district: string | null;
  city: string | null;
  province: string | null;
  product_name: string | null;
  variant_name?: string | null;
  product_price: number;
  shipping_cost: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  shipping_status: string;
  courier_code: string | null;
  cnote_no: string | null;
  seller_name: string | null;
  seller_bank_name: string | null;
  seller_account_holder: string | null;
  seller_account_number: string | null;
  epayment_link: string | null;
  receiver_delivery_rate: number | null;
  receiver_risk_label: string | null;
  created_at: string;
  dispatch_eligible?: boolean;
  dispatch_reason?: string;
  provider_dispatch_error?: string | null;
  provider_order_id?: string | null;
  ad_click_ids?: string | null;
};

type OrdersPagination = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
};

type OrdersSummary = {
  totalOrders: number;
  unpaidCount: number;
  highRiskCount: number;
  totalValue: number;
};

const toRiskLevel = (value: string | null | undefined): RiskLevel => {
  const normalized = String(value || "").toUpperCase();
  if (normalized.includes("HIGH")) return "HIGH";
  if (normalized.includes("MEDIUM")) return "MEDIUM";
  if (normalized.includes("LOW")) return "LOW";
  return "UNKNOWN";
};

const mapOrder = (row: OrderRow): OrderItem => ({
  id: String(row.id),
  orderNumber: row.order_number,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  address: row.address || "",
  productName: row.product_name || "",
  variantName: row.variant_name || "",
  productPrice: Number(row.product_price) || 0,
  shippingCost: Number(row.shipping_cost) || 0,
  district: row.district || "",
  city: row.city || "",
  province: row.province || "",
  totalAmount: Number(row.total_amount) || 0,
  paymentMethod: row.payment_method,
  paymentStatus: row.payment_status,
  shippingStatus: row.shipping_status,
  courierCode: row.courier_code || "",
  cnoteNo: row.cnote_no || "",
  sellerName: row.seller_name || "",
  bankAccounts: [
    row.seller_bank_name,
    row.seller_account_number,
    row.seller_account_holder ? `a.n. ${row.seller_account_holder}` : "",
  ]
    .filter(Boolean)
    .join(" "),
  epaymentLink: row.epayment_link || "",
  receiverDeliveryRate:
    row.receiver_delivery_rate == null
      ? -1
      : Number(row.receiver_delivery_rate),
  receiverRiskLabel: toRiskLevel(row.receiver_risk_label),
  createdAt: row.created_at,
  dispatchEligible: Boolean(row.dispatch_eligible),
  dispatchReason: row.dispatch_reason || "",
  providerDispatchError: row.provider_dispatch_error || null,
  providerOrderId: row.provider_order_id || null,
  adClickIds: row.ad_click_ids || null,
});

const shippingLabels: Record<string, string> = {
  abandoned: "Terbengkalai",
  pending: "Menunggu",
  processing: "Diproses",
  shipped: "Dikirim",
  delivered: "Selesai",
  returned: "RTS",
  cancelled: "Batal",
};

const shippingStatusStyles: Record<string, string> = {
  abandoned: "bg-rose-500",
  pending: "bg-amber-500",
  processing: "bg-sky-500",
  shipped: "bg-blue-600",
  delivered: "bg-emerald-600",
  returned: "bg-rose-600",
  cancelled: "bg-slate-500",
};


const quickStatusFilters = [
  { value: "all", label: "Semua" },
  { value: "abandoned", label: "Terbengkalai" },
  { value: "pending", label: "Menunggu" },
  { value: "processing", label: "Diproses" },
  { value: "shipped", label: "Dikirim" },
  { value: "delivered", label: "Selesai" },
  { value: "cancelled", label: "Batal" },
] as const;

type QuickStatus = (typeof quickStatusFilters)[number]["value"];
type StatusCounts = Record<QuickStatus, number>;

function HighlightSearchMatch({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase("id-ID");
  if (!normalizedQuery) return text;
  const matchIndex = text.toLocaleLowerCase("id-ID").indexOf(normalizedQuery);
  if (matchIndex < 0) return text;
  const matchEnd = matchIndex + normalizedQuery.length;
  return (
    <>
      {text.slice(0, matchIndex)}
      <mark className="rounded bg-amber-200 px-0.5 text-inherit">
        {text.slice(matchIndex, matchEnd)}
      </mark>
      {text.slice(matchEnd)}
    </>
  );
}

function OrderActionMenu({
  order,
  updatingOrderId,
  dispatching,
  onDispatch,
  onDelete,
  onShippingStatusChange,
  onRefreshScoring,
}: {
  order: OrderItem;
  updatingOrderId: string | number | null;
  dispatching: boolean;
  onDispatch: (orderId: string) => void;
  onDelete: (orderId: string) => void;
  onShippingStatusChange: (orderId: string, status: string) => void;
  onRefreshScoring: (orderId: string) => void;
}) {
  const isUpdating = updatingOrderId === order.id;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUpdating}
          className="h-8.5 px-3 rounded-lg border-slate-200 bg-white font-extrabold text-xs text-slate-800 hover:bg-slate-50 hover:text-slate-950 shadow-xs transition-colors"
        >
          {isUpdating ? (
            <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" aria-hidden="true" />
          ) : (
            <MoreHorizontal className="size-4 text-slate-600" />
          )}
          <span>Aksi</span>
          <ChevronDown className="size-3 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5 rounded-xl border border-slate-200 bg-white shadow-xl">
        <DropdownMenuLabel className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
          Order {order.orderNumber}
        </DropdownMenuLabel>
        
        <DropdownMenuItem asChild>
          <a
            href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
            className="flex items-center gap-2 px-2 py-2 text-xs font-bold text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <Eye className="size-4 text-slate-500" />
            <span>Lihat Detail Order</span>
          </a>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onRefreshScoring(order.id)}
          disabled={isUpdating}
          className="flex items-center gap-2 px-2 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
        >
          <ShieldAlert className="size-4 text-slate-500" />
          <span>Cek Risiko RTS (Mengantar)</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 bg-slate-100" />

        {order.providerOrderId ? (
          <>
            <DropdownMenuLabel className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
              Update Status Ekspedisi
            </DropdownMenuLabel>
            {Object.entries(shippingLabels).map(([value, label]) => {
              const isCurrent = order.shippingStatus === value;
              return (
                <DropdownMenuItem
                  key={value}
                  onClick={() => onShippingStatusChange(order.id, value)}
                  className={`flex items-center justify-between px-2 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                    isCurrent ? 'bg-emerald-50 text-emerald-900 font-bold' : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${shippingStatusStyles[value] || 'bg-slate-400'}`} />
                    {label}
                  </span>
                  {isCurrent && <CheckCircle2 className="size-3.5 text-emerald-600" />}
                </DropdownMenuItem>
              );
            })}
          </>
        ) : order.dispatchEligible ? (
          <DropdownMenuItem
            onClick={() => onDispatch(order.id)}
            disabled={isUpdating || dispatching}
            className="flex items-center gap-2 px-2 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-900 rounded-lg cursor-pointer"
          >
            <Truck className="size-4 text-emerald-600" />
            <span>Push ke Mengantar</span>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled className="flex items-center gap-2 px-2 py-2 text-xs font-medium text-slate-400 rounded-lg">
            <AlertCircle className="size-4 text-amber-500 shrink-0" />
            <span className="truncate">{order.dispatchReason || "Belum siap dipush"}</span>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator className="my-1 bg-slate-100" />

        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDelete(order.id)}
          disabled={dispatching}
          className="flex items-center gap-2 px-2 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 hover:text-rose-900 rounded-lg cursor-pointer"
        >
          <Trash2 className="size-4 text-rose-600" />
          <span>Hapus Order</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const paymentLabels: Record<string, string> = {
  unpaid: "Belum dibayar",
  pending: "Menunggu pembayaran",
  paid: "Lunas",
  settled: "Lunas",
  success: "Lunas",
  expired: "Kedaluwarsa",
  failed: "Gagal",
  refunded: "Dikembalikan",
};

const paymentMethodLabels: Record<string, string> = {
  cod: "COD",
  bank_transfer: "Transfer bank",
  qris: "QRIS",
  invoice: "Pembayaran online",
};

const formatCurrency = formatIdr;
const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date)} WIB`;
};
const crmSteps = ["welcome", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function RiskBadge({
  level,
  deliveryRate,
}: {
  level?: RiskLevel | string | null;
  deliveryRate?: number | null;
}) {
  const safeLevel: RiskLevel =
    level === "HIGH" || level === "MEDIUM" || level === "LOW" ? level : "UNKNOWN";
  const styles = {
    LOW: {
      badge: "bg-emerald-100 text-emerald-800",
      bar: "bg-emerald-500",
      label: "Rendah",
      guidance: "Riwayat pengiriman kuat",
    },
    MEDIUM: {
      badge: "bg-amber-100 text-amber-800",
      bar: "bg-amber-500",
      label: "Sedang",
      guidance: "Konfirmasi sebelum kirim",
    },
    HIGH: {
      badge: "bg-rose-100 text-rose-800",
      bar: "bg-rose-500",
      label: "Tinggi",
      guidance: "Verifikasi sebelum kirim",
    },
    UNKNOWN: {
      badge: "bg-slate-100 text-slate-700",
      bar: "bg-slate-300",
      label: "Belum dinilai",
      guidance: "Periksa riwayat penerima",
    },
  }[safeLevel];

  const hasValidRate =
    typeof deliveryRate === "number" && Number.isFinite(deliveryRate) && deliveryRate >= 0;

  return (
    <div
      className="min-w-36"
      aria-label={
        hasValidRate
          ? `Risiko RTS ${styles.label}, tingkat keberhasilan pengiriman ${deliveryRate} persen`
          : `Risiko RTS ${styles.label}`
      }
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${styles.badge}`}
        >
          RTS {styles.label}
        </span>
        <span className="font-mono text-xs font-black text-slate-900">
          {hasValidRate ? `${deliveryRate}%` : "—"}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"
        aria-hidden="true"
      >
        <div
          className={`h-full rounded-full ${styles.bar}`}
          style={{
            width: `${hasValidRate ? Math.max(0, Math.min(100, deliveryRate)) : 0}%`,
          }}
        ></div>
      </div>
      <p className="mt-1.5 text-[10px] font-bold text-slate-500">
        {styles.guidance}
      </p>
    </div>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const paid = ["paid", "settled", "success"].includes(normalized);
  const failed = ["failed", "expired"].includes(normalized);
  const refunded = normalized === "refunded";

  const dotColor = paid
    ? "bg-emerald-500"
    : failed
      ? "bg-rose-500"
      : refunded
        ? "bg-purple-500"
        : "bg-amber-500";

  const badgeStyle = paid
    ? "bg-emerald-50 text-emerald-900 border-emerald-200"
    : failed
      ? "bg-rose-50 text-rose-900 border-rose-200"
      : refunded
        ? "bg-purple-50 text-purple-900 border-purple-200"
        : "bg-amber-50 text-amber-900 border-amber-200";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${badgeStyle}`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dotColor}`} aria-hidden="true" />
      {paymentLabels[normalized] || status}
    </span>
  );
}

export function OrdersTable({ initialOrders }: { initialOrders?: OrderItem[] }) {
  const [orders, setOrders] = useState<OrderItem[]>(initialOrders || []);
  const [searchTerm, setSearchTerm] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("search") || "",
  );
  const [shippingFilter, setShippingFilter] = useState(() => {
    if (typeof window === "undefined") return "all";
    const params = new URLSearchParams(window.location.search);
    return params.get("status") || params.get("shipping_status") || "all";
  });
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<OrdersPagination>({
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 0,
  });
  const [summary, setSummary] = useState<OrdersSummary>({
    totalOrders: 0,
    unpaidCount: 0,
    highRiskCount: 0,
    totalValue: 0,
  });
  const [clickedSteps, setClickedSteps] = useState<Record<string, boolean>>({});
  const [crmTemplates, setCrmTemplates] = useState({ ...defaultCrmTemplates });
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [updateNotice, setUpdateNotice] = useState("");
  const [loading, setLoading] = useState(initialOrders ? false : true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState("");
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({
    all: 0,
    abandoned: 0,
    pending: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  });






  useEffect(() => {
    const controller = new AbortController();
    const delay = orders.length === 0 ? 0 : 250;
    const timer = window.setTimeout(async () => {
      setRefreshing(true);
      setLoadError("");
      try {
        const query = new URLSearchParams({ page: String(page), limit: "20" });
        const search = searchTerm.trim();
        if (search) query.set("search", search);
        if (shippingFilter !== "all")
          query.set("shipping_status", shippingFilter);
        if (paymentFilter !== "all") query.set("payment_status", paymentFilter);
        if (dateFilter !== "all") query.set("date_filter", dateFilter);
        if (sourceFilter !== "all") query.set("source", sourceFilter);
        const response = await fetch(`/api/admin/orders?${query}`, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success)
          throw new Error(payload.error || "Daftar order gagal dimuat.");
        const nextOrders: OrderItem[] = Array.isArray(payload.data)
          ? payload.data.map(mapOrder)
          : [];
        if (payload.crm_templates) {
          setCrmTemplates((current) => ({
            ...current,
            ...payload.crm_templates,
          }));
        }
        setOrders(nextOrders);
        setSelectedOrderIds((current) =>
          current.filter((id) =>
            nextOrders.some((order) => order.id === id),
          ),
        );
        setPagination({
          page: Number(payload.pagination?.page) || page,
          limit: Number(payload.pagination?.limit) || 25,
          totalItems: Number(payload.pagination?.total_items) || 0,
          totalPages: Number(payload.pagination?.total_pages) || 0,
        });
        setSummary({
          totalOrders: Number(payload.summary?.total_orders) || 0,
          unpaidCount: Number(payload.summary?.unpaid_count) || 0,
          highRiskCount: Number(payload.summary?.high_risk_count) || 0,
          totalValue: Number(payload.summary?.total_value) || 0,
        });
        setStatusCounts({
          all: Number(payload.status_counts?.all) || 0,
          abandoned: Number(payload.status_counts?.abandoned) || 0,
          pending: Number(payload.status_counts?.pending) || 0,
          processing: Number(payload.status_counts?.processing) || 0,
          shipped: Number(payload.status_counts?.shipped) || 0,
          delivered: Number(payload.status_counts?.delivered) || 0,
          cancelled: Number(payload.status_counts?.cancelled) || 0,
        });
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError")) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Daftar order gagal dimuat.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    page,
    paymentFilter,
    requestVersion,
    searchTerm,
    shippingFilter,
    dateFilter,
    sourceFilter,
  ]);

  const filteredOrders = orders;
  const firstVisibleOrder =
    pagination.totalItems === 0
      ? 0
      : (pagination.page - 1) * pagination.limit + 1;
  const lastVisibleOrder =
    pagination.totalItems === 0
      ? 0
      : firstVisibleOrder + filteredOrders.length - 1;
  const hasFilters =
    searchTerm.trim() !== "" ||
    dateFilter !== "all" ||
    shippingFilter !== "all" ||
    paymentFilter !== "all" ||
    sourceFilter !== "all";
  const handleShippingStatusChange = async (
    orderId: string,
    shippingStatus: string,
  ) => {
    setUpdatingOrderId(orderId);
    setUpdateNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipping_status: shippingStatus }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Gagal memperbarui status pengiriman");
      }
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, shippingStatus } : order,
        ),
      );
      setUpdateNotice("Status pengiriman berhasil diperbarui.");
    } catch (error) {
      setUpdateNotice(
        error instanceof Error
          ? error.message
          : "Gagal memperbarui status pengiriman.",
      );
    } finally {
      setUpdatingOrderId("");
    }
  };
  const handleRefreshScoring = async (orderId: string) => {
    setUpdatingOrderId(orderId);
    setUpdateNotice("");
    try {
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh-scoring" }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        data?: {
          receiver_delivery_rate?: number | null;
          receiver_risk_label?: RiskLevel | string | null;
        };
      };
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Gagal memperbarui risiko RTS dari Mengantar.");
      }
      if (payload.data) {
        const nextRate =
          payload.data.receiver_delivery_rate == null
            ? -1
            : Number(payload.data.receiver_delivery_rate);
        const nextRisk = toRiskLevel(payload.data.receiver_risk_label);
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId
              ? { ...order, receiverDeliveryRate: nextRate, receiverRiskLabel: nextRisk }
              : order,
          ),
        );
      }
      setUpdateNotice(payload.message || "Risiko RTS berhasil diperbarui dari Mengantar.");
    } catch (error) {
      setUpdateNotice(
        error instanceof Error ? error.message : "Gagal memperbarui risiko RTS.",
      );
    } finally {
      setUpdatingOrderId("");
    }
  };

  const handleBulkStatusChange = async (shippingStatus: string) => {
    const orderIds = [...selectedOrderIds];
    if (orderIds.length === 0 || !shippingLabels[shippingStatus]) return;

    const previousOrders = orders;
    const previousStatusCounts = statusCounts;
    const selectedOrders = previousOrders.filter((order) =>
      orderIds.includes(order.id),
    );
    setBulkUpdating(true);
    setBulkStatusTarget(shippingStatus);
    setUpdateNotice("");
    setOrders((current) =>
      current.map((order) =>
        orderIds.includes(order.id)
          ? { ...order, shippingStatus }
          : order,
      ),
    );
    setStatusCounts((current) => {
      const next = { ...current };
      for (const order of selectedOrders) {
        const previousStatus = order.shippingStatus as QuickStatus;
        if (previousStatus in next && previousStatus !== shippingStatus) {
          next[previousStatus] = Math.max(0, next[previousStatus] - 1);
        }
      }
      if (shippingStatus in next) {
        next[shippingStatus as QuickStatus] += selectedOrders.filter(
          (order) => order.shippingStatus !== shippingStatus,
        ).length;
      }
      return next;
    });

    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: orderIds, status: shippingStatus }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        data?: { updated_count?: number };
      };
      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Gagal memperbarui status order.");
      }
      const updatedCount =
        payload.data?.updated_count == null
          ? orderIds.length
          : Number(payload.data.updated_count);
      setSelectedOrderIds([]);
      setUpdateNotice(
        payload.message ||
          `${updatedCount} order berhasil diubah ke ${shippingLabels[shippingStatus]}.`,
      );
      setRequestVersion((current) => current + 1);
    } catch (error) {
      setOrders(previousOrders);
      setStatusCounts(previousStatusCounts);
      setUpdateNotice(
        error instanceof Error
          ? error.message
          : "Gagal memperbarui status order.",
      );
    } finally {
      setBulkUpdating(false);
      setBulkStatusTarget("");
    }
  };

  const dispatchOrders = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    const singleOrderId = orderIds.length === 1 ? orderIds[0] : null;
    if (singleOrderId) setUpdatingOrderId(singleOrderId);
    else setDispatching(true);
    setUpdateNotice("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch-orders", orderIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal push order ke Mengantar.");
      }
      const summary = payload.data?.summary as
        | { failed?: number; unpaid?: number; skipped?: number }
        | undefined;
      const partial = Boolean(
        summary &&
          (Number(summary.failed) > 0 ||
            Number(summary.unpaid) > 0 ||
            Number(summary.skipped) > 0),
      );
      setUpdateNotice(payload.message || (partial ? "Push selesai dengan kendala." : "Push berhasil."));
      setSelectedOrderIds([]);
      setRequestVersion((v) => v + 1);
    } catch (error) {
      setUpdateNotice(
        error instanceof Error
          ? error.message
          : "Gagal push order ke Mengantar.",
      );
    } finally {
      setUpdatingOrderId("");
      setDispatching(false);
    }
  };
  const deleteOrders = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    if (!window.confirm(`Apakah Anda yakin ingin menghapus ${orderIds.length} pesanan? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setDispatching(true);
    setUpdateNotice("");
    try {
      const response = await fetch("/api/admin/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal menghapus pesanan.");
      }
      setUpdateNotice(payload.message || `Berhasil menghapus ${orderIds.length} pesanan.`);
      setSelectedOrderIds([]);
      setRequestVersion((v) => v + 1);
    } catch (error) {
      setUpdateNotice(
        error instanceof Error ? error.message : "Gagal menghapus pesanan.",
      );
    } finally {
      setDispatching(false);
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setShippingFilter("all");
    setPaymentFilter("all");
    setDateFilter("all");
    setSourceFilter("all");
    setPage(1);
  };
  const markStepClicked = (orderId: string, step: string) => {
    setClickedSteps((current) => ({
      ...current,
      [`${orderId}_${step}`]: true,
    }));
  };
  const isStepClicked = (orderId: string, step: string) =>
    Boolean(clickedSteps[`${orderId}_${step}`]);

  const crmUrls = useMemo(
    () =>
      new Map(
        orders.map((order) => {
          const urls = Object.fromEntries(
            crmSteps.map((step) => {
              const text = renderCrmMessage(crmTemplates[step], {
                customerName: order.customerName,
                customerPhone: order.customerPhone,
                address: order.address,
                district: order.district,
                city: order.city,
                province: order.province,
                orderNumber: order.orderNumber,
                productName: order.productName,
                productPrice: order.productPrice,
                shippingCost: order.shippingCost,
                totalAmount: order.totalAmount,
                courierCode: order.courierCode,
                cnoteNo: order.cnoteNo,
                sellerName: order.sellerName,
                bankAccounts: order.bankAccounts,
                epaymentLink: order.epaymentLink,
                orderDetailsLink: `/admin/orders/${encodeURIComponent(order.orderNumber)}`,
              });
              return [
                String(step),
                buildWaUrl(order.customerPhone, text),
              ] as const;
            }),
          );
          return [order.id, urls] as const;
        }),
      ),
    [crmTemplates, orders],
  );

  const renderCrmActions = (order: OrderItem) => {
    const urls = crmUrls.get(order.id) || {};
    const orderClickedSteps: Record<string, boolean> = {};
    for (const key of ['welcome', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      orderClickedSteps[key] = isStepClicked(order.id, key as CrmStepKey);
    }
    return (
      <CrmActionGroup
        crmUrls={urls}
        clickedSteps={orderClickedSteps}
        onStepClick={(stepKey) => markStepClicked(order.id, stepKey)}
        size="sm"
        collapsible={true}
      />
    );
  };
  if (loading)
    return (
      <div
        className="h-96 animate-pulse rounded-xl bg-slate-100"
        aria-label="Memuat daftar order"
        aria-busy="true"
      />
    );
  if (loadError && orders.length === 0)
    return (
      <section
        className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm"
        role="alert"
      >
        <h3 className="text-lg font-black text-slate-950">
          Order gagal dimuat
        </h3>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        <Button
          onClick={() => {
            setLoading(true);
            setRequestVersion((current) => current + 1);
          }}
          size="xl" className="mt-5"
        >
          Coba lagi
        </Button>
      </section>
    );

  const dispatchableOrders = filteredOrders.filter((order) => order.dispatchEligible);
  const visibleDispatchableIds = dispatchableOrders.map((order) => order.id);
  const visibleOrderIds = filteredOrders.map((order) => order.id);
  const selectedDispatchIds = visibleDispatchableIds.filter((orderId) =>
    selectedOrderIds.includes(orderId),
  );
  const allVisibleSelected =
    visibleOrderIds.length > 0 &&
    visibleOrderIds.every((orderId) => selectedOrderIds.includes(orderId));
  return (
    <div className="space-y-5">
      {loadError && (
        <div
          className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <span>{loadError}</span>
          <Button
            variant="secondary"
            onClick={() => setRequestVersion((current) => current + 1)}
            size="lg" className="shrink-0"
          >
            Coba lagi
          </Button>
        </div>
      )}
      <section
        className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4"
        aria-label="Ringkasan order"
      >
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            Total order
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            {summary.totalOrders}
          </p>
          <p className="mt-1 hidden text-xs text-slate-500 sm:block">Semua pesanan masuk.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            Belum dibayar
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-amber-700 sm:text-3xl">
            {summary.unpaidCount}
          </p>
          <p className="mt-1 hidden text-xs text-slate-500 sm:block">
            Perlu tindak lanjut pembayaran.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            Risiko RTS tinggi
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-rose-700 sm:text-3xl">
            {summary.highRiskCount}
          </p>
          <p className="mt-1 hidden text-xs text-slate-500 sm:block">
            Prioritaskan verifikasi penerima.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
            Nilai order
          </p>
          <p className="mt-2 text-xl font-black tracking-tight text-slate-950">
            {formatCurrency(summary.totalValue)}
          </p>
          <p className="mt-1 hidden text-xs text-slate-500 sm:block">
            Nilai bruto semua status.
          </p>
        </div>
      </section>

      <nav
        className="flex gap-2 overflow-x-auto pb-1"
        aria-label="Filter cepat status order"
      >
        {quickStatusFilters.map((filter) => {
          const active = shippingFilter === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setShippingFilter(filter.value);
                setPage(1);
              }}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-xs font-black transition-colors ${
                active
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              {filter.value !== "all" && (
                <span
                  className={`size-2 shrink-0 rounded-full ${shippingStatusStyles[filter.value] || "bg-slate-400"}`}
                  aria-hidden="true"
                />
              )}
              {filter.label}
              <span
                className={`min-w-5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  active
                    ? "bg-white/20 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {statusCounts[filter.value]}
              </span>
            </button>
          );
        })}
      </nav>

      {selectedOrderIds.length > 0 && (
        <section
          className="sticky top-3 z-20 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"
          aria-label="Aksi bulk order"
        >
          <div>
            <p className="text-sm font-black text-slate-950">
              {selectedOrderIds.length} order dipilih
            </p>
            <button
              type="button"
              onClick={() => setSelectedOrderIds([])}
              className="mt-1 text-xs font-bold text-blue-700 hover:underline"
            >
              Batalkan pilihan
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={bulkStatusTarget}
              disabled={bulkUpdating || dispatching}
              onValueChange={(value) => {
                if (value) void handleBulkStatusChange(value);
              }}
            >
              <SelectTrigger
                aria-label="Ubah status order terpilih"
                className="min-h-11 w-full min-w-48 bg-white sm:w-auto"
              >
                {bulkUpdating ? (
                  <span
                    className="size-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700"
                    aria-hidden="true"
                  />
                ) : null}
                <SelectValue placeholder="Ubah status ke…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(shippingLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDispatchIds.length > 0 && (
              <Button
                type="button"
                onClick={() => void dispatchOrders(selectedDispatchIds)}
                disabled={dispatching || bulkUpdating || updatingOrderId !== ""}
                className="min-h-11 w-full sm:w-auto"
              >
                {dispatching ? (
                  <span
                    className="mr-2 size-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-white"
                    aria-hidden="true"
                  />
                ) : null}
                Push {selectedDispatchIds.length} ke Mengantar
              </Button>
            )}
            <Button
              type="button"
              variant="destructive"
              onClick={() => void deleteOrders(selectedOrderIds)}
              disabled={dispatching || bulkUpdating}
              className="min-h-11 w-full font-bold sm:w-auto"
            >
              Hapus {selectedOrderIds.length} Order
            </Button>
          </div>
        </section>
      )}

      <section className="bg-transparent">
        <div className="pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full lg:w-72 flex-shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="search-order"
                  className="block text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Pencarian
                </label>
                <a
                  href="/admin/settings/crm"
                  className="text-[10px] font-bold text-blue-600 hover:underline"
                >
                  Atur CRM
                </a>
              </div>
              <Input
                id="search-order"
                type="text"
                placeholder="Cari invoice, nama, WA, resi…"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                className="h-11 w-full rounded-lg bg-white shadow-sm border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-nowrap">
              <div className="w-full sm:w-[140px]">
                <label
                  htmlFor="filter-date"
                  className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Periode order
                </label>
                <Select
                  value={dateFilter}
                  onValueChange={(val) => {
                    setDateFilter(val ?? "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    id="filter-date"
                    className="h-11 w-full rounded-lg bg-white shadow-sm border-slate-200"
                  >
                    <SelectValue>
                      {getAdminDateFilterLabel(dateFilter)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ADMIN_DATE_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-[150px]">
                <label
                  htmlFor="filter-shipping"
                  className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Status Pengiriman
                </label>
                <Select
                  value={shippingFilter}
                  onValueChange={(val) => {
                    setShippingFilter(val ?? "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    id="filter-shipping"
                    className="h-11 w-full rounded-lg bg-white shadow-sm border-slate-200"
                  >
                    <SelectValue>
                      {shippingFilter === "all"
                        ? "Semua status"
                        : shippingLabels[shippingFilter] || "Pilih status"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    <SelectItem value="abandoned">Terbengkalai</SelectItem>
                    <SelectItem value="pending">Menunggu</SelectItem>
                    <SelectItem value="processing">Diproses</SelectItem>
                    <SelectItem value="shipped">Dikirim</SelectItem>
                    <SelectItem value="delivered">Selesai</SelectItem>
                    <SelectItem value="returned">RTS</SelectItem>
                    <SelectItem value="cancelled">Batal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-[150px]">
                <label
                  htmlFor="filter-payment"
                  className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Status Pembayaran
                </label>
                <Select
                  value={paymentFilter}
                  onValueChange={(val) => {
                    setPaymentFilter(val ?? "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    id="filter-payment"
                    className="h-11 w-full rounded-lg bg-white shadow-sm border-slate-200"
                  >
                    <SelectValue>
                      {paymentFilter === "all"
                        ? "Semua status"
                        : paymentLabels[paymentFilter] || "Pilih status"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    <SelectItem value="unpaid">Belum dibayar</SelectItem>
                    <SelectItem value="paid">Lunas</SelectItem>
                    <SelectItem value="expired">Kedaluwarsa</SelectItem>
                    <SelectItem value="failed">Gagal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-[150px]">
                <label
                  htmlFor="filter-source"
                  className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Sumber Lead
                </label>
                <Select
                  value={sourceFilter}
                  onValueChange={(val) => {
                    setSourceFilter(val ?? "all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    id="filter-source"
                    className="h-11 w-full rounded-lg bg-white shadow-sm border-slate-200"
                  >
                    <SelectValue>
                      {sourceFilter === "all"
                        ? "Semua traffic"
                        : sourceFilter === "meta"
                        ? "Meta Ads"
                        : sourceFilter === "google"
                        ? "Google Ads"
                        : sourceFilter === "tiktok"
                        ? "TikTok Ads"
                        : sourceFilter === "organic"
                        ? "Organic / Direct"
                        : "Pilih sumber"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua traffic</SelectItem>
                    <SelectItem value="meta">Meta Ads</SelectItem>
                    <SelectItem value="google">Google Ads</SelectItem>
                    <SelectItem value="tiktok">TikTok Ads</SelectItem>
                    <SelectItem value="organic">Organic / Direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="secondary"
                onClick={resetFilters}
                disabled={!hasFilters}
                size="xl" className="w-full sm:w-auto shadow-sm"
              >
                Reset
              </Button>
            </div>
          </div>
          <p
            className="mt-3 text-xs font-bold text-slate-500"
            aria-live="polite"
          >
            {refreshing
              ? "Memperbarui…"
              : `Menampilkan ${firstVisibleOrder}–${lastVisibleOrder} dari ${pagination.totalItems} order`}
          </p>
          {updateNotice && (
            <p className="mt-2 text-xs font-bold text-slate-600" role="status">
              {updateNotice}
            </p>
          )}
        </div>


        {/* grid-cols-1 expands to minmax(0, 1fr); without it a card's min-content
            width widens the implicit column past the viewport and the wrapper clips
            the right-hand controls out of reach on mobile. */}
        <div className="grid grid-cols-1 gap-3 py-3 lg:hidden" aria-label="Daftar order mobile">
            {filteredOrders.map((order) => {
              const selected = selectedOrderIds.includes(order.id);
              return (
              <article
                key={order.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-colors"
              >


                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <a
                      href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                      className="break-all font-black text-slate-950 hover:text-blue-600 hover:underline"
                    >
                      <HighlightSearchMatch
                        text={order.orderNumber}
                        query={searchTerm}
                      />
                    </a>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatDateTime(order.createdAt)}
                    </p>
                    <div className="mt-1">
                      <TrafficSourceBadge adClickIds={order.adClickIds} size="xs" />
                    </div>
                  </div>
                  <RiskBadge
                    level={order.receiverRiskLabel}
                    deliveryRate={order.receiverDeliveryRate}
                  />
                </div>
                    <div className="mt-4 border-t border-slate-100 pt-4">
                  <a
                    href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                    className="break-words font-black text-slate-900 hover:underline"
                  >
                    {order.customerName}
                  </a>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {order.customerPhone}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[order.district, order.city, order.province]
                      .filter(Boolean)
                      .join(", ") || "Alamat belum lengkap"}
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                  <div>
                    <p className="text-slate-500">Produk & Total</p>
                    {order.productName && (
                      <p className="mt-1 text-xs font-semibold text-slate-900 truncate">
                        {order.productName}
                      </p>
                    )}
                    {order.variantName && (
                      <p className="text-[11px] text-slate-500 truncate">
                        {order.variantName}
                      </p>
                    )}
                    <p className="mt-1 font-black text-slate-950 text-sm">
                      {formatCurrency(order.totalAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Pembayaran</p>
                    <div className="mt-1">
                      <PaymentBadge status={order.paymentStatus} />
                    </div>
                  </div>
                  <div>
                    <p className="text-slate-500">Pengiriman</p>
                    <p className="mt-1 font-black text-slate-950">
                      {shippingLabels[order.shippingStatus] ||
                        order.shippingStatus}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Kurir / resi</p>
                    <p className="mt-1 break-all font-black text-slate-950">
                      {order.courierCode}
                      {order.cnoteNo ? ` · ${order.cnoteNo}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    WhatsApp CRM
                  </p>
                  {renderCrmActions(order)}
                </div>
                {order.providerDispatchError && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                    <p className="font-bold mb-1">Kendala Push ke Mengantar:</p>
                    <p>{order.providerDispatchError}</p>
                  </div>
                )}
                <label className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-900">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) =>
                      setSelectedOrderIds((current) =>
                        checked
                          ? [...new Set([...current, order.id])]
                          : current.filter((id) => id !== order.id),
                      )
                    }
                    aria-label={`Pilih order ${order.orderNumber}`}
                    className="size-5 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                  />
                  Pilih order untuk aksi bulk
                </label>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs font-bold text-slate-500">Aksi & Ekspedisi</span>
                  <OrderActionMenu
                    order={order}
                    updatingOrderId={updatingOrderId}
                    dispatching={dispatching}
                    onDispatch={(id) => void dispatchOrders([id])}
                    onDelete={(id) => void deleteOrders([id])}
                    onShippingStatusChange={(id, status) => void handleShippingStatusChange(id, status)}
                    onRefreshScoring={(id) => void handleRefreshScoring(id)}
                  />
                </div>
              </article>
            ); })}
          </div>
        <div className="hidden lg:block overflow-x-auto pb-16" aria-label="Tabel order desktop">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <TableHead className="w-12 px-4 py-3">
                    <Checkbox
                      checked={
                        allVisibleSelected
                          ? true
                          : selectedOrderIds.some((orderId) =>
                              visibleOrderIds.includes(orderId),
                            )
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(checked) =>
                        setSelectedOrderIds((current) =>
                          checked
                            ? [
                                ...new Set([
                                  ...current,
                                  ...visibleOrderIds,
                                ]),
                              ]
                            : current.filter(
                                (orderId) =>
                                  !visibleOrderIds.includes(orderId),
                              ),
                        )
                      }
                      aria-label="Pilih semua order di halaman ini"
                      className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                    />
                  </TableHead>
                  <TableHead className="w-48 px-5 py-3 border-r border-slate-200">
                    Invoice
                  </TableHead>
                  <TableHead className="w-52 px-4 py-3">Pemesan</TableHead>
                  <TableHead className="w-44 px-4 py-3">Risiko RTS</TableHead>
                  <TableHead className="w-48 px-4 py-3">
                    Pembayaran & pengiriman
                  </TableHead>
                  <TableHead className="w-48 px-4 py-3 text-right">
                    Produk & Total
                  </TableHead>
                  <TableHead className="w-56 px-4 py-3">WhatsApp CRM</TableHead>
                  <TableHead className="w-28 px-4 py-3 text-right">
                    Aksi
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const selected = selectedOrderIds.includes(order.id);
                  return (
                  <TableRow
                    key={order.id}
                    className="align-top transition-colors hover:bg-slate-50"
                  >
                    <TableCell className="px-4 py-4">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) =>
                          setSelectedOrderIds((current) =>
                            checked
                              ? [...new Set([...current, order.id])]
                              : current.filter((id) => id !== order.id),
                          )
                        }
                        aria-label={`Pilih order ${order.orderNumber}`}
                        className="data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                      />
                    </TableCell>
                    <TableCell className="px-5 py-4 border-r border-slate-200">
                      <a
                        href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                        className="whitespace-nowrap font-black text-slate-950 hover:text-blue-600 hover:underline"
                      >
                        <HighlightSearchMatch
                          text={order.orderNumber}
                          query={searchTerm}
                        />
                      </a>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDateTime(order.createdAt)}
                      </p>
                      <div className="mt-1">
                        <TrafficSourceBadge adClickIds={order.adClickIds} size="xs" />
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[210px] px-4 py-4">
                      <a
                        href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                        className="block truncate font-black text-slate-900 hover:underline"
                      >
                        {order.customerName}
                      </a>
                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                        {order.customerPhone}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-slate-400">
                        {[order.district, order.city, order.province]
                          .filter(Boolean)
                          .join(", ") || "Alamat belum lengkap"}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <RiskBadge
                        level={order.receiverRiskLabel}
                        deliveryRate={order.receiverDeliveryRate}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <PaymentBadge status={order.paymentStatus} />
                        <span className="text-[10px] font-bold text-slate-500">
                          {paymentMethodLabels[order.paymentMethod] ||
                            order.paymentMethod}
                        </span>
                      </div>
                      <p className="mt-2 font-black text-slate-900">
                        {shippingLabels[order.shippingStatus] ||
                          order.shippingStatus}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        {order.courierCode}
                        {order.cnoteNo
                          ? ` · ${order.cnoteNo}`
                          : " · resi belum tersedia"}
                      </p>
                      {order.providerDispatchError && (
                        <p className="mt-1 text-[10px] text-rose-600 font-bold max-w-[200px] leading-tight">
                          Error: {order.providerDispatchError}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right">
                      {order.productName && (
                        <p className="font-semibold text-slate-900 text-xs truncate max-w-[180px] ml-auto">
                          {order.productName}
                        </p>
                      )}
                      {order.variantName && (
                        <p className="text-[11px] text-slate-500 truncate max-w-[180px] ml-auto mt-0.5">
                          {order.variantName}
                        </p>
                      )}
                      <p className="mt-1 font-black text-slate-950 text-sm">
                        {formatCurrency(order.totalAmount)}
                      </p>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      {renderCrmActions(order)}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right">
                      <OrderActionMenu
                        order={order}
                        updatingOrderId={updatingOrderId}
                        dispatching={dispatching}
                        onDispatch={(id) => void dispatchOrders([id])}
                        onDelete={(id) => void deleteOrders([id])}
                        onShippingStatusChange={(id, status) => void handleShippingStatusChange(id, status)}
                        onRefreshScoring={(id) => void handleRefreshScoring(id)}
                      />
                    </TableCell>
                  </TableRow>
                ); })}
              </TableBody>
            </Table>
          </div>

        {pagination.totalPages > 1 && (
          <div className="border-t border-slate-200 py-3 px-4 md:px-5">
            <Pagination>
              <PaginationContent className="w-full justify-between">
                <div className="flex items-center">
                  <p className="text-xs font-bold text-slate-500">
                    Halaman {pagination.page} dari {pagination.totalPages}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (!refreshing && pagination.page > 1)
                          setPage((c) => Math.max(1, c - 1));
                      }}
                      className={
                        refreshing || pagination.page <= 1
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                  <PaginationItem className="hidden sm:block">
                    <PaginationLink href="#" isActive>
                      {pagination.page}
                    </PaginationLink>
                  </PaginationItem>
                  {pagination.totalPages > pagination.page && (
                    <PaginationItem className="hidden sm:block">
                      <PaginationEllipsis />
                    </PaginationItem>
                  )}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        if (
                          !refreshing &&
                          pagination.page < pagination.totalPages
                        )
                          setPage((c) =>
                            Math.min(pagination.totalPages, c + 1),
                          );
                      }}
                      className={
                        refreshing || pagination.page >= pagination.totalPages
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </div>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        {filteredOrders.length === 0 && (
          <div className="border-t border-slate-200 p-10 text-center">
            <p className="text-sm font-black text-slate-950">
              Order tidak ditemukan
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ubah kata pencarian atau reset filter untuk melihat semua order.
            </p>
            <Button
              variant="secondary"
              onClick={resetFilters}
              size="lg" className="mt-4"
            >
              Reset filter
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
