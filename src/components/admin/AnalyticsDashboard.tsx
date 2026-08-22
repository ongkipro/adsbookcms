import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import {
  BadgeDollarSign,
  CalendarDays,
  CircleCheckBig,
  CreditCard,
  PackageCheck,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  ADMIN_DEFAULT_DATE_FILTER,
  resolveAdminDateSelection,
} from "../../lib/admin-date-filter";
import {
  AdminDateRangeFilter,
  type AdminDateSelection,
} from "./AdminDateRangeFilter";

/**
 * The dashboard charts every day in the period and aggregates across it, so it
 * reports on a shorter window than the order and shipping lists do, and hides
 * the presets that would exceed it.
 */
const DASHBOARD_MAX_RANGE_DAYS = 31;
const DASHBOARD_HIDDEN_PRESETS = ["90d", "180d"] as const;

type AnalyticsData = {
  total_revenue: number;
  collected_revenue: number;
  total_orders: number;
  live_orders: number;
  online_orders: number;
  conversion_rate: number;
  rts_rate: number;
  rts_base: number;
  cod_percentage: number;
  transfer_percentage: number;
  qris_percentage: number;
  payment_methods: {
    total: number;
    cod: PaymentMethodBucket;
    manual_transfer: PaymentMethodBucket;
    virtual_account: PaymentMethodBucket;
    qris: PaymentMethodBucket;
    unknown_count: number;
  };
  period: {
    start_date: string | null;
    end_date: string | null;
    timezone: string;
    basis: string;
    interval: "hour" | "day";
  };
  trends: Array<{ date: string; revenue: number; orders: number }>;
};

type PaymentMethodBucket = { count: number; percentage: number };

