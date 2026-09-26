import * as React from "react";
import { ArrowLeftRight, Copy, ExternalLink, Loader2, MessageCircle, Search, Truck, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DistrictCombobox, type DistrictOption } from "@/components/admin/DistrictCombobox";
import { formatIdr } from "@/lib/format-idr";
import { courierDisplayName } from "@/lib/courier-names";
import {
  RISK_COPY,
  etaLabel,
  formatRate,
  ratesWhatsAppText,
  visibleRates,
  waMeNumber,
  type QuotedRate,
  type RateFilter,
  type RateSort,
  type RiskLevel,
} from "@/lib/rate-check";

type CourierPerformance = {
  courier: string;
  total: number;
  delivered: number;
  rts: number;
  inProgress: number;
  deliveryRate: number | null;
};
type ReceiverPerformance = {
  phone: string;
  checkedAt: string;
  deliveryRate: number | null;
  riskLevel: RiskLevel;
  totals: { total: number; delivered: number; rts: number; inProgress: number };
  couriers: CourierPerformance[];
};

const TONE_CLASS: Record<(typeof RISK_COPY)[RiskLevel]["tone"], string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-rose-200 bg-rose-50 text-rose-800",
  none: "border-slate-200 bg-slate-50 text-slate-700",
};

const SORT_LABELS: Record<RateSort, string> = {
  "price-asc": "Harga termurah",
  "price-desc": "Harga tertinggi",
  "eta-asc": "Estimasi tercepat",
};

async function copy(text: string, message: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("Browser menolak akses clipboard.");
  }
}

async function searchMengantarAreas(query: string, signal: AbortSignal): Promise<DistrictOption[]> {
  const response = await fetch(`/api/admin/ongkir?action=search-address&keyword=${encodeURIComponent(query)}`, { signal });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Pencarian gagal.");
  return (Array.isArray(payload.data) ? payload.data : []).map((row: Record<string, string>) => ({
    id: String(row._id),
    label: [row.SUBDISTRICT_NAME || row.DISTRICT_NAME, row.CITY_NAME].filter(Boolean).join(", "),
    detail: [row.DISTRICT_NAME, row.PROVINCE_NAME].filter(Boolean).join(", "),
  }));
}

