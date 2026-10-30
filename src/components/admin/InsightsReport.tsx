import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowDownUp, ChartNoAxesCombined, Filter, Package } from 'lucide-react';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { AdminDateRangeFilter, type AdminDateSelection } from './AdminDateRangeFilter';
import { FilterBar, FilterField, FilterSelect, SearchInput } from './filter-bar';
import { INSIGHTS_CHANNEL_OPTIONS, insightsDateSelection, insightsInitialQuery, insightsMoney as money, insightsNumber as number, insightsOrderLink, insightsPercent as percent, sortInsightRows, withInsightsPeriod, type InsightsReport as Report } from '../../lib/insights-view';
import { INSIGHTS_MAX_RANGE_DAYS } from '../../lib/insights-period';
import { SOURCE_SLUG_NONE_FILTER, SOURCE_SLUG_NONE_LABEL } from '../../lib/source-slug';
import type { landingRanking, trendSeries, productRanking, locationRanking, orderTimes } from '../../lib/insights';

type Landing = Awaited<ReturnType<typeof landingRanking>>['data'];
type Trend = Awaited<ReturnType<typeof trendSeries>>['data'];
type Products = Awaited<ReturnType<typeof productRanking>>['data'];
type Locations = Awaited<ReturnType<typeof locationRanking>>['data'];
type Times = Awaited<ReturnType<typeof orderTimes>>['data'];
type ReportData = Landing | Trend | Products | Locations | Times;
type Choice = { value: string; label: string };
const Chart = lazy(() => import('./InsightsChart').catch(() => ({
  default: function ChartUnavailable() {
    return <div role="alert" className="flex h-64 flex-col items-start justify-center gap-3 text-sm">
      <p>Grafik belum dapat dimuat. Data harian tetap tersedia di bawah.</p>
      <Button variant="outline" onClick={() => window.location.reload()}>Muat ulang grafik</Button>
    </div>;
  },
})));
const sectionClass = 'rounded-lg border border-border bg-card p-4 text-card-foreground';
const metricLabels = { orders: 'Pesanan', leads: 'Lead', revenue: 'Omset' };

function Loading() { return <div aria-busy="true" aria-label="Memuat laporan" className="flex flex-col gap-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-64 w-full" /></div>; }
function ReturnShare({ value }: { value: number }) { return <span>{percent(value)}{value > 20 && <span className="ml-1 text-destructive">· Perlu perhatian</span>}</span>; }
function Empty({ reset }: { reset: () => void }) { return <div className={sectionClass}><h3 className="text-base font-semibold">Belum ada data pada pilihan ini</h3><p className="my-3 text-sm text-muted-foreground">Coba periode atau filter lain. Data akan muncul setelah toko menerima lead atau pesanan.</p><Button variant="outline" onClick={reset}>Reset filter</Button></div>; }

