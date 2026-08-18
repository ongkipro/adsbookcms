import { formatIdr } from "@/lib/format-idr";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  Clock3Icon,
  LoaderCircleIcon,
  PackageCheckIcon,
  PackageSearchIcon,
  RefreshCwIcon,
  SearchIcon,
  TruckIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  ADMIN_DATE_FILTER_OPTIONS,
  getAdminDateFilterLabel,
} from "../../lib/admin-date-filter";
import {
  matchesShippingQueue,
  type ShippingQueueId,
} from "../../lib/shipping-queue";

type Shipment = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  city: string;
  province: string;
  totalAmount: number;
  shippingCost: number;
  paymentMethod: string;
  paymentStatus: string;
  shippingStatus: string;
  courierCode: string | null;
  courierService: string | null;
  cnoteNo: string | null;
  providerOrderId: string | null;
  providerStatusText: string | null;
  providerStatusAt: string | null;
  providerSyncedAt: string | null;
  providerDispatchError: string | null;
  receiverDeliveryRate: number | null;
  receiverRiskLabel: string | null;
  pickupScheduleId: number | null;
  pickupScheduledAt: string | null;
  pickupStatus: string | null;
  warehouseName: string;
  createdAt: string;
};

type PickupSchedule = {
  id: number;
  scheduledAt: string;
  status: string;
  shipmentCount: number;
  providerReference: string | null;
  notes: string | null;
  warehouseName: string;
};

type Warehouse = {
  id: number;
  name: string;
  city: string;
  province: string;
};
type ShippingData = {
  shipments: Shipment[];
  pickups: PickupSchedule[];
  warehouses: Warehouse[];
  readyPickupIds: number[];
};

type Notice =
  | { tone: "success" | "warning" | "error"; message: string }
  | null;

const statusLabels: Record<string, string> = {
  pending: "Menunggu konfirmasi",
  processing: "Antrean Mengantar",
  shipped: "Dalam perjalanan",
  delivered: "Terkirim",
  returned: "RTS",
  cancelled: "Dibatalkan",
};

const statusStyles: Record<string, { dot: string; badge: string }> = {
  pending: {
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
  },
  processing: {
    dot: "bg-sky-500",
    badge: "bg-sky-50 text-sky-800 ring-sky-200",
  },
  shipped: {
    dot: "bg-blue-600",
    badge: "bg-blue-50 text-blue-800 ring-blue-200",
  },
  delivered: {
    dot: "bg-emerald-600",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  },
  returned: {
    dot: "bg-rose-600",
    badge: "bg-rose-50 text-rose-800 ring-rose-200",
  },
  cancelled: {
    dot: "bg-slate-500",
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
  },
};

const pickupStatusLabels: Record<string, string> = {
  scheduled: "Terjadwal",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};
const shippingQueues: Array<{
  id: ShippingQueueId;
  label: string;
  note: string;
  icon: typeof PackageCheckIcon;
  tone: string;
  activeTone: string;
}> = [
  {
    id: "all",
    label: "Semua Pengiriman",
    note: "Seluruh order provider",
    icon: TruckIcon,
    tone: "text-slate-700 bg-slate-100",
    activeTone: "border-slate-900 ring-slate-900/10",
  },
  {
    id: "needs_waybill",
    label: "Perlu Dibuatkan Resi",
    note: "Draft provider tanpa resi",
    icon: AlertTriangleIcon,
    tone: "text-amber-700 bg-amber-50",
    activeTone: "border-amber-500 ring-amber-500/10",
  },
  {
    id: "needs_pickup",
    label: "Perlu Pickup",
    note: "Berresi, belum terjadwal",
    icon: CalendarClockIcon,
    tone: "text-sky-700 bg-sky-50",
    activeTone: "border-sky-500 ring-sky-500/10",
  },
  {
    id: "delivered",
    label: "Sampai Tujuan",
    note: "Pesanan telah diterima",
    icon: PackageCheckIcon,
    tone: "text-emerald-700 bg-emerald-50",
    activeTone: "border-emerald-500 ring-emerald-500/10",
  },
];

