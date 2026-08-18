import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  UserRoundPlus,
} from "lucide-react";
import { buildWaUrl } from "@/lib/crm-template";
import { formatIdr } from "@/lib/format-idr";
import { groupLocationResults } from "@/lib/location-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type FollowUpStatus = "new" | "contacted" | "qualified" | "not_interested";

type Lead = {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  variantName: string;
  variantId: number | null;
  quantity: number;
  followUpStatus: FollowUpStatus;
  followUpNote: string;
  followedUpAt: string | null;
  followedUpBy: string;
  createdAt: string;
};

type Product = {
  id: number;
  title: string;
  is_active: boolean;
  variants: Array<{
    id: number;
    title: string;
    sku: string;
    price: number;
    stock: number | null;
  }>;
};

type LocationOption = {
  id: string;
  label: string;
  district: string;
  city: string;
  province: string;
  postal_code?: string;
};
type ShippingRate = {
  courier_service_id: number;
  courier_code: string;
  courier_service: string;
  shipping_cost: number;
  estimated_days?: string;
};

const followUpLabels: Record<FollowUpStatus, string> = {
  new: "Belum dihubungi",
  contacted: "Sudah dihubungi",
  qualified: "Berminat",
  not_interested: "Tidak berminat",
};

const followUpStyles: Record<FollowUpStatus, string> = {
  new: "border-amber-200 bg-amber-50 text-amber-800",
  contacted: "border-blue-200 bg-blue-50 text-blue-800",
  qualified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  not_interested: "border-slate-200 bg-slate-100 text-slate-700",
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date)} WIB`;
};

function normalizeLead(row: Record<string, unknown>): Lead {
  const status = String(row.follow_up_status ?? row.lead_follow_up_status ?? "new");
  return {
    id: Number(row.id),
    orderNumber: String(row.order_number ?? row.orderNumber ?? ""),
    customerName: String(row.customer_name ?? row.customerName ?? ""),
    customerPhone: String(row.customer_phone ?? row.customerPhone ?? ""),
    productName: String(row.product_title ?? row.product_name ?? row.productName ?? ""),
    variantName: String(row.variant_title ?? row.variant_name ?? row.variantName ?? ""),
    variantId: Number(row.variant_id ?? row.variantId) || null,
    quantity: Math.max(1, Number(row.quantity) || 1),
    followUpStatus: Object.hasOwn(followUpLabels, status)
      ? (status as FollowUpStatus)
      : "new",
    followUpNote: String(row.follow_up_note ?? row.lead_follow_up_note ?? ""),
    followedUpAt:
      String(row.followed_up_at ?? row.lead_followed_up_at ?? "") || null,
    followedUpBy: String(row.followed_up_by ?? row.lead_followed_up_by ?? ""),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
  };
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || "Permintaan gagal diproses.");
  }
  return payload;
}

const leadRequest = {
  async list(input: {
    search: string;
    status: FollowUpStatus | "all";
    page: number;
    signal?: AbortSignal;
  }) {
    const query = new URLSearchParams({
      page: String(input.page),
      limit: "25",
      follow_up_status: input.status,
    });
    if (input.search.trim()) query.set("search", input.search.trim());
    const payload = await readJson(
      await fetch(`/api/admin/abandoned-orders?${query}`, {
        headers: { Accept: "application/json" },
        signal: input.signal,
      }),
    );
    const rows = Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.data?.items)
        ? payload.data.items
        : Array.isArray(payload.items)
          ? payload.items
          : [];
    const rawOptions = Array.isArray(payload.product_options)
      ? payload.product_options
      : Array.isArray(payload.data?.product_options)
        ? payload.data.product_options
        : [];
    const productsById = new Map<number, Product>();
    for (const row of rawOptions as Array<Record<string, unknown>>) {
      const productId = Number(row.product_id);
      const variantId = Number(row.variant_id);
      if (!productId || !variantId) continue;
      const product = productsById.get(productId) ?? {
        id: productId,
        title: String(row.product_title || "Produk"),
        is_active: true,
        variants: [],
      };
      product.variants.push({
        id: variantId,
        title: String(row.variant_title || "Varian"),
        sku: String(row.sku || ""),
        price: Number(row.price) || 0,
        stock: row.stock == null ? null : Number(row.stock),
      });
      productsById.set(productId, product);
    }
    const products = [...productsById.values()];
    return {
      leads: rows.map((row: Record<string, unknown>) => normalizeLead(row)),
      products,
      pagination: {
        page: Number(payload.pagination?.page) || input.page,
        totalItems: Number(payload.pagination?.total_items) || 0,
        totalPages: Number(payload.pagination?.total_pages) || 0,
      },
    };
  },
  async followUp(lead: Lead, status: FollowUpStatus, note: string) {
    return readJson(
      await fetch("/api/admin/abandoned-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: lead.id,
          follow_up_status: status,
          follow_up_note: note,
        }),
      }),
    );
  },
  async convert(payload: Record<string, unknown>) {
    return readJson(
      await fetch("/api/admin/abandoned-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert", ...payload }),
      }),
    );
  },
};

function ConversionDialog({
  lead,
  products,
  onClose,
}: {
  lead: Lead | null;
  products: Product[];
  onClose: (convertedOrderNumber?: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ id: string; message: string } | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    address: "",
    district: "",
    city: "",
    province: "",
    postalCode: "",
    destinationAreaId: "",
    variantId: "",
    quantity: "1",
    courierServiceId: "",
  });

  useEffect(() => {
    if (!lead) return;
    setError("");
    setFieldError(null);
    setLocationQuery("");
    setLocations([]);
    setRates([]);
    setForm({
      customerName: lead.customerName,
      customerPhone: lead.customerPhone,
      address: "",
      district: "",
      city: "",
      province: "",
      postalCode: "",
      destinationAreaId: "",
      variantId: lead.variantId ? String(lead.variantId) : "",
      quantity: String(lead.quantity || 1),
      courierServiceId: "",
    });
  }, [lead]);

  useEffect(() => {
    if (!lead || locationQuery.trim().length < 2) {
      setLocations([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLocationLoading(true);
      try {
        const payload = await readJson(
          await fetch(`/api/locations?search=${encodeURIComponent(locationQuery.trim())}`, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }),
        );
        const rows = (payload.items || payload.locations || []) as LocationOption[];
        setLocations(groupLocationResults(rows).map((group) => group.items[0]));
      } catch (reason) {
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Lokasi gagal dicari.");
        }
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lead, locationQuery]);

  useEffect(() => {
    if (!lead || !form.destinationAreaId || !form.variantId) {
      setRates([]);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      destination_id: form.destinationAreaId,
      payment_method: "cod",
      variant_id: form.variantId,
      quantity: form.quantity || "1",
    });
    setRatesLoading(true);
    void fetch(`/api/shipping-rates?${params}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
      .then(readJson)
      .then((payload) => {
        setRates((payload.items || payload.rates || []) as ShippingRate[]);
        setForm((current) => ({ ...current, courierServiceId: "" }));
      })
      .catch((reason) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          setRates([]);
          setError(reason instanceof Error ? reason.message : "Ongkir gagal dimuat.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRatesLoading(false);
      });
    return () => controller.abort();
  }, [form.destinationAreaId, form.quantity, form.variantId, lead]);

  const selectedRate = rates.find(
    (rate) => String(rate.courier_service_id) === form.courierServiceId,
  );
  const selectedVariant = products
    .flatMap((product) => product.variants.map((variant) => ({ product, variant })))
    .find(({ variant }) => String(variant.id) === form.variantId);
  const submit = async (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    if (!lead) return;
    const firstInvalid = !selectedVariant
      ? ["lead-variant", "Pilih produk dan varian aktif."]
      : !Number.isInteger(Number(form.quantity)) || Number(form.quantity) < 1 || Number(form.quantity) > 100
        ? ["lead-quantity", "Jumlah produk harus 1 sampai 100."]
      : form.customerName.trim().length < 2
        ? ["lead-customer-name", "Nama pembeli minimal 2 karakter."]
        : !/^(08|628)\d{8,11}$/.test(form.customerPhone.replace(/\D/g, ""))
          ? ["lead-customer-phone", "Nomor WhatsApp belum valid."]
          : form.address.trim().length < 10
            ? ["lead-address", "Alamat lengkap minimal 10 karakter."]
            : !form.destinationAreaId
              ? ["lead-location", "Pilih kecamatan dari hasil pencarian."]
              : !selectedRate
                ? ["lead-location", "Pilih kurir dan ongkir."]
                : null;
    if (firstInvalid) {
      setError("");
      setFieldError({ id: firstInvalid[0], message: firstInvalid[1] });
      window.requestAnimationFrame(() => document.getElementById(firstInvalid[0])?.focus());
      return;
    }
    if (!selectedRate) return;
    setSaving(true);
    setError("");
    setFieldError(null);
    try {
      const response = await leadRequest.convert({
        order_id: lead.id,
        customer_name: form.customerName.trim(),
        customer_phone: form.customerPhone.replace(/\D/g, ""),
        address: form.address.trim(),
        district: form.district,
        city: form.city,
        province: form.province,
        postal_code: form.postalCode,
        destination_area_id: form.destinationAreaId,
        variant_id: Number(form.variantId),
        quantity: Number(form.quantity),
        courier_code: selectedRate.courier_code,
        courier_service_id: selectedRate.courier_service_id,
      });
      onClose(String(response.data?.order_number || response.order_number || ""));
    } catch (reason) {
      setFieldError(null);
      setError(reason instanceof Error ? reason.message : "Lead gagal diubah menjadi order.");
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(lead)} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>Edit & jadikan order</DialogTitle>
          <DialogDescription>
            Lengkapi pesanan {lead?.orderNumber}. Konversi membuat order COD, tetapi belum mengirimkannya ke Mengantar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-5 px-5 pb-5">
          {error && (
            <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium" htmlFor="lead-customer-name">
              <span>Nama pembeli</span>
              <Input id="lead-customer-name" autoComplete="name" aria-invalid={fieldError?.id === "lead-customer-name"} aria-describedby={fieldError?.id === "lead-customer-name" ? "lead-customer-name-error" : undefined} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
              {fieldError?.id === "lead-customer-name" && <span id="lead-customer-name-error" className="block text-xs text-rose-700">{fieldError.message}</span>}
            </label>
            <label className="space-y-1.5 text-sm font-medium" htmlFor="lead-customer-phone">
              <span>Nomor WhatsApp</span>
              <Input id="lead-customer-phone" autoComplete="tel" inputMode="tel" aria-invalid={fieldError?.id === "lead-customer-phone"} aria-describedby={fieldError?.id === "lead-customer-phone" ? "lead-customer-phone-error" : undefined} value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} required />
              {fieldError?.id === "lead-customer-phone" && <span id="lead-customer-phone-error" className="block text-xs text-rose-700">{fieldError.message}</span>}
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1.5">
              <label htmlFor="lead-variant" className="text-sm font-medium">Produk & varian</label>
              <Select value={form.variantId} onValueChange={(value) => setForm({ ...form, variantId: value ?? "", courierServiceId: "" })}>
                <SelectTrigger id="lead-variant" aria-invalid={fieldError?.id === "lead-variant"} aria-describedby={fieldError?.id === "lead-variant" ? "lead-variant-error" : undefined}><SelectValue placeholder="Pilih produk" /></SelectTrigger>
                <SelectContent>
                  {products.filter((product) => product.is_active).flatMap((product) => product.variants.map((variant) => (
                    <SelectItem key={variant.id} value={String(variant.id)} disabled={variant.stock === 0}>
                      {product.title} · {variant.title} ({formatIdr(variant.price)})
                    </SelectItem>
                  )))}
                </SelectContent>
              </Select>
              {fieldError?.id === "lead-variant" && <p id="lead-variant-error" className="text-xs text-rose-700">{fieldError.message}</p>}
            </div>
            <label className="space-y-1.5 text-sm font-medium" htmlFor="lead-quantity">
              <span>Jumlah</span>
              <Input id="lead-quantity" type="number" min="1" max="100" aria-invalid={fieldError?.id === "lead-quantity"} aria-describedby={fieldError?.id === "lead-quantity" ? "lead-quantity-error" : undefined} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value, courierServiceId: "" })} required />
              {fieldError?.id === "lead-quantity" && <span id="lead-quantity-error" className="block text-xs text-rose-700">{fieldError.message}</span>}
            </label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="lead-address">
            <span>Alamat lengkap</span>
            <Textarea id="lead-address" autoComplete="street-address" aria-invalid={fieldError?.id === "lead-address"} aria-describedby={fieldError?.id === "lead-address" ? "lead-address-error" : undefined} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Jalan, nomor rumah, RT/RW, dan patokan" required />
            {fieldError?.id === "lead-address" && <span id="lead-address-error" className="block text-xs text-rose-700">{fieldError.message}</span>}
          </label>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="lead-location">Kecamatan tujuan</label>
            <div className="relative">
              <Input id="lead-location" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Ketik minimal 2 huruf" aria-invalid={fieldError?.id === "lead-location"} aria-describedby={fieldError?.id === "lead-location" ? "lead-location-error" : "lead-location-help"} />
              {locationLoading && <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-slate-500" aria-hidden="true" />}
            </div>
            <p id="lead-location-help" className="text-xs text-slate-500">
              {form.destinationAreaId ? `${form.district}, ${form.city}, ${form.province}` : "Pilih hasil pencarian agar ongkir dapat dihitung."}
            </p>
            {fieldError?.id === "lead-location" && <p id="lead-location-error" className="text-xs text-rose-700">{fieldError.message}</p>}
            {locations.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border bg-white p-1" role="listbox" aria-label="Hasil pencarian kecamatan">
                {locations.map((location) => (
                  <button key={location.id} type="button" role="option" aria-selected={form.destinationAreaId === location.id} className="block min-h-11 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" onClick={() => {
                    setForm({ ...form, district: location.district, city: location.city, province: location.province, postalCode: location.postal_code || "", destinationAreaId: String(location.id), courierServiceId: "" });
                    setLocationQuery(location.label);
                    setLocations([]);
                  }}>
                    {location.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Kurir & ongkir</p>
            {ratesLoading ? <Skeleton className="h-12 w-full" /> : rates.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Pilihan kurir dan ongkir">
                {rates.map((rate) => {
                  const selected = form.courierServiceId === String(rate.courier_service_id);
                  return <button key={rate.courier_service_id} type="button" role="radio" aria-checked={selected} className={`min-h-12 rounded-lg border p-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${selected ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`} onClick={() => setForm({ ...form, courierServiceId: String(rate.courier_service_id) })}>
                    <span className="block font-semibold">{rate.courier_code} · {rate.courier_service}</span>
                    <span className="text-xs text-slate-600">{formatIdr(rate.shipping_cost)}{rate.estimated_days ? ` · ${rate.estimated_days}` : ""}</span>
                  </button>;
                })}
              </div>
            ) : <p className="rounded-lg border border-dashed p-3 text-sm text-slate-500">Pilih produk dan kecamatan untuk melihat kurir.</p>}
          </div>
          <DialogFooter className="mx-0 mb-0 px-0 pb-0">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onClose()} disabled={saving}>Batal</Button>
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
              Jadikan order
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AbandonedOrders() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(() =>
    typeof window === "undefined"
      ? ""
      : new URLSearchParams(window.location.search).get("search") || "",
  );
  const [status, setStatus] = useState<FollowUpStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, totalItems: 0, totalPages: 0 });
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const hasLoadedRef = useRef(false);
  const load = async (signal?: AbortSignal) => {
    setRefreshing(true);
    setError("");
    try {
      const result = await leadRequest.list({ search, status, page, signal });
      setLeads(result.leads);
      setProducts(result.products);
      setPagination(result.pagination);
      hasLoadedRef.current = true;
    } catch (reason) {
      if (!(reason instanceof Error && reason.name === "AbortError")) {
        const message = reason instanceof Error ? reason.message : "Pesanan tertinggal gagal dimuat.";
        if (hasLoadedRef.current) setNotice(message);
        else setError(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, search, status]);

  const followUp = async (lead: Lead) => {
    setUpdatingId(lead.id);
    setNotice("");
    try {
      await leadRequest.followUp(lead, "contacted", lead.followUpNote);
      const followedUpAt = new Date().toISOString();
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, followUpStatus: "contacted", followedUpAt } : item));
      setNotice(`Follow-up ${lead.orderNumber} dicatat. Status ini tidak menyatakan pesan sudah terkirim.`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Follow-up gagal dicatat.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) return <div className="space-y-3" aria-label="Memuat pesanan tertinggal" aria-busy="true">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 w-full" />)}</div>;

  if (error) return <section role="alert" className="rounded-xl border border-rose-200 bg-white p-6 text-center"><AlertCircle className="mx-auto size-8 text-rose-600" /><h2 className="mt-3 font-semibold">Pesanan tertinggal gagal dimuat</h2><p className="mt-1 text-sm text-slate-600">{error}</p><Button className="mt-4 min-h-11" variant="outline" onClick={() => void load()}><RefreshCw />Coba lagi</Button></section>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1.5 text-sm font-medium" htmlFor="abandoned-search"><span>Cari lead</span><span className="relative block"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" aria-hidden="true" /><Input id="abandoned-search" className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Produk, nama, WhatsApp, atau ABN" /></span></label>
        <div className="w-full space-y-1.5 sm:w-48"><label htmlFor="follow-up-filter" className="text-sm font-medium">Status follow-up</label><Select value={status} onValueChange={(value) => { setStatus((value || "all") as FollowUpStatus | "all"); setPage(1); }}><SelectTrigger id="follow-up-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua status</SelectItem>{Object.entries(followUpLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <p className="text-xs font-medium text-slate-500" role="status" aria-live="polite">
        {refreshing ? "Memperbarui pesanan tertinggal…" : `${pagination.totalItems} pesanan tertinggal`}
      </p>
      {notice && <p role="status" aria-live="polite" className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700">{notice}</p>}
      {leads.length === 0 ? <section className="rounded-xl border border-dashed bg-white p-10 text-center"><PackageSearch className="mx-auto size-9 text-slate-400" /><h2 className="mt-3 font-semibold">{search.trim() || status !== "all" ? "Tidak ada hasil yang cocok" : "Belum ada pesanan tertinggal"}</h2><p className="mt-1 text-sm text-slate-500">{search.trim() || status !== "all" ? "Ubah pencarian atau filter follow-up." : "Lead akan muncul ketika pembeli sudah mengisi nama dan WhatsApp tetapi belum menyelesaikan order."}</p></section> : (
        <div className="grid grid-cols-1 gap-3">
          {leads.map((lead) => {
            const phone = lead.customerPhone.replace(/\D/g, "").replace(/^0/, "62");
            const message = `Halo Kak ${lead.customerName || "Pelanggan"}, kami ingin membantu melanjutkan pesanan ${lead.productName || "produk pilihan Kakak"}. Apakah ada yang bisa kami bantu?`;
            return <article key={lead.id} className="grid grid-cols-1 gap-4 rounded-xl border bg-white p-4 shadow-xs md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(12rem,.8fr)_auto] md:items-center">
              <div className="min-w-0"><p className="truncate font-semibold text-slate-950">{lead.productName || "Produk belum dipilih"}</p><p className="mt-1 truncate text-sm text-slate-500">{lead.variantName || "Varian belum dipilih"} · {lead.orderNumber}</p>{!lead.variantId && <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700"><AlertCircle className="size-3.5" />Pilih produk sebelum konversi</p>}</div>
              <div className="min-w-0"><p className="truncate font-medium text-slate-900">{lead.customerName}</p><p className="mt-1 font-mono text-sm text-slate-600">{lead.customerPhone}</p><p className="mt-1 text-xs text-slate-400">Masuk {formatDate(lead.createdAt)}</p></div>
              <div><Badge variant="outline" className={followUpStyles[lead.followUpStatus]}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{followUpLabels[lead.followUpStatus]}</Badge><p className="mt-2 text-xs text-slate-500">{lead.followedUpAt ? `Dicatat ${formatDate(lead.followedUpAt)}${lead.followedUpBy ? ` oleh ${lead.followedUpBy}` : ""}` : "Belum ada follow-up tercatat"}</p></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:w-48 md:grid-cols-1">
                <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={updatingId === lead.id} onClick={() => {
                  window.open(buildWaUrl(phone, message), "_blank", "noopener,noreferrer");
                  void followUp(lead);
                }}><ExternalLink />{updatingId === lead.id ? "Mencatat…" : "Follow up WA"}</Button>
                <Button size="sm" className="min-h-11" onClick={() => setSelectedLead(lead)}><UserRoundPlus />Edit & jadikan order</Button>
              </div>
            </article>;
          })}
        </div>
      )}
      {pagination.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3" aria-label="Halaman pesanan tertinggal">
          <Button type="button" variant="outline" className="min-h-11" disabled={refreshing || pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ChevronLeft /> Sebelumnya
          </Button>
          <span className="text-sm font-medium text-slate-600">Halaman {pagination.page} dari {pagination.totalPages}</span>
          <Button type="button" variant="outline" className="min-h-11" disabled={refreshing || pagination.page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>
            Berikutnya <ChevronRight />
          </Button>
        </nav>
      )}
      <ConversionDialog lead={selectedLead} products={products} onClose={(orderNumber) => {
        setSelectedLead(null);
        if (orderNumber) window.location.assign(`/admin/orders/${encodeURIComponent(orderNumber)}`);
      }} />
    </div>
  );
}