export function InsightsReport({ report, initialQuery = '', sources = [], products = [], mayReadOrders = false, initialData }: {
  report: Report; initialQuery?: string; sources?: Choice[]; products?: Choice[]; mayReadOrders?: boolean; initialData?: ReportData;
}) {
  const [query, setQuery] = useState(() => insightsInitialQuery(initialQuery));
  const [date, setDate] = useState<AdminDateSelection>(() => insightsDateSelection(insightsInitialQuery(initialQuery)));
  const initial = new URLSearchParams(initialQuery);
  const [channel, setChannel] = useState(initial.get('channel') || '');
  const [source, setSource] = useState(initial.get('source') || '');
  const [product, setProduct] = useState(initial.get('product_id') || '');
  const [data, setData] = useState<ReportData | undefined>(initialData);
  const [busy, setBusy] = useState(!initialData);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(0);
  const [retry, setRetry] = useState(0);
  const [metric, setMetric] = useState<'orders' | 'leads' | 'revenue'>('revenue');

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(''); setStatus(0);
    fetch(`/api/admin/insights/${report}?${query}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!response.ok) { setStatus(response.status); throw new Error(body.error || 'Laporan tidak dapat dimuat.'); }
        if (!controller.signal.aborted) setData(body.data);
      }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Laporan tidak dapat dimuat.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [report, query, retry]);

  // Rewrite only this report family's links, including the existing sidebar.
  // Delegated, so the period reaches links rendered by the separately hydrated
  // AdminShell. Rewritten before any activation reads the href: pointerdown
  // precedes a click, middle-click and the context menu; focusin precedes Enter.
  useEffect(() => {
    const carry = (event: Event) => {
      const anchor = (event.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.origin !== window.location.origin) return;
      const next = withInsightsPeriod(anchor.pathname, window.location.pathname, query);
      if (next !== anchor.pathname) anchor.href = next;
    };
    const events = ['pointerdown', 'focusin', 'click'] as const;
    for (const type of events) document.addEventListener(type, carry, true);
    return () => { for (const type of events) document.removeEventListener(type, carry, true); };
  }, [query]);

  function changeQuery(params: URLSearchParams) {
    const next = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}?${next}`);
    setQuery(next);
  }
  function apply() {
    const params = new URLSearchParams();
    params.set('date_filter', date.filter);
    if (date.filter === 'custom') { params.set('date_start', date.start); params.set('date_end', date.end); }
    if (report !== 'landing' && channel) params.set('channel', channel);
    if (source) params.set('source', source); else if (product) params.set('product_id', product);
    changeQuery(params);
  }
  function reset() {
    setDate(insightsDateSelection('date_filter=this_month')); setSource(''); setProduct(''); setChannel('');
    changeQuery(new URLSearchParams('date_filter=this_month'));
  }
  function province(value: string) {
    const params = new URLSearchParams(query);
    if (value) params.set('province', value); else params.delete('province');
    changeQuery(params);
  }
  const appliedDate = insightsDateSelection(query);
  const sourceOptions = [{ value: '', label: 'Semua halaman' }, { value: SOURCE_SLUG_NONE_FILTER, label: SOURCE_SLUG_NONE_LABEL }, ...sources];
  if (source && !sourceOptions.some((item) => item.value === source)) sourceOptions.push({ value: source, label: source });
  const productOptions = [{ value: '', label: 'Semua produk' }, ...products];
  if (product && !productOptions.some((item) => item.value === product)) productOptions.push({ value: product, label: `Produk #${product}` });

  return <div className="flex min-w-0 flex-col gap-5" data-insights-report={report}>
    <div className={sectionClass}>
      <FilterBar>
        <FilterField label="Periode · WIB" size="lg"><AdminDateRangeFilter value={date} onChange={setDate} maxCustomRangeDays={INSIGHTS_MAX_RANGE_DAYS} hiddenPresets={['all', '180d']} /></FilterField>
        {report !== 'landing' && <FilterField label="Kanal" htmlFor="insights-channel"><FilterSelect id="insights-channel" icon={Filter} value={channel} options={INSIGHTS_CHANNEL_OPTIONS} onValueChange={setChannel} /></FilterField>}
        {report === 'trend' && <>
          <FilterField label="Halaman" htmlFor="insights-source"><FilterSelect id="insights-source" icon={ChartNoAxesCombined} value={source} options={sourceOptions} onValueChange={(value) => { setSource(value); setProduct(''); }} /></FilterField>
          <FilterField label="Produk" htmlFor="insights-product"><FilterSelect id="insights-product" icon={Package} value={product} options={productOptions} onValueChange={(value) => { setProduct(value); setSource(''); }} /></FilterField>
          <FilterField label="Slug historis (opsional)" htmlFor="insights-slug" size="lg"><SearchInput id="insights-slug" value={source === SOURCE_SLUG_NONE_FILTER ? '' : source} onValueChange={(value) => { setSource(value.trim()); setProduct(''); }} placeholder="Contoh: promo-kopi" /></FilterField>
        </>}
        <Button onClick={apply} disabled={busy}>Terapkan</Button><Button variant="outline" onClick={reset}>Reset</Button>
      </FilterBar>
    </div>
    {report !== 'trend' && (source || product) && <p className="flex flex-wrap items-center gap-2 text-sm">
      Filter aktif: {source ? `Halaman ${sourceOptions.find((item) => item.value === source)?.label ?? source}` : `Produk ${productOptions.find((item) => item.value === product)?.label ?? product}`}
      <Button variant="outline" onClick={() => { setSource(''); setProduct(''); const params = new URLSearchParams(query); params.delete('source'); params.delete('product_id'); changeQuery(params); }}>Hapus filter</Button>
    </p>}
    <p className="text-sm" aria-live="polite">Periode diterapkan: {appliedDate.start || '—'} – {appliedDate.end || '—'}</p>
    <p className="text-xs text-muted-foreground">Asia/Jakarta (WIB) · Maksimal {INSIGHTS_MAX_RANGE_DAYS} hari · Sumber pesanan lama mungkin tidak tercatat. Tidak ada data kunjungan; closing rate bukan konversi pengunjung.</p>
    {busy ? <Loading /> : error ? <div role="alert" className={sectionClass}>
      <h3 className="text-base font-semibold">{status === 403 ? 'Akses laporan ditolak' : status === 401 ? 'Sesi berakhir' : 'Laporan belum dapat dimuat'}</h3>
      <p className="my-3 text-sm">{error}</p>
      {status === 401 ? <a href="/hello" className="underline">Masuk kembali</a> : <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Coba lagi</Button>}
    </div> : data && <>
      {report === 'landing' && ((data as Landing).rows.length ? <LandingView data={data as Landing} query={query} mayReadOrders={mayReadOrders} /> : <Empty reset={reset} />)}
      {report === 'products' && ((data as Products).rows.length ? <ProductsView data={data as Products} /> : <Empty reset={reset} />)}
      {report === 'trend' && <TrendView data={data as Trend} metric={metric} setMetric={setMetric} />}
      {report === 'locations' && ((data as Locations).provinces.length ? <LocationsView data={data as Locations} onProvince={province} /> : <Empty reset={reset} />)}
      {report === 'times' && ((data as Times).total ? <TimesView data={data as Times} /> : <Empty reset={reset} />)}
    </>}
  </div>;
}

