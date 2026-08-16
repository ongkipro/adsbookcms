import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import type {
  HealthSignal,
  HealthState,
  OperationalHealth as OperationalHealthPayload,
} from "../../lib/operational-health";

/**
 * Operator-facing view of `/api/admin/health` (`OBSERVABILITY.md` §4 item 4).
 *
 * The three states are visually distinct on purpose. "Belum ada data" is amber
 * and quiet; only a real fault is red. Conflating them is how a health panel
 * stops being read.
 */

const SIGNAL_TITLES: Record<HealthSignal["id"], string> = {
  "capi-outbox": "Antrean Meta CAPI",
  "meta-capi": "Pengiriman Meta CAPI terakhir",
  mengantar: "Kontak Mengantar terakhir",
  autolaris: "Kontak AutoLaris terakhir",
};

const REASONS: Record<string, string> = {
  unreadable: "Tabelnya tidak bisa dibaca — cek Workers Logs.",
  // capi-outbox
  empty: "Tidak ada event yang menunggu dikirim.",
  draining: "Ada event menunggu, masih di dalam jadwal retry.",
  stalled: "Event sudah lewat jadwal retry dan belum terkirim — antrean macet.",
  "terminal-failures":
    "Ada conversion yang gagal permanen dan tidak akan pernah sampai ke Meta.",
  // meta-capi
  "never-enqueued": "Belum pernah ada conversion event yang tercatat.",
  "no-delivery-in-window": "Tidak ada pengiriman pada 200 event terakhir.",
  "never-delivered": "Semua event yang tercatat gagal terkirim.",
  failing: "Kegagalan terakhir lebih baru daripada keberhasilan terakhir.",
  delivered: "Meta menerima event terakhir dengan sukses.",
  // mengantar
  "no-orders": "Belum ada order sama sekali.",
  "never-dispatched": "Belum ada order yang dikirim ke Mengantar.",
  "all-attempts-failed": "Semua percobaan dispatch pada jendela ini gagal.",
  dispatched: "Mengantar menerima dispatch terakhir.",
  // autolaris
  "never-used": "Belum pernah ada transaksi payment gateway.",
  "no-accepted-request": "Belum ada request pembayaran yang diterima AutoLaris.",
  "create-failing": "Semua request pembuatan pembayaran gagal.",
  "awaiting-first-callback":
    "Request diterima AutoLaris, callback pembayaran belum pernah masuk.",
  "callback-received": "Callback pembayaran terakhir diterima.",
};

const STATE_LABEL: Record<HealthState, string> = {
  healthy: "Sehat",
  degraded: "Bermasalah",
  unknown: "Belum ada data",
};

const STATE_TONE: Record<HealthState, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-800",
  degraded: "border-rose-200 bg-rose-50 text-rose-800",
  unknown: "border-amber-200 bg-amber-50 text-amber-800",
};

const STATE_ICON: Record<HealthState, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  unknown: HelpCircle,
};

function formatAge(minutes: number | null) {
  if (minutes === null) return "—";
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

function describeMetrics(signal: HealthSignal) {
  if (signal.id === "capi-outbox") {
    const { pending = 0, failed = 0, overdue = 0 } = signal.metrics;
    return `${pending} menunggu · ${overdue} lewat jadwal · ${failed} gagal permanen`;
  }
  const failed = signal.metrics.failedInWindow;
  return typeof failed === "number" && failed > 0
    ? `${failed} kegagalan tercatat pada 200 baris terakhir`
    : null;
}

function ageLabel(signal: HealthSignal) {
  return signal.id === "capi-outbox" ? "Antrean tertua" : "Terakhir sukses";
}

export default function OperationalHealth() {
  const [health, setHealth] = useState<OperationalHealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/health", {
        headers: { Accept: "application/json" },
      });
      if (response.status === 403) {
        // Role tables in src/lib/auth.ts decide this; an empty panel is the
        // honest rendering, not an error the operator can act on.
        setHidden(true);
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false || !payload.health) {
        throw new Error(payload.error || "Status operasional gagal dimuat.");
      }
      setHealth(payload.health as OperationalHealthPayload);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status operasional gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden) return null;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="min-w-0">
          <CardTitle as="h3" className="text-sm font-bold text-slate-950 md:text-base">
            Kesehatan operasional
          </CardTitle>
          <CardDescription className="text-xs">
            Antrean conversion dan kontak provider terakhir. &quot;Belum ada data&quot;
            berarti belum pernah tercatat, bukan gagal.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0"
        >
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden />
          <span className="sr-only">Muat ulang status operasional</span>
        </Button>
      </CardHeader>
      <CardContent className="pt-5">
        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
            {error}
          </p>
        ) : !health ? (
          <div className="grid-cols-1 grid gap-2" aria-hidden>
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-14 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <>
            <ul className="grid-cols-1 grid gap-2">
              {health.signals.map((signal) => {
                const Icon = STATE_ICON[signal.state];
                const metrics = describeMetrics(signal);
                return (
                  <li
                    key={signal.id}
                    className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">
                        {SIGNAL_TITLES[signal.id]}
                      </p>
                      <p className="text-[11px] leading-relaxed text-slate-500">
                        {REASONS[signal.reason] || signal.reason}
                        {metrics ? ` · ${metrics}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-right text-[11px] text-slate-500">
                        {ageLabel(signal)}
                        <br />
                        <span className="font-bold text-slate-700">
                          {formatAge(signal.ageMinutes)}
                        </span>
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${STATE_TONE[signal.state]}`}
                      >
                        <Icon className="size-3.5" aria-hidden />
                        {STATE_LABEL[signal.state]}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[11px] text-slate-500">
              Versi {health.build.version} ({health.build.releaseTag}) · skema{" "}
              {health.build.appliedSchemaVersion ?? "?"}/{health.build.expectedSchemaVersion}
              {health.build.schemaState === "match" ? "" : ` · ${health.build.schemaState}`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