const currency = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
}).format;
const percentage = (value: number) =>
  `${value.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

function LoadingState() {
  return (
    <div
      className="space-y-6"
      aria-label="Memuat ringkasan analitik"
      aria-busy="true"
    >
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

export function AnalyticsDashboard({ showPaymentsLink = false }: { showPaymentsLink?: boolean }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dateSelection, setDateSelection] = useState<AdminDateSelection>({
    filter: ADMIN_DEFAULT_DATE_FILTER,
    start: "",
    end: "",
  });
  const requestSequence = useRef(0);

  const loadAnalytics = useCallback(
    async (selection: AdminDateSelection, showLoading = false) => {
      const sequence = ++requestSequence.current;
      if (showLoading) setLoading(true);
      else setRefreshing(true);
      setError("");

      // One resolver for every period, named or explicit. A period this
      // surface cannot answer for is reported, not quietly swapped for the
      // default (REQ-157).
      const resolved = resolveAdminDateSelection(selection.filter, {
        customRange: { start: selection.start, end: selection.end },
        maxCustomRangeDays: DASHBOARD_MAX_RANGE_DAYS,
      });
      if (!resolved.ok) {
        setError(resolved.reason);
        if (showLoading) setLoading(false);
        else setRefreshing(false);
        return;
      }
      const { start, end, interval } = resolved;

      let url = "/api/admin/analytics";
      if (start && end) {
        url += `?startDate=${start}&endDate=${end}&interval=${interval}`;
      }

      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success)
          throw new Error(payload.error || "Ringkasan analitik gagal dimuat.");
        if (sequence !== requestSequence.current) return;
        const source = payload.data ?? {};
        const sourcePayments = source.payment_methods ?? {};
        const bucket = (value: unknown): PaymentMethodBucket => {
          const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
          return {
            count: Number(item.count) || 0,
            percentage: Number(item.percentage) || 0,
          };
        };
        setData({
          total_revenue: Number(source.total_revenue) || 0,
          collected_revenue: Number(source.collected_revenue) || 0,
          total_orders: Number(source.total_orders) || 0,
          live_orders: Number(source.live_orders) || 0,
          online_orders: Number(source.online_orders) || 0,
          conversion_rate: Number(source.conversion_rate) || 0,
          rts_rate: Number(source.rts_rate) || 0,
          rts_base: Number(source.rts_base) || 0,
          cod_percentage: Number(source.cod_percentage) || 0,
          transfer_percentage: Number(source.transfer_percentage) || 0,
          qris_percentage: Number(source.qris_percentage) || 0,
          payment_methods: {
            total: Number(sourcePayments.total) || 0,
            cod: bucket(sourcePayments.cod),
            manual_transfer: bucket(sourcePayments.manual_transfer),
            virtual_account: bucket(sourcePayments.virtual_account),
            qris: bucket(sourcePayments.qris),
            unknown_count: Number(sourcePayments.unknown_count) || 0,
          },
          period: {
            start_date: typeof source.period?.start_date === "string" ? source.period.start_date : null,
            end_date: typeof source.period?.end_date === "string" ? source.period.end_date : null,
            timezone: String(source.period?.timezone || "Asia/Jakarta"),
            basis: String(source.period?.basis || "order_created_at"),
            interval: source.period?.interval === "hour" ? "hour" : "day",
          },
          trends: Array.isArray(source.trends) ? source.trends : [],
        });
      } catch (reason) {
        if (sequence !== requestSequence.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Ringkasan analitik gagal dimuat.",
        );
      } finally {
        if (sequence !== requestSequence.current) return;
        if (showLoading) setLoading(false);
        else setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadAnalytics(dateSelection, true);
  }, [loadAnalytics, dateSelection]);

  if (loading) return <LoadingState />;
  if (error && !data) {
    return (
      <section
        className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center"
        role="alert"
      >
        <h2 className="text-base font-bold text-rose-950">
          Analitik tidak dapat dimuat
        </h2>
        <p className="mt-1.5 text-xs text-rose-700">{error}</p>
        <Button
          onClick={() => void loadAnalytics(dateSelection, true)}
          size="lg" className="mt-4"
        >
          Coba lagi
        </Button>
      </section>
    );
  }
  if (!data) return null;

  const metrics = [
    {
      label: "Omset",
      value: currency(data.total_revenue),
      // Not "pendapatan": this is order value still in play, before payment.
      // Cancelled orders and failed payments are already excluded.
      note: `Nilai ${data.live_orders.toLocaleString("id-ID")} order aktif · diterima ${currency(data.collected_revenue)}`,
      icon: BadgeDollarSign,
      tone: "text-emerald-700",
      iconTone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Pesanan",
      value: data.total_orders.toLocaleString("id-ID"),
      note:
        data.total_orders === data.live_orders
          ? "Order masuk pada periode ini"
          : `Order masuk · ${(data.total_orders - data.live_orders).toLocaleString("id-ID")} batal/gagal`,
      icon: PackageCheck,
      tone: "text-slate-950",
      iconTone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Pembayaran online lunas",
      value: percentage(data.conversion_rate),
      // COD is paid on delivery and is excluded from the base on purpose.
      note: `Dari ${data.online_orders.toLocaleString("id-ID")} order non-COD`,
      icon: CircleCheckBig,
      tone: "text-slate-950",
      iconTone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Return to Sender",
      value: percentage(data.rts_rate),
      note:
        data.rts_base > 0
          ? `Dari ${data.rts_base.toLocaleString("id-ID")} kiriman selesai`
          : "Belum ada kiriman yang selesai",
      icon: RotateCcw,
      tone: data.rts_rate > 10 ? "text-rose-700" : "text-slate-950",
      iconTone:
        data.rts_rate > 10
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-600",
    },
  ];

  const payments = [
    {
      name: "COD",
      ...data.payment_methods.cod,
      bar: "bg-blue-600",
      detail: "Bayar saat barang diterima",
    },
    {
      name: "Transfer bank manual",
      ...data.payment_methods.manual_transfer,
      bar: "bg-emerald-600",
      detail: "Langsung ke rekening seller · tanpa rekonsiliasi AutoLaris",
    },
    {
      name: "Virtual Account",
      ...data.payment_methods.virtual_account,
      bar: "bg-violet-600",
      detail: "Pembayaran dan rekonsiliasi AutoLaris",
    },
    {
      name: "QRIS",
      ...data.payment_methods.qris,
      bar: "bg-slate-500",
      detail: "Pembayaran dan rekonsiliasi AutoLaris",
    },
  ];

  const periodLabel = data.period.start_date && data.period.end_date
    ? `${data.period.start_date.split("-").reverse().join("/")}–${data.period.end_date.split("-").reverse().join("/")} · WIB`
    : "Semua pesanan checkout · WIB";


  return (
    <div className="space-y-4 md:space-y-5">
      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <CalendarDays className="size-[18px]" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-medium text-slate-900">Periode laporan</p>
            <p className="text-[11px] text-slate-500">
              Semua metrik mengikuti periode ini; dibuka pada bulan berjalan (WIB).
            </p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <AdminDateRangeFilter
            value={dateSelection}
            onChange={setDateSelection}
            disabled={loading || refreshing}
            hiddenPresets={DASHBOARD_HIDDEN_PRESETS}
            maxCustomRangeDays={DASHBOARD_MAX_RANGE_DAYS}
            className="min-w-0 flex-1 sm:w-64"
          />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => void loadAnalytics(dateSelection)}
            disabled={refreshing}
            aria-label="Perbarui data dashboard"
            aria-busy={refreshing}
            className="size-11 shrink-0 border border-slate-200 bg-white shadow-none"
          >
            <RefreshCw
              className={`size-4 ${refreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
          </Button>
        </div>
      </section>


      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800"
          role="alert"
        >
          {error}{data ? " Data periode terakhir yang berhasil dimuat tetap ditampilkan." : ""}
        </div>
      )}

      <section
        className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4"
        aria-label="Ringkasan performa toko"
      >
        {metrics.map((metric) => (
          <Card key={metric.label} className="overflow-hidden border-slate-200 shadow-none">
            <CardContent className="p-3.5 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500 sm:text-[11px]">
                  {metric.label}
                </p>
                <span className={`hidden size-8 shrink-0 place-items-center rounded-xl sm:grid ${metric.iconTone}`}>
                  <metric.icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className={`mt-3 text-lg font-semibold tabular-nums tracking-[-0.035em] sm:text-2xl ${metric.tone}`}>
                {metric.value}
              </p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500 sm:text-[11px]">
                {metric.note}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <Card aria-labelledby="trend-heading" className="min-w-0 border-slate-200 shadow-none">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle as="h3" id="trend-heading" className="text-sm font-semibold text-slate-950 md:text-base">
              Tren omset
            </CardTitle>
            <CardDescription className="text-xs">
              Nilai kotor berdasarkan waktu order dibuat.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-2 pb-4 pt-5 sm:px-5">
            {data.trends.length === 0 ? (
              <div className="grid h-[280px] place-items-center rounded-xl bg-slate-50 text-center">
                <div>
                  <PackageCheck className="mx-auto size-6 text-slate-300" aria-hidden="true" />
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    Belum ada data periode ini
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Grafik terisi setelah order tercatat.
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-[240px] w-full sm:h-[280px]">
                <ChartContainer
                  config={{
                    revenue: {
                      label: "Omset",
                      color: "var(--admin-accent)",
                    },
                  }}
                  className="h-full w-full"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.trends}
                      margin={{ top: 8, right: 8, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="#e8edf3"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(value) => {
                          if (value.includes(":"))
                            return value.split(" ")[1].substring(0, 5);
                          const [year, month, day] = String(value).slice(0, 10).split("-");
                          return year && month && day ? `${Number(day)}/${Number(month)}` : value;
                        }}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                        dy={10}
                      />
                      <YAxis
                        tickFormatter={(value) =>
                          `Rp${(value / 1_000_000).toFixed(0)}jt`
                        }
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 10, fill: "#64748b" }}
                      />
                      <ChartTooltip
                        cursor={{ fill: "rgba(148,163,184,0.08)" }}
                        content={<ChartTooltipContent />}
                      />
                      <Bar
                        dataKey="revenue"
                        fill="var(--color-revenue)"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={38}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card aria-labelledby="payment-mix-heading" className="border-slate-200 shadow-none">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle as="h3" id="payment-mix-heading" className="text-sm font-semibold text-slate-950 md:text-base">
              Metode pembayaran
            </CardTitle>
            <CardDescription className="text-xs">
              Pesanan dibuat, {periodLabel}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            {data.payment_methods.total === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
                <CreditCard className="mx-auto size-5 text-slate-400" aria-hidden="true" />
                <p className="mt-2 text-xs font-semibold text-slate-800">Belum ada pesanan selesai checkout pada periode ini.</p>
              </div>
            ) : payments.map((item) => (
              <div key={item.name}>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-800">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
                      {item.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-950">
                    {item.count.toLocaleString("id-ID")} pesanan · {percentage(item.percentage)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${item.bar}`}
                    style={{
                      width: `${Math.max(0, Math.min(100, item.percentage))}%`,
                    }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            ))}
            {data.payment_methods.unknown_count > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
                {data.payment_methods.unknown_count.toLocaleString("id-ID")} pesanan memakai metode pembayaran legacy yang belum dipetakan.
              </p>
            )}
            {showPaymentsLink && (
              <a href="/admin/payments" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Kelola payment
              </a>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