const landingColumns = [
  ['label', 'Halaman'], ['leads', 'Lead'], ['orders', 'Pesanan'], ['revenue', 'Omset'],
  ['delivered_revenue', 'Omset terkirim'], ['average_order_value', 'Rata-rata order'],
  ['closing_rate', 'Closing'], ['delivered_share', 'Terkirim'], ['return_share', 'RTS'],
] as const;
function landingValue(row: Landing['rows'][number], key: typeof landingColumns[number][0]) {
  if (['revenue', 'delivered_revenue', 'average_order_value'].includes(key)) return money(Number(row[key]));
  if (['closing_rate', 'delivered_share', 'return_share'].includes(key)) return percent(Number(row[key]));
  return typeof row[key] === 'number' ? number(Number(row[key])) : String(row[key]);
}
function SourceDetails({ row }: { row: Landing['rows'][number] }) {
  return <details className="text-xs"><summary className="cursor-pointer py-2">Kanal & tindak lanjut</summary>
    <dl className="grid grid-cols-2 gap-2">{INSIGHTS_CHANNEL_OPTIONS.filter((item) => item.value).map((item) => <div key={item.value}><dt>{item.label}</dt><dd>{row.channels[item.value as keyof typeof row.channels]}</dd></div>)}</dl>
    <p className="mt-2">Lead belum dihubungi {row.follow_up.new} · Sudah dihubungi {row.follow_up.contacted} · Potensial {row.follow_up.qualified} · Konversi {row.follow_up.converted} · Tidak tertarik {row.follow_up.not_interested}</p>
  </details>;
}
function LandingView({ data, query, mayReadOrders }: { data: Landing; query: string; mayReadOrders: boolean }) {
  const [sort, setSort] = useState<typeof landingColumns[number][0]>('delivered_revenue');
  const [descending, setDescending] = useState(true);
  const rows = sortInsightRows(data.rows, sort, descending);
  return <section className="flex min-w-0 flex-col gap-3">
    <FilterBar><FilterField label="Urutkan" htmlFor="landing-sort" size="lg"><FilterSelect id="landing-sort" icon={ArrowDownUp} value={sort} options={landingColumns.map(([value, label]) => ({ value, label }))} onValueChange={setSort} /></FilterField><Button variant="outline" onClick={() => setDescending(!descending)}>{descending ? 'Terbesar dulu' : 'Terkecil dulu'}</Button></FilterBar>
    <p className="text-xs text-muted-foreground">Omset = nilai pesanan aktif, belum tentu dibayar. RTS = retur / (terkirim + retur).</p>
    <div className="hidden overflow-x-auto rounded-lg border border-border md:block [&>div]:overflow-visible" tabIndex={0} role="region" aria-label="Peringkat landing page, geser untuk melihat semua kolom"><Table><TableHeader><TableRow>{landingColumns.map(([key, label]) => <TableHead key={key} aria-sort={sort === key ? descending ? 'descending' : 'ascending' : 'none'}><Button variant="ghost" onClick={() => { setSort(key); setDescending(sort === key ? !descending : true); }}>{label}</Button></TableHead>)}<TableHead>Kanal</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((row) => <TableRow key={row.slug ?? SOURCE_SLUG_NONE_FILTER}>{landingColumns.map(([key]) => <TableCell key={key} className={key === 'label' ? 'min-w-40' : 'text-right tabular-nums'}>{key === 'label' && mayReadOrders ? <a className="underline underline-offset-4" href={insightsOrderLink(row.slug, query)}>{row.label}</a> : <>{landingValue(row, key)}{key === 'closing_rate' && <progress className="mt-1 block h-2 w-full accent-primary" max={100} value={row.closing_rate} aria-label={`Closing ${row.label}`} />}</>}</TableCell>)}<TableCell className="min-w-48"><SourceDetails row={row} /></TableCell></TableRow>)}</TableBody>
    </Table></div>
    <div className="flex flex-col gap-3 md:hidden">{rows.map((row) => <article key={row.slug ?? SOURCE_SLUG_NONE_FILTER} className={sectionClass}><h3 className="break-words text-base font-semibold">{mayReadOrders ? <a className="underline" href={insightsOrderLink(row.slug, query)}>{row.label}</a> : row.label}</h3><dl className="mt-3 grid grid-cols-2 gap-3">{landingColumns.slice(1).map(([key, label]) => <div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm tabular-nums">{landingValue(row, key)}{key === 'closing_rate' && <progress className="mt-1 block h-2 w-full accent-primary" max={100} value={row.closing_rate} aria-label={`Closing ${row.label}`} />}</dd></div>)}</dl><SourceDetails row={row} /></article>)}</div>
  </section>;
}
function ProductVariants({ row }: { row: Products['rows'][number] }) {
  return <details className="min-w-0"><summary className="cursor-pointer py-2 text-sm">Rincian {row.variants.length} varian</summary><div className="overflow-x-auto [&>div]:overflow-visible" tabIndex={0} role="region" aria-label={`Varian ${row.label}`}><Table><TableHeader><TableRow><TableHead>Varian</TableHead><TableHead className="text-right">Unit</TableHead><TableHead className="text-right">Omset</TableHead></TableRow></TableHeader><TableBody>{row.variants.map((variant, index) => <TableRow key={variant.variant_id ?? index}><TableCell>{variant.label}</TableCell><TableCell className="text-right tabular-nums">{number(variant.units)}</TableCell><TableCell className="text-right tabular-nums">{money(variant.revenue)}</TableCell></TableRow>)}</TableBody></Table></div></details>;
}
function ProductsView({ data }: { data: Products }) {
  return <section className="flex min-w-0 flex-col gap-3"><p className="text-sm">{number(data.totals.units)} unit aktif · {money(data.totals.revenue)} omset produk (tanpa ongkir)</p>
    <div className="hidden overflow-x-auto rounded-lg border border-border md:block [&>div]:overflow-visible" tabIndex={0} role="region" aria-label="Peringkat produk"><Table><TableHeader><TableRow><TableHead>Produk</TableHead><TableHead className="text-right">Unit aktif</TableHead><TableHead className="text-right">Omset produk</TableHead><TableHead className="text-right">RTS · unit terkirim + retur</TableHead><TableHead>Varian</TableHead></TableRow></TableHeader><TableBody>{data.rows.map((row) => <TableRow key={row.product_id ?? 'deleted'}><TableCell className="font-medium">{row.label}</TableCell><TableCell className="text-right tabular-nums">{number(row.units)}</TableCell><TableCell className="text-right tabular-nums">{money(row.revenue)}</TableCell><TableCell className="text-right tabular-nums"><ReturnShare value={row.return_share} /></TableCell><TableCell><ProductVariants row={row} /></TableCell></TableRow>)}</TableBody></Table></div>
    <div className="flex flex-col gap-3 md:hidden">{data.rows.map((row) => <article key={row.product_id ?? 'deleted'} className={sectionClass}>
    <h3 className="text-base font-semibold">{row.label}</h3><dl className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Unit aktif</dt><dd>{number(row.units)}</dd></div><div><dt className="text-xs text-muted-foreground">Omset produk</dt><dd className="tabular-nums">{money(row.revenue)}</dd></div><div><dt className="text-xs text-muted-foreground">RTS · unit terkirim + retur</dt><dd><ReturnShare value={row.return_share} /></dd></div></dl>
    <ProductVariants row={row} />
  </article>)}</div></section>;
}
function TrendView({ data, metric, setMetric }: { data: Trend; metric: 'orders' | 'leads' | 'revenue'; setMetric: (value: 'orders' | 'leads' | 'revenue') => void }) {
  const format = metric === 'revenue' ? money : number;
  return <section className={sectionClass}>
    <FilterBar><FilterField label="Metrik" htmlFor="trend-metric"><FilterSelect id="trend-metric" icon={ChartNoAxesCombined} value={metric} options={Object.entries(metricLabels).map(([value, label]) => ({ value: value as typeof metric, label }))} onValueChange={setMetric} /></FilterField></FilterBar>
    <div className="my-4 grid grid-cols-2 gap-4"><div><p className="text-xs text-muted-foreground">Periode terpilih</p><p className="break-words text-2xl font-semibold tabular-nums">{format(data.total[metric])}</p></div><div><p className="text-xs text-muted-foreground">Sebelumnya · {data.previous.start} – {data.previous.end}</p><p className="break-words text-2xl font-semibold tabular-nums">{format(data.previous[metric])}</p></div></div>
    {data.total.orders + data.total.leads === 0 && <p className="mb-3 text-sm">Tidak ada pesanan atau lead pada periode ini.</p>}
    <figure><Suspense fallback={<Skeleton className="h-64 w-full" />}><Chart series={data.series} metric={metric} /></Suspense><figcaption className="mt-2 text-xs text-muted-foreground">{metricLabels[metric]} per hari · WIB. Hari tanpa data ditampilkan nol. Omset bukan konfirmasi pembayaran.</figcaption></figure>
    <details className="mt-4"><summary className="cursor-pointer py-2 text-sm">Lihat data harian</summary><Table><TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Pesanan</TableHead><TableHead>Lead</TableHead><TableHead>Omset</TableHead></TableRow></TableHeader><TableBody>{data.series.map((day) => <TableRow key={day.date}><TableCell>{day.date}</TableCell><TableCell>{number(day.orders)}</TableCell><TableCell>{number(day.leads)}</TableCell><TableCell>{money(day.revenue)}</TableCell></TableRow>)}</TableBody></Table></details>
  </section>;
}
function LocationsView({ data, onProvince }: { data: Locations; onProvince: (value: string) => void }) {
  const places = data.province ? data.province.cities : data.provinces;
  return <section className="flex flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold">{data.province ? data.province.label : 'Provinsi'}</h3>{data.province && <Button variant="outline" onClick={() => onProvince('')}>Semua provinsi</Button>}</div>
    <p className="text-xs text-muted-foreground">RTS di atas 20% ditandai untuk ditinjau · retur / (terkirim + retur). Lainnya menjumlahkan wilayah di luar peringkat teratas.</p>
    {places.length === 0 && <p className="text-sm">Tidak ada kota pada provinsi ini untuk filter terpilih.</p>}
    <div className="divide-y divide-border rounded-lg border border-border bg-card">{places.map((place) => <div key={place.key} className="grid grid-cols-2 items-center gap-3 p-4 sm:grid-cols-4"><div className="min-w-0 break-words">{!data.province && place.key !== 'other' ? <Button variant="link" onClick={() => onProvince(place.key)}>{place.label}</Button> : place.label}</div><div><p className="text-xs text-muted-foreground">Pesanan</p>{number(place.orders)}</div><div><p className="text-xs text-muted-foreground">Omset</p><span className="text-sm tabular-nums">{money(place.revenue)}</span></div><div><p className="text-xs text-muted-foreground">RTS</p><ReturnShare value={place.return_share} /></div></div>)}</div>
    {data.unmatched_provinces.length > 0 && <p className="text-xs text-muted-foreground">Nama belum cocok dengan katalog: {data.unmatched_provinces.join(', ')}. Tidak digabung otomatis.</p>}
  </section>;
}
function TimesView({ data }: { data: Times }) {
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  return <figure className={sectionClass}><figcaption className="mb-3 text-sm">{number(data.total)} pesanan · WIB. Angka = jumlah pesanan, warna makin pekat = lebih banyak (0–{number(data.max)}).</figcaption>
    <div className="overflow-x-auto [&>div]:overflow-visible" tabIndex={0} role="region" aria-label="Tabel waktu beli, geser untuk melihat semua jam"><Table><TableHeader><TableRow><TableHead>Jam</TableHead>{days.map((day) => <TableHead key={day}>{day}</TableHead>)}</TableRow></TableHeader><TableBody>{Array.from({ length: 24 }, (_, hour) => <TableRow key={hour}><TableCell className="font-medium">{String(hour).padStart(2, '0')}:00</TableCell>{days.map((day, weekday) => <TableCell key={day} className="text-center tabular-nums" style={{ backgroundColor: `color-mix(in srgb, var(--chart-1) ${data.cells[weekday][hour] ? 10 + Math.round(data.cells[weekday][hour] / Math.max(1, data.max) * 22) : 0}%, transparent)` }}>{data.cells[weekday][hour]}</TableCell>)}</TableRow>)}</TableBody></Table></div>
  </figure>;
}