const currency = formatIdr;
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
function defaultPickupDate() {
  const format = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value);
  const now = new Date();
  const today = format(now);
  const todaySlot = new Date(`${today}T09:00:00+07:00`);
  return todaySlot.getTime() >= now.getTime() + 90 * 60 * 1000
    ? today
    : format(new Date(now.getTime() + 24 * 60 * 60 * 1000));
}

function StatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] ?? statusStyles.cancelled;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ring-inset ${style.badge}`}
    >
      <span
        className={`size-1.5 rounded-full ${style.dot}`}
        aria-hidden="true"
      />
      {statusLabels[status] ?? status}
    </span>
  );
}


function LoadingState() {
  return (
    <div
      className="space-y-5"
      aria-label="Memuat data pengiriman"
      aria-busy="true"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl bg-slate-100"
          />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}

export function ShippingOperations() {
  const [data, setData] = useState<ShippingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [activeQueue, setActiveQueue] = useState<ShippingQueueId>("all");
  const [syncing, setSyncing] = useState(false);
  const [pickupOpen, setPickupOpen] = useState(false);
  const [pickupAt, setPickupAt] = useState(defaultPickupDate);
  const [warehouseId, setWarehouseId] = useState("");
  const [pickupNotes, setPickupNotes] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const loadData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setLoadError("");
      try {
        const url = new URL("/api/admin/shipping", window.location.href);
        if (dateFilter && dateFilter !== "all")
          url.searchParams.set("date_filter", dateFilter);
        const response = await fetch(url.toString(), {
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success)
          throw new Error(payload.error || "Gagal memuat data pengiriman.");
        const nextData = payload.data as ShippingData;
        setData(nextData);
        setSelectedOrderIds((current) =>
          current.filter((id) => nextData.readyPickupIds.includes(id)),
        );
        setWarehouseId(
          (current) => current || String(nextData.warehouses[0]?.id ?? ""),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Gagal memuat data pengiriman.";
        if (showLoading) setLoadError(message);
        else setNotice({ tone: "error", message });
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [dateFilter],
  );

  useEffect(() => {
    void loadData(true);
  }, [loadData]);
  useEffect(() => {
    setSearch(new URLSearchParams(window.location.search).get("order") || "");
  }, []);

  const filteredShipments = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.shipments.filter((shipment) => {
      const searchable = [
        shipment.orderNumber,
        shipment.customerName,
        shipment.customerPhone,
        shipment.city,
        shipment.province,
        shipment.courierCode,
        shipment.cnoteNo,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        matchesShippingQueue(shipment, activeQueue) &&
        (statusFilter === "all" || shipment.shippingStatus === statusFilter) &&
        (courierFilter === "all" || shipment.courierCode === courierFilter)
      );
    });
  }, [activeQueue, courierFilter, data, search, statusFilter]);

  const visiblePickupIds = useMemo(() => {
    const eligible = new Set(data?.readyPickupIds ?? []);
    return filteredShipments
      .filter((shipment) => eligible.has(shipment.id))
      .map((shipment) => shipment.id);
  }, [data, filteredShipments]);

  const selectedVisiblePickupCount = visiblePickupIds.filter((id) =>
    selectedOrderIds.includes(id),
  ).length;
  const visiblePickupSelection =
    selectedVisiblePickupCount === 0
      ? false
      : selectedVisiblePickupCount === visiblePickupIds.length
        ? true
        : "indeterminate";


  const updateVisibleSelection = (
    current: number[],
    visibleIds: number[],
    checked: boolean,
  ) =>
    checked
      ? [...new Set([...current, ...visibleIds])]
      : current.filter((id) => !visibleIds.includes(id));

  const queueCounts = useMemo(() => {
    const shipments = data?.shipments ?? [];
    return Object.fromEntries(
      shippingQueues.map((queue) => [
        queue.id,
        shipments.filter((shipment) =>
          matchesShippingQueue(shipment, queue.id),
        ).length,
      ]),
    ) as Record<ShippingQueueId, number>;
  }, [data]);

  const availableCouriers = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.shipments ?? [])
            .map((shipment) => shipment.courierCode)
            .filter(Boolean),
        ),
      ) as string[],
    [data],
  );
  const hasFilters =
    activeQueue !== "all" ||
    search.trim() !== "" ||
    dateFilter !== "all" ||
    statusFilter !== "all" ||
    courierFilter !== "all";

  const mutate = async (
    body: Record<string, unknown>,
    method: "PATCH" | "POST" = "PATCH",
  ) => {
    const response = await fetch("/api/admin/shipping", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success)
      throw new Error(payload.error || "Operasi pengiriman gagal.");
    return payload;
  };

  const syncProvider = async () => {
    const ids = filteredShipments
      .filter(
        (shipment) =>
          shipment.providerOrderId &&
          shipment.cnoteNo &&
          ["processing", "shipped", "delivered"].includes(
            shipment.shippingStatus,
          ),
      )
      .map((shipment) => shipment.id)
      .slice(0, 50);

    if (ids.length === 0) {
      setNotice({
        tone: "warning",
        message: "Tidak ada pengiriman berresi yang dapat disinkronkan.",
      });
      return;
    }

    setSyncing(true);
    setNotice(null);
    try {
      const payload = await mutate({
        action: "sync-provider",
        orderIds: ids,
      });
      const data = payload.data;
      setNotice({
        tone: data.failed > 0 ? "warning" : "success",
        message: `Sinkronisasi selesai: ${data.updated} diperbarui, ${data.unchanged} tetap, ${data.failed} gagal dari ${data.results?.length ?? ids.length} order.`,
      });
      await loadData();
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Gagal sinkronisasi dengan provider.",
      });
    } finally {
      setSyncing(false);
    }
  };



  const schedulePickup = async () => {
    setScheduling(true);
    setNotice(null);
    try {
      const payload = await mutate(
        {
          action: "schedule-pickup",
          warehouseId: Number(warehouseId),
          scheduledAt: pickupAt,
          orderIds: selectedOrderIds,
          notes: pickupNotes,
        },
        "POST",
      );
      setNotice({ tone: "success", message: payload.message });
      setPickupOpen(false);
      setPickupNotes("");
      await loadData();
    } catch (error) {
      setNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Gagal menjadwalkan pickup.",
      });
    } finally {
      setScheduling(false);
    }
  };

  const openPickupScheduler = () => {
    setPickupAt(defaultPickupDate());
    setPickupOpen(true);
    window.requestAnimationFrame(() =>
      document
        .getElementById("pickup-scheduler")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  if (loading) return <LoadingState />;

  if (loadError) {
    return (
      <section
        className="rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm"
        role="alert"
      >
        <AlertTriangleIcon
          className="mx-auto size-8 text-rose-600"
          aria-hidden="true"
        />
        <h2 className="mt-4 text-lg font-black text-slate-950">
          Data pengiriman gagal dimuat
        </h2>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        <Button onClick={() => void loadData(true)} size="xl" className="mt-5">
          <RefreshCwIcon className="size-4 mr-2" aria-hidden="true" /> Coba lagi
        </Button>
      </section>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4 md:space-y-5">
      <section className="space-y-3 md:space-y-4">
        <header className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between sm:pb-5">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Operasional pengiriman
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.035em] text-slate-950 md:mt-1.5 md:text-3xl">
              Pengiriman & pickup
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-500 md:leading-6">
              Order yang sudah diterima Mengantar masuk ke sini untuk pemantauan resi, status pengiriman, dan penjadwalan pickup.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadData(true)}
                disabled={loading || syncing}
                size="lg"
                className="h-11 px-3 shadow-sm border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                aria-label="Refresh data"
              >
                <RefreshCwIcon className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={syncProvider}
                disabled={syncing || loading}
                size="lg"
                className="flex-1 sm:flex-none h-11 shadow-sm border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                <RefreshCwIcon className={`mr-2 size-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
                Sinkronkan status
              </Button>
            </div>
            <Button
              type="button"
              onClick={() =>
                pickupOpen ? setPickupOpen(false) : openPickupScheduler()
              }
              disabled={data.readyPickupIds.length === 0 || syncing}
              size="lg"
              className="h-11 w-full shadow-sm sm:w-auto"
            >
              <CalendarClockIcon className="mr-2 size-4" aria-hidden="true" />
              {pickupOpen
                ? "Tutup jadwal"
                : `Jadwalkan pickup (${data.readyPickupIds.length})`}
            </Button>
          </div>
        </header>
        {pickupOpen && (
          <form
            id="pickup-scheduler"
            onSubmit={(event) => {
              event.preventDefault();
              void schedulePickup();
            }}
            className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_1fr_1.3fr_auto] lg:items-end"
          >
            <label>
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-600">
                Gudang pickup
              </span>
              <Select
                value={warehouseId}
                onValueChange={(val) => setWarehouseId(val ?? "")}
                required
              >
                <SelectTrigger className="h-11 bg-white">
                  <SelectValue placeholder="Pilih gudang" />
                </SelectTrigger>
                <SelectContent>
                  {data.warehouses.map((warehouse) => (
                    <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-600">
                Tanggal pickup (09.00–18.00 WIB)
              </span>
              <Input
                type="date"
                value={pickupAt}
                min={defaultPickupDate()}
                onChange={(event) => setPickupAt(event.target.value)}
                className="h-11 bg-white shadow-none"
                required
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-600">
                Catatan kurir
              </span>
              <Input
                value={pickupNotes}
                onChange={(event) => setPickupNotes(event.target.value)}
                maxLength={160}
                placeholder="Contoh: ambil di loading dock timur"
                className="h-11 bg-white shadow-none"
              />
            </label>
            <Button
              type="submit"
              disabled={scheduling || selectedOrderIds.length === 0}
              size="xl"
            >
              {scheduling ? (
                <LoaderCircleIcon
                  className="size-4 animate-spin mr-2"
                  aria-hidden="true"
                />
              ) : (
                <TruckIcon className="size-4 mr-2" aria-hidden="true" />
              )}
              Konfirmasi {selectedOrderIds.length} paket
            </Button>
            <p className="text-xs text-slate-600 lg:col-span-4">
              Mengantar mensyaratkan jadwal minimal 90 menit dari sekarang.
              Paket yang dipilih harus sudah memiliki resi.
            </p>
          </form>
        )}
      </section>

      <section
        className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4"
        aria-label="Antrean operasional pengiriman"
        role="tablist"
      >
        {shippingQueues.map((queue, index) => {
          const selected = activeQueue === queue.id;
          return (
            <button
              id={`shipping-queue-${queue.id}`}
              key={queue.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="shipping-queue-results"
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveQueue(queue.id)}
              onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
                event.preventDefault();
                const offset = event.key === "ArrowRight" ? 1 : -1;
                const nextIndex =
                  (index + offset + shippingQueues.length) %
                  shippingQueues.length;
                const nextQueue = shippingQueues[nextIndex];
                setActiveQueue(nextQueue.id);
                window.requestAnimationFrame(() =>
                  document
                    .getElementById(`shipping-queue-${nextQueue.id}`)
                    ?.focus(),
                );
              }}
              className={`min-h-24 rounded-xl border bg-white p-3 text-left shadow-sm ring-2 ring-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:p-4 ${
                selected
                  ? queue.activeTone
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-[10px] font-black uppercase leading-4 tracking-wider text-slate-500 sm:text-[11px]">
                    {queue.label}
                  </span>
                  <span className="mt-1.5 block text-2xl font-black tracking-tight text-slate-950 sm:mt-2 sm:text-3xl">
                    {queueCounts[queue.id]}
                  </span>
                </span>
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl sm:size-10 ${queue.tone}`}
                >
                  <queue.icon className="size-4 sm:size-5" aria-hidden="true" />
                </span>
              </span>
              <span className="mt-1 block text-[11px] leading-4 text-slate-500 sm:text-xs">
                {queue.note}
              </span>
            </button>
          );
        })}
      </section>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            notice.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : notice.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
          role="status"
        >
          {notice.message}
        </div>
      )}

      <section className="bg-transparent">
        <div className="pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="w-full lg:w-72 flex-shrink-0 relative">
              <label
                htmlFor="search-shipping"
                className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500"
              >
                Pencarian
              </label>
              <SearchIcon
                className="pointer-events-none absolute left-3 top-8 size-4 text-slate-400"
                aria-hidden="true"
              />
              <Input
                id="search-shipping"
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari invoice, nama, WA, resi…"
                className="h-11 w-full rounded-lg bg-white pl-9 shadow-sm border-slate-200"
              />
            </div>

            <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-nowrap">
              <div className="w-full sm:w-[140px]">
                <label
                  htmlFor="shipping-date"
                  className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Periode order
                </label>
                <Select
                  value={dateFilter}
                  onValueChange={(val) => setDateFilter(val ?? "all")}
                >
                  <SelectTrigger
                    id="shipping-date"
                    className="h-11 w-full rounded-lg bg-white px-3 text-sm shadow-sm border-slate-200"
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
                  htmlFor="shipping-status"
                  className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Status Pengiriman
                </label>
                <Select
                  value={statusFilter}
                  onValueChange={(val) => setStatusFilter(val ?? "all")}
                >
                  <SelectTrigger
                    id="shipping-status"
                    className="h-11 w-full rounded-lg bg-white px-3 text-sm shadow-sm border-slate-200"
                  >
                    <SelectValue>
                      {statusFilter === "all"
                        ? "Semua status"
                        : statusLabels[statusFilter] || "Pilih status"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua status</SelectItem>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full sm:w-[150px]">
                <label
                  htmlFor="shipping-courier"
                  className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500"
                >
                  Kurir
                </label>
                <Select
                  value={courierFilter}
                  onValueChange={(val) => setCourierFilter(val ?? "all")}
                >
                  <SelectTrigger
                    id="shipping-courier"
                    className="h-11 w-full rounded-lg bg-white px-3 text-sm shadow-sm border-slate-200"
                  >
                    <SelectValue>
                      {courierFilter === "all" ? "Semua kurir" : courierFilter}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua kurir</SelectItem>
                    {availableCouriers.map((courier) => (
                      <SelectItem key={courier} value={courier}>
                        {courier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setActiveQueue("all");
                  setCourierFilter("all");
                  setDateFilter("all");
                }}
                disabled={!hasFilters}
                size="xl"
                className="w-full sm:w-auto shadow-sm"
              >
                Reset
              </Button>
            </div>
            <p
              className="mt-3 text-xs font-bold text-slate-500"
              aria-live="polite"
            >
              Menampilkan {filteredShipments.length} dari {data.shipments.length} pengiriman
            </p>
          </div>
        </div>

        <div id="shipping-queue-results" role="tabpanel" aria-live="polite">
        {filteredShipments.length === 0 ? (
          <div className="p-10 text-center">
            <PackageSearchIcon
              className="mx-auto size-8 text-slate-400"
              aria-hidden="true"
            />
            <h3 className="mt-3 font-black text-slate-950">
              Pengiriman tidak ditemukan
            </h3>
            {hasFilters ? (
              <>
                <p className="mt-1 text-sm text-slate-500">
                  Ubah kata pencarian atau reset filter untuk melihat data lain.
                </p>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                    setActiveQueue("all");
                    setCourierFilter("all");
                    setDateFilter("all");
                  }}
                  size="lg"
                  className="mt-4"
                >
                  Reset filter
                </Button>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Order yang dikonfirmasi dari Order Management akan masuk ke antrean ini.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Mobile Bulk Selection */}
            {visiblePickupIds.length > 0 && (
              <section className="sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-950/5 backdrop-blur lg:hidden" aria-label="Navigasi pilihan bulk">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-slate-950">Pilih order</p>
                    <p className="text-[11px] text-slate-500">
                      {selectedOrderIds.length} pickup dipilih
                    </p>
                  </div>
                  {selectedOrderIds.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 px-3 text-xs text-slate-600"
                      onClick={() => {
                        setSelectedOrderIds([]);
                      }}
                    >
                      Bersihkan
                    </Button>
                  )}
                </div>
                <div className="mt-3 grid gap-2 grid-cols-1">
                  <label className="flex min-h-12 items-center gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-900">
                    <Checkbox
                      checked={visiblePickupSelection}
                      onCheckedChange={(checked) =>
                        setSelectedOrderIds((current) =>
                          updateVisibleSelection(current, visiblePickupIds, Boolean(checked)),
                        )
                      }
                      aria-label={`Pilih semua ${visiblePickupIds.length} hasil siap pickup`}
                      className="size-5 data-[state=checked]:border-sky-600 data-[state=checked]:bg-sky-600"
                    />
                    <span>Semua pickup ({visiblePickupIds.length})</span>
                  </label>
                </div>
                {selectedOrderIds.length > 0 && (
                  <div className="mt-2 grid gap-2 grid-cols-1">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={openPickupScheduler}
                      className="h-10 text-xs"
                    >
                      <CalendarClockIcon className="mr-1.5 size-3.5" aria-hidden="true" />
                      Pickup {selectedOrderIds.length}
                    </Button>
                  </div>
                )}
              </section>
            )}
            {/* grid-cols-1 expands to minmax(0, 1fr); without it a card's min-content
                width widens the implicit column past the viewport and the wrapper clips
                the right-hand controls out of reach on mobile. */}
            <div
              className="grid grid-cols-1 gap-3 py-3 lg:hidden"
              aria-label="Daftar pengiriman mobile"
            >
            {filteredShipments.map((shipment) => {
              const ready = data.readyPickupIds.includes(shipment.id);
              const selected = selectedOrderIds.includes(shipment.id);
              return (
                <article
                  key={shipment.id}
                  className={`rounded-xl border bg-white p-4 shadow-xs transition-colors ${selected ? "border-sky-300 ring-2 ring-sky-100" : "border-slate-200"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={`/admin/orders/${encodeURIComponent(shipment.orderNumber)}`}
                        className="break-all font-black text-slate-950 hover:underline hover:text-blue-600"
                      >
                        {shipment.orderNumber}
                      </a>
                      <p className="mt-1 break-words text-xs text-slate-500">
                        {shipment.customerName} · {shipment.city}
                      </p>
                    </div>
                    <StatusBadge status={shipment.shippingStatus} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                    <div>
                      <p className="text-slate-500">Kurir</p>
                      <p className="mt-1 font-black text-slate-950">
                        {shipment.courierCode || "Belum dipilih"}{" "}
                        {shipment.courierService
                          ? `· ${shipment.courierService}`
                          : ""}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-slate-500">Nomor resi</p>
                      <p
                        className={`mt-1 break-all font-mono font-black ${shipment.cnoteNo ? "text-blue-700" : "text-amber-700"}`}
                      >
                        {shipment.cnoteNo || (shipment.providerOrderId ? "Draft / Menunggu Resi" : "Belum tersedia")}
                      </p>
                    </div>
                  </div>
                  
                  {shipment.providerDispatchError && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                      <p className="font-bold mb-1">Kendala Push ke Mengantar:</p>
                      <p>{shipment.providerDispatchError}</p>
                    </div>
                  )}
                  
                  {Boolean(shipment.providerOrderId && !shipment.cnoteNo) && (
                    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      Draft sudah dibuat di Mengantar, tetapi nomor resi belum tersedia. Periksa saldo dan status provider sebelum pickup.
                    </p>
                  )}
                  
                  {ready && (
                    <label className="mt-3 flex min-h-11 items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-900">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(checked) =>
                          setSelectedOrderIds((current) =>
                            checked
                              ? [...new Set([...current, shipment.id])]
                              : current.filter((id) => id !== shipment.id),
                          )
                        }
                        aria-label={`Pilih ${shipment.orderNumber} untuk pickup`}
                        className="size-5 data-[state=checked]:border-sky-600 data-[state=checked]:bg-sky-600"
                      />{" "}
                      Sertakan dalam pickup berikutnya
                    </label>
                  )}
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                    {shipment.providerOrderId ? (
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-[10px] leading-tight text-slate-600 min-h-11 flex flex-col justify-center">
                        <p className="font-bold text-slate-900 line-clamp-1">
                          {shipment.providerStatusText ||
                            "Menunggu update provider"}
                        </p>
                        <p className="mt-0.5 opacity-80">
                          Event{" "}
                          {shipment.providerStatusAt
                            ? dateTime(shipment.providerStatusAt)
                            : "belum tersedia"}
                        </p>
                        <p className="mt-0.5 opacity-80">
                          Sinkron{" "}
                          {shipment.providerSyncedAt
                            ? dateTime(shipment.providerSyncedAt)
                            : "belum pernah"}
                        </p>
                      </div>
                    ) : (
                      <div className="flex min-h-11 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold leading-4 text-slate-500">
                        Menunggu Resi
                      </div>
                    )}
                    <a
                      href={`/admin/orders/${encodeURIComponent(shipment.orderNumber)}?edit=shipping`}
                      className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-slate-50 shadow-sm transition-colors hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300"
                    >
                      Edit order
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
          <div
            className="hidden overflow-x-auto lg:block"
            aria-label="Tabel pengiriman desktop"
          >
            <Table className="min-w-[1100px]">
              <TableHeader>
                <TableRow className="bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-500">
                  <TableHead className="w-12 px-4 py-3">
                    <Checkbox
                      checked={visiblePickupSelection}
                      disabled={visiblePickupIds.length === 0}
                      onCheckedChange={(checked) =>
                        setSelectedOrderIds((current) =>
                          updateVisibleSelection(current, visiblePickupIds, Boolean(checked)),
                        )
                      }
                      aria-label={`Pilih semua ${visiblePickupIds.length} pengiriman siap pickup`}
                      className="size-5 data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600"
                    />
                  </TableHead>
                  <TableHead className="px-4 py-3 border-r border-slate-200">
                    Order & customer
                  </TableHead>
                  <TableHead className="px-4 py-3">Tujuan</TableHead>
                  <TableHead className="px-4 py-3">Kurir & resi</TableHead>
                  <TableHead className="px-4 py-3">Status</TableHead>
                  <TableHead className="px-4 py-3">Pickup</TableHead>
                  <TableHead className="px-5 py-3 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShipments.map((shipment) => {
                  const ready = data.readyPickupIds.includes(shipment.id);
                  const selected = selectedOrderIds.includes(shipment.id);
                  return (
                    <TableRow key={shipment.id}>
                      <TableCell className="px-4 py-4">
                        {ready ? (
                          <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) =>
                              setSelectedOrderIds((current) =>
                                checked
                                  ? [...new Set([...current, shipment.id])]
                                  : current.filter((id) => id !== shipment.id),
                              )
                            }
                            aria-label={`Pilih ${shipment.orderNumber} untuk pickup`}
                            className="data-[state=checked]:border-sky-600 data-[state=checked]:bg-sky-600"
                          />
                        ) : (
                          <span className="block size-4" />
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 border-r border-slate-200">
                        <a
                          href={`/admin/orders/${encodeURIComponent(shipment.orderNumber)}`}
                          className="font-black text-slate-950 hover:text-blue-700 hover:underline"
                        >
                          {shipment.orderNumber}
                        </a>
                        <p className="mt-1 font-bold text-slate-700">
                          {shipment.customerName}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">
                          {shipment.customerPhone}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <p className="font-bold text-slate-900">
                          {shipment.city}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {shipment.province}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        <p className="font-black text-slate-900">
                          {shipment.courierCode || "Belum dipilih"}{" "}
                          {shipment.courierService
                            ? `· ${shipment.courierService}`
                            : ""}
                        </p>
                        <p
                          className={`mt-2 font-mono text-[11px] font-black ${shipment.cnoteNo ? "text-blue-700" : "text-amber-700"}`}
                        >
                          {shipment.cnoteNo || (shipment.providerOrderId ? "Draft / Menunggu Resi" : "Resi belum tersedia")}
                        </p>
                        {shipment.providerDispatchError && (
                          <p className="mt-1 text-[10px] text-rose-600 font-bold max-w-[200px] leading-tight">
                            Error: {shipment.providerDispatchError}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] text-slate-400">
                          Ongkir {currency(shipment.shippingCost)}
                        </p>
                      </TableCell>
                      <TableCell className="px-4 py-4 min-w-[200px]">
                        <StatusBadge status={shipment.shippingStatus} />
                        {shipment.providerOrderId && (
                          <div className="mt-2 text-[10px] leading-tight text-slate-500">
                            <p className="font-bold text-slate-700 line-clamp-1">
                              {shipment.providerStatusText ||
                                "Menunggu update provider"}
                            </p>
                            <p className="mt-0.5">
                              Event{" "}
                              {shipment.providerStatusAt
                                ? dateTime(shipment.providerStatusAt)
                                : "belum tersedia"}
                            </p>
                            <p className="mt-0.5">
                              Sinkron{" "}
                              {shipment.providerSyncedAt
                                ? dateTime(shipment.providerSyncedAt)
                                : "belum pernah"}
                            </p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4">
                        {shipment.pickupScheduledAt ? (
                          <>
                            <p className="font-bold text-slate-900">
                              {dateTime(shipment.pickupScheduledAt)}
                            </p>
                            <p className="mt-1 text-[10px] font-bold text-blue-700">
                              {pickupStatusLabels[
                                shipment.pickupStatus || ""
                              ] || shipment.pickupStatus}
                            </p>
                          </>
                        ) : (
                          <p
                            className={`font-bold ${ready ? "text-sky-700" : "text-slate-400"}`}
                          >
                            {ready ? "Siap dijadwalkan" : "Belum siap"}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {!shipment.providerOrderId && (
                            <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-500">
                              Menunggu Resi
                            </span>
                          )}
                          <a
                            href={`/admin/orders/${encodeURIComponent(shipment.orderNumber)}?edit=shipping`}
                            className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md bg-slate-900 px-3 text-xs font-medium text-slate-50 shadow-sm transition-colors hover:bg-slate-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300"
                          >
                            Edit order
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </>
        )}
        </div>
      </section>

      <div>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="text-base font-black text-slate-950">
              Pickup terbaru
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Riwayat jadwal dari gudang aktif.
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {data.pickups.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-5 text-center">
                <Clock3Icon
                  className="mx-auto size-6 text-slate-400"
                  aria-hidden="true"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Belum ada jadwal pickup.
                </p>
              </div>
            ) : (
              data.pickups.map((pickup) => (
                <div
                  key={pickup.id}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-950">
                        {dateTime(pickup.scheduledAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {pickup.warehouseName}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-800">
                      {pickupStatusLabels[pickup.status] || pickup.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="font-bold text-slate-600">
                      {pickup.shipmentCount} paket
                    </span>
                    <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400">
                      {pickup.providerReference}
                      <ChevronRightIcon className="size-3" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