function ReceiverCheck({ initialPhone }: { initialPhone: string }) {
  const [phone, setPhone] = React.useState(initialPhone);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [result, setResult] = React.useState<ReceiverPerformance | null>(null);

  const check = React.useCallback(async (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) {
      setError("Masukkan 9–15 digit nomor WhatsApp.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/check?search=${encodeURIComponent(value.trim())}`, { headers: { Accept: "application/json" } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success || !payload.performance) throw new Error(payload.error || "Riwayat penerima gagal dimuat.");
      setResult(payload.performance as ReceiverPerformance);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Riwayat penerima gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialPhone) void check(initialPhone);
  }, [initialPhone, check]);

  const risk = result ? RISK_COPY[result.riskLevel] ?? RISK_COPY.UNKNOWN : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2 text-base font-semibold">
          <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" /> Riwayat penerima (RTS)
        </CardTitle>
        <CardDescription>Paket terkirim vs retur untuk nomor ini, dari data Mengantar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="space-y-2"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void check(phone);
          }}
        >
          <label htmlFor="receiver-phone" className="text-sm font-medium">Nomor WhatsApp pembeli</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Input
                id="receiver-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="081234567890"
                aria-describedby="receiver-phone-hint"
                aria-invalid={error ? true : undefined}
                className="pr-10 font-mono"
              />
              {phone && (
                <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1.5 top-1/2 -translate-y-1/2" aria-label="Kosongkan nomor" onClick={() => setPhone("")}>
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
              {loading ? "Memeriksa…" : "Periksa riwayat"}
            </Button>
          </div>
          <p id="receiver-phone-hint" className={error ? "text-sm text-destructive" : "text-xs text-muted-foreground"} role={error ? "alert" : undefined}>
            {error || "9–15 digit; awalan +62 atau 08 dikenali otomatis."}
          </p>
        </form>

        {result && risk && (
          <section aria-labelledby="receiver-rate" className="space-y-4">
            <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-muted/40 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Tingkat keberhasilan pengiriman</p>
                <p id="receiver-rate" className="font-mono text-2xl font-semibold">
                  {formatRate(result.deliveryRate)}
                  <span className="text-base text-muted-foreground">%</span>
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  {result.phone} · diperiksa {new Date(result.checkedAt).toLocaleString("id-ID")}
                </p>
              </div>
              <div className="space-y-2 sm:max-w-sm sm:text-right">
                <Badge variant="outline" className={`h-6 ${TONE_CLASS[risk.tone]}`}>{risk.label}</Badge>
                <p className="text-sm text-muted-foreground">{risk.guidance}</p>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <a className={buttonVariants({ variant: "outline", size: "lg" })} href={`https://wa.me/${waMeNumber(result.phone)}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle aria-hidden="true" /> Buka WhatsApp
                  </a>
                  <a className={buttonVariants({ variant: "outline", size: "lg" })} href={`/admin/orders?search=${encodeURIComponent(result.phone)}`}>
                    <ExternalLink aria-hidden="true" /> Order nomor ini
                  </a>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() =>
                      void copy(
                        `[Riwayat WA ${result.phone}]\nTingkat keberhasilan: ${result.deliveryRate == null ? "belum ada" : `${formatRate(result.deliveryRate)}%`}\nStatus: ${risk.label}\nSelesai ${result.totals.total} (terkirim ${result.totals.delivered}, RTS ${result.totals.rts}, berjalan ${result.totals.inProgress})`,
                        "Ringkasan disalin.",
                      )
                    }
                  >
                    <Copy aria-hidden="true" /> Salin ringkasan
                  </Button>
                </div>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Total selesai", result.totals.total, ""],
                ["Terkirim", result.totals.delivered, "text-emerald-700"],
                ["Retur (RTS)", result.totals.rts, "text-rose-700"],
                ["Sedang berjalan", result.totals.inProgress, "text-sky-700"],
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-slate-200 p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className={`mt-1 font-mono text-2xl font-semibold ${tone}`}>{value}</dd>
                </div>
              ))}
            </dl>

            {result.couriers.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kurir</TableHead>
                      <TableHead className="text-right">Terkirim</TableHead>
                      <TableHead className="text-right">RTS</TableHead>
                      <TableHead className="text-right">Berjalan</TableHead>
                      <TableHead className="text-right">Keberhasilan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.couriers.map((courier) => (
                      <TableRow key={courier.courier}>
                        <TableCell className="font-medium uppercase">{courier.courier}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-700">{courier.delivered}</TableCell>
                        <TableCell className="text-right font-mono text-rose-700">{courier.rts}</TableCell>
                        <TableCell className="text-right font-mono text-sky-700">{courier.inProgress}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">{courier.deliveryRate == null ? "—" : `${formatRate(courier.deliveryRate)}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Ambang risiko: rendah ≥ 70%, sedang 40–69,9%, tinggi &lt; 40% (terkirim ÷ total selesai). Pakai sebagai bahan konfirmasi sebelum memproses COD.
            </p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function RateCheck({ defaultOrigin, warehouseName }: { defaultOrigin: DistrictOption | null; warehouseName: string }) {
  const [origin, setOrigin] = React.useState<DistrictOption | null>(defaultOrigin);
  const [destination, setDestination] = React.useState<DistrictOption | null>(null);
  const [weight, setWeight] = React.useState("1");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [rates, setRates] = React.useState<QuotedRate[] | null>(null);
  const [filter, setFilter] = React.useState<RateFilter>("all");
  const [sort, setSort] = React.useState<RateSort>("price-asc");

  const weightKg = Number(weight);
  const rows = rates ? visibleRates(rates, filter, sort) : [];
  const cheapest = rows.length ? Math.min(...rows.map((rate) => rate.price)) : 0;

  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!origin || !destination) {
      setError("Pilih kecamatan asal dan tujuan dari daftar.");
      return;
    }
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setError("Berat paket harus lebih dari 0 kg.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ action: "estimate", origin: origin.id, destination: destination.id, weight: String(weightKg) });
      const response = await fetch(`/api/admin/ongkir?${params}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false || !Array.isArray(payload.data)) throw new Error(payload.error || payload.message || "Tarif kurir gagal dimuat.");
      setRates(payload.data as QuotedRate[]);
    } catch (caught) {
      setRates(null);
      setError(caught instanceof Error ? caught.message : "Tarif kurir gagal dimuat.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2 text-base font-semibold">
          <Truck className="size-4 text-muted-foreground" aria-hidden="true" /> Cek ongkir multi-kurir
        </CardTitle>
        <CardDescription>Tarif, estimasi tiba, dan COD per kurir.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-4" noValidate onSubmit={submit}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
            <div className="space-y-1.5">
              <label htmlFor="rate-origin" className="text-sm font-medium">Kecamatan asal</label>
              <DistrictCombobox id="rate-origin" value={origin} onChange={setOrigin} search={searchMengantarAreas} describedBy="rate-origin-hint" />
              <p id="rate-origin-hint" className="text-xs text-muted-foreground">
                {defaultOrigin && origin?.id === defaultOrigin.id ? `Default: ${warehouseName || "gudang toko"}` : "Bisa diganti untuk cek dari lokasi lain."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="mx-auto md:mb-6"
              aria-label="Tukar asal dan tujuan"
              onClick={() => {
                setOrigin(destination);
                setDestination(origin);
              }}
            >
              <ArrowLeftRight aria-hidden="true" />
            </Button>
            <div className="space-y-1.5">
              <label htmlFor="rate-destination" className="text-sm font-medium">Kecamatan tujuan</label>
              <DistrictCombobox id="rate-destination" value={destination} onChange={setDestination} search={searchMengantarAreas} />
              <p className="text-xs text-muted-foreground">Ketik nama kecamatan pembeli.</p>
            </div>
          </div>

          <div className="space-y-1.5 sm:max-w-xs">
            <label htmlFor="rate-weight" className="text-sm font-medium">Berat paket</label>
            <InputGroup>
              <InputGroupInput id="rate-weight" type="number" inputMode="decimal" min="0.1" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} className="font-mono" />
              <InputGroupAddon align="inline-end">kg</InputGroupAddon>
            </InputGroup>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Berat cepat">
              {[1, 2, 3, 5].map((kg) => (
                <Button key={kg} type="button" size="sm" variant={weightKg === kg ? "secondary" : "outline"} aria-pressed={weightKg === kg} onClick={() => setWeight(String(kg))}>
                  {kg} kg
                </Button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Truck aria-hidden="true" />}
              {loading ? "Menghitung…" : "Cek tarif kurir"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        </form>

        {rates && (
          <section aria-label="Hasil tarif kurir" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5" role="group" aria-label="Filter kurir">
                {(["all", "cod"] as const).map((value) => (
                  <Button key={value} type="button" size="lg" variant={filter === value ? "secondary" : "outline"} aria-pressed={filter === value} onClick={() => setFilter(value)}>
                    {value === "all" ? `Semua (${rates.length})` : `Bisa COD (${rates.filter((rate) => !rate.unsupported_cod).length})`}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Select items={SORT_LABELS} value={sort} onValueChange={(value) => setSort((value as RateSort) ?? "price-asc")}>
                  <SelectTrigger aria-label="Urutkan tarif" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SORT_LABELS) as RateSort[]).map((value) => (
                      <SelectItem key={value} value={value}>{SORT_LABELS[value]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" disabled={!rates.length} onClick={() => void copy(ratesWhatsAppText(rates, destination?.label ?? "", weightKg), "Daftar tarif disalin untuk WhatsApp.")}>
                  <Copy aria-hidden="true" /> Salin untuk WA
                </Button>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-muted-foreground">
                {rates.length === 0 ? "Tidak ada kurir yang melayani rute ini." : "Tidak ada kurir yang cocok dengan filter."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200" role="region" aria-label="Tarif ongkir per kurir" tabIndex={0}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kurir</TableHead>
                      <TableHead className="text-right">Ongkir</TableHead>
                      <TableHead>Estimasi</TableHead>
                      <TableHead>COD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((rate) => (
                      <TableRow key={`${rate.courier_code}-${rate.courier_service}`}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {courierDisplayName(rate.courier_code)}
                            {rate.price === cheapest && <Badge variant="secondary" className="normal-case">Termurah</Badge>}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">{formatIdr(rate.price)}</TableCell>
                        <TableCell className="text-muted-foreground">{etaLabel(rate.estimated_days) || "—"}</TableCell>
                        <TableCell>
                          {rate.unsupported_cod ? <Badge variant="outline">Non-COD</Badge> : <Badge variant="outline" className={TONE_CLASS.good}>Bisa COD</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default function RateCheckTools({
  defaultOrigin,
  warehouseName,
  initialPhone = "",
}: {
  defaultOrigin: DistrictOption | null;
  warehouseName: string;
  initialPhone?: string;
}) {
  return (
    // Side by side on a wide screen: both checks are short forms, and stacked
    // they left half the desktop empty and pushed the rate form off-screen.
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <ReceiverCheck initialPhone={initialPhone} />
      <RateCheck defaultOrigin={defaultOrigin} warehouseName={warehouseName} />
    </div>
  );
}
