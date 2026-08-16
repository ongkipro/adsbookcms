import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
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
  MousePointerClick,
  PackageCheck,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  ADMIN_DATE_FILTER_OPTIONS,
  formatJakartaDate,
  getAdminDateFilterLabel,
  isAdminDateFilter,
  resolveAdminDateRange,
  shiftAdminDate,
} from "../../lib/admin-date-filter";

type AnalyticsData = {
  total_revenue: number;
  total_orders: number;
  conversion_rate: number;
  rts_rate: number;
  cod_percentage: number;
  transfer_percentage: number;
  qris_percentage: number;
  trends: Array<{ date: string; revenue: number; orders: number }>;
};

const currency = (value: number) => `IDR ${value.toLocaleString("id-ID")}`;
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
          <div
            key={index}
            className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const today = formatJakartaDate(new Date());
  const customEndMax = customStart
    ? [shiftAdminDate(customStart, 180), today].sort()[0]
    : today;

  const loadAnalytics = useCallback(
    async (
      filter: string,
      showLoading = false,
      customRange?: { start: string; end: string },
    ) => {
      if (showLoading) setLoading(true);
      else setRefreshing(true);
      setError("");

      let start = "";
      let end = "";
      let interval: "hour" | "day" = "day";

      if (filter === "custom") {
        start = customRange?.start ?? "";
        end = customRange?.end ?? "";
        if (start === end && start !== "") interval = "hour";
      } else {
        const range = resolveAdminDateRange(
          isAdminDateFilter(filter) ? filter : "7d",
        );
        start = range.start;
        end = range.end;
        interval = range.interval;
      }

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
        const source = payload.data ?? {};
        setData({
          total_revenue: Number(source.total_revenue) || 0,
          total_orders: Number(source.total_orders) || 0,
          conversion_rate: Number(source.conversion_rate) || 0,
          rts_rate: Number(source.rts_rate) || 0,
          cod_percentage: Number(source.cod_percentage) || 0,
          transfer_percentage: Number(source.transfer_percentage) || 0,
          qris_percentage: Number(source.qris_percentage) || 0,
          trends: Array.isArray(source.trends) ? source.trends : [],
        });
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Ringkasan analitik gagal dimuat.",
        );
      } finally {
        if (showLoading) setLoading(false);
        else setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (dateFilter !== "custom") void loadAnalytics(dateFilter, true);
  }, [loadAnalytics, dateFilter]);

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
          onClick={() => void loadAnalytics(dateFilter, true)}
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
      note: "Pendapatan pada periode aktif",
      icon: BadgeDollarSign,
      tone: "text-emerald-700",
      iconTone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Pesanan",
      value: data.total_orders.toLocaleString("id-ID"),
      note: "Order masuk terverifikasi",
      icon: PackageCheck,
      tone: "text-slate-950",
      iconTone: "bg-blue-50 text-blue-700",
    },
    {
      label: "Konversi Ads",
      value: percentage(data.conversion_rate),
      note: "Pixel & CAPI ter-dedup",
      icon: MousePointerClick,
      tone: "text-slate-950",
      iconTone: "bg-violet-50 text-violet-700",
    },
    {
      label: "Return to Sender",
      value: percentage(data.rts_rate),
      note: "Rasio pesanan dikembalikan",
      icon: RotateCcw,
      tone: data.rts_rate > 10 ? "text-rose-700" : "text-slate-950",
      iconTone:
        data.rts_rate > 10
          ? "bg-rose-50 text-rose-700"
          : "bg-amber-50 text-amber-700",
    },
  ];

  const payments = [
    {
      name: "COD",
      value: data.cod_percentage,
      bar: "bg-emerald-600",
      countLabel: "Bayar saat barang diterima",
    },
    {
      name: "Transfer Bank",
      value: data.transfer_percentage,
      bar: "bg-blue-600",
      countLabel: "Virtual Account AutoLaris",
    },
    {
      name: "QRIS",
      value: data.qris_percentage,
      bar: "bg-violet-600",
      countLabel: "QR dan e-wallet",
    },
  ];


  return (
    <div className="space-y-4 md:space-y-5">
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <CalendarDays className="size-[18px]" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-900">Periode laporan</p>
            <p className="text-[11px] text-slate-500">
              Semua metrik mengikuti periode ini; default seluruh riwayat.
            </p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Select
            value={dateFilter}
            onValueChange={(value) => setDateFilter(value || "all")}
            disabled={loading || refreshing}
          >
            <SelectTrigger className="h-11 min-w-0 flex-1 border-slate-200 bg-white shadow-none sm:w-52">
              <SelectValue>
                {dateFilter === "custom"
                  ? "Rentang tanggal"
                  : getAdminDateFilterLabel(dateFilter)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ADMIN_DATE_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Rentang tanggal</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="icon"
            onClick={() =>
              void loadAnalytics(
                dateFilter,
                false,
                dateFilter === "custom"
                  ? { start: customStart, end: customEnd }
                  : undefined,
              )
            }
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

      {dateFilter === "custom" && (
        <section className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="grid-cols-1 grid gap-1.5">
            <span className="text-xs font-bold text-slate-700">
              Tanggal mulai
            </span>
            <input
              type="date"
              value={customStart}
              max={customEnd || today}
              onChange={(event) => setCustomStart(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
            />
          </label>
          <label className="grid-cols-1 grid gap-1.5">
            <span className="text-xs font-bold text-slate-700">
              Tanggal akhir
            </span>
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              max={customEndMax}
              onChange={(event) => setCustomEnd(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
            />
          </label>
          <Button
            onClick={() =>
              void loadAnalytics("custom", true, {
                start: customStart,
                end: customEnd,
              })
            }
            disabled={
              !customStart ||
              !customEnd ||
              customStart > customEnd ||
              customEnd > customEndMax ||
              loading ||
              refreshing
            }
            size="lg"
            className="h-11 w-full sm:w-auto"
          >
            Terapkan
          </Button>
          <p className="text-[11px] text-slate-500 sm:col-span-3">
            Rentang khusus maksimal 31 hari dan tidak boleh melewati hari ini.
          </p>
        </section>
      )}

      {error && (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800"
          role="alert"
        >
          {error}
        </div>
      )}

      <section
        className="grid grid-cols-2 gap-3 xl:grid-cols-4"
        aria-label="Ringkasan performa toko"
      >
        {metrics.map((metric) => (
          <Card key={metric.label} className="overflow-hidden border-slate-200 shadow-sm">
            <CardContent className="p-3.5 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:text-[11px]">
                  {metric.label}
                </p>
                <span className={`hidden size-8 shrink-0 place-items-center rounded-xl sm:grid ${metric.iconTone}`}>
                  <metric.icon className="size-4" aria-hidden="true" />
                </span>
              </div>
              <p className={`mt-3 truncate text-xl font-extrabold tracking-[-0.035em] sm:text-2xl ${metric.tone}`}>
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
        <Card aria-labelledby="trend-heading" className="min-w-0 border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle as="h3" id="trend-heading" className="text-sm font-bold text-slate-950 md:text-base">
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
                  <p className="mt-2 text-sm font-bold text-slate-700">
                    Belum ada data periode ini
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Grafik terisi setelah order tercatat.
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-[280px] w-full">
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
                          const date = new Date(value);
                          return `${date.getDate()}/${date.getMonth() + 1}`;
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

        <Card aria-labelledby="payment-mix-heading" className="border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle as="h3" id="payment-mix-heading" className="text-sm font-bold text-slate-950 md:text-base">
              Metode pembayaran
            </CardTitle>
            <CardDescription className="text-xs">
              Komposisi transaksi pada periode aktif.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-5">
            {payments.map((item) => (
              <div key={item.name}>
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-slate-800">
                      {item.name}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500">
                      {item.countLabel}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-slate-950">
                    {percentage(item.value)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${item.bar}`}
                    style={{
                      width: `${Math.max(0, Math.min(100, item.value))}%`,
                    }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            ))}
            <a href="/admin/payments" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
              Kelola payment
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
