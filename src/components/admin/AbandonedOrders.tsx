import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  AlertCircle,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  CircleOff,
  ExternalLink,
  Loader2,
  MessageCircle,
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
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

const followUpVariants: Record<
  FollowUpStatus,
  "secondary" | "outline" | "default" | "destructive"
> = {
  new: "secondary",
  contacted: "outline",
  qualified: "default",
  not_interested: "destructive",
};

const followUpIcons = {
  new: CircleDashed,
  contacted: MessageCircle,
  qualified: BadgeCheck,
  not_interested: CircleOff,
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
        <DialogHeader className="px-5 pt-5 text-left">
          <DialogTitle>Edit & jadikan order</DialogTitle>
          <DialogDescription>
            Lengkapi pesanan {lead?.orderNumber}. Konversi membuat order COD, tetapi belum mengirimkannya ke Mengantar.
          </DialogDescription>
        </DialogHeader>
        <Separator />
        <form onSubmit={submit} noValidate className="space-y-6 px-5 pb-5">
          {error && (
            <div ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {error}
            </div>
          )}
          <section aria-labelledby="lead-buyer-heading" className="space-y-4">
            <div>
              <h3 id="lead-buyer-heading" className="font-medium">Data pembeli</h3>
              <p className="text-sm text-muted-foreground">Pastikan nama dan nomor WhatsApp dapat dihubungi.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium" htmlFor="lead-customer-name">
                <span>Nama pembeli</span>
                <Input id="lead-customer-name" autoComplete="name" aria-invalid={fieldError?.id === "lead-customer-name"} aria-describedby={fieldError?.id === "lead-customer-name" ? "lead-customer-name-error" : undefined} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
                {fieldError?.id === "lead-customer-name" && <span id="lead-customer-name-error" className="block text-xs text-destructive">{fieldError.message}</span>}
              </label>
              <label className="space-y-1.5 text-sm font-medium" htmlFor="lead-customer-phone">
                <span>Nomor WhatsApp</span>
                <Input id="lead-customer-phone" autoComplete="tel" inputMode="tel" aria-invalid={fieldError?.id === "lead-customer-phone"} aria-describedby={fieldError?.id === "lead-customer-phone" ? "lead-customer-phone-error" : undefined} value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} required />
                {fieldError?.id === "lead-customer-phone" && <span id="lead-customer-phone-error" className="block text-xs text-destructive">{fieldError.message}</span>}
              </label>
            </div>
          </section>
          <Separator />
          <section aria-labelledby="lead-product-heading" className="space-y-4">
            <div>
              <h3 id="lead-product-heading" className="font-medium">Produk</h3>
              <p className="text-sm text-muted-foreground">Harga dan stok tetap diverifikasi dari data produk aktif.</p>
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
                {fieldError?.id === "lead-variant" && <p id="lead-variant-error" className="text-xs text-destructive">{fieldError.message}</p>}
              </div>
              <label className="space-y-1.5 text-sm font-medium" htmlFor="lead-quantity">
                <span>Jumlah</span>
                <Input id="lead-quantity" type="number" min="1" max="100" aria-invalid={fieldError?.id === "lead-quantity"} aria-describedby={fieldError?.id === "lead-quantity" ? "lead-quantity-error" : undefined} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value, courierServiceId: "" })} required />
                {fieldError?.id === "lead-quantity" && <span id="lead-quantity-error" className="block text-xs text-destructive">{fieldError.message}</span>}
              </label>
            </div>
          </section>
          <Separator />
          <section aria-labelledby="lead-shipping-heading" className="space-y-4">
            <div>
              <h3 id="lead-shipping-heading" className="font-medium">Alamat & pengiriman</h3>
              <p className="text-sm text-muted-foreground">Pilih kecamatan agar ongkir COD dapat dihitung.</p>
            </div>
            <label className="block space-y-1.5 text-sm font-medium" htmlFor="lead-address">
              <span>Alamat lengkap</span>
              <Textarea id="lead-address" autoComplete="street-address" aria-invalid={fieldError?.id === "lead-address"} aria-describedby={fieldError?.id === "lead-address" ? "lead-address-error" : undefined} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} placeholder="Jalan, nomor rumah, RT/RW, dan patokan" required />
              {fieldError?.id === "lead-address" && <span id="lead-address-error" className="block text-xs text-destructive">{fieldError.message}</span>}
            </label>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="lead-location">Kecamatan tujuan</label>
              <div className="relative">
                <Input id="lead-location" value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="Ketik minimal 2 huruf" aria-invalid={fieldError?.id === "lead-location"} aria-describedby={fieldError?.id === "lead-location" ? "lead-location-error" : "lead-location-help"} />
                {locationLoading && <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
              </div>
              <p id="lead-location-help" className="text-xs text-muted-foreground">
                {form.destinationAreaId ? `${form.district}, ${form.city}, ${form.province}` : "Pilih hasil pencarian agar ongkir dapat dihitung."}
              </p>
              {fieldError?.id === "lead-location" && <p id="lead-location-error" className="text-xs text-destructive">{fieldError.message}</p>}
              {locations.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground" role="listbox" aria-label="Hasil pencarian kecamatan">
                  {locations.map((location) => (
                    <Button key={location.id} type="button" variant="ghost" role="option" aria-selected={form.destinationAreaId === location.id} className="h-auto min-h-11 w-full justify-start whitespace-normal px-3 py-2 text-left" onClick={() => {
                      setForm({ ...form, district: location.district, city: location.city, province: location.province, postalCode: location.postal_code || "", destinationAreaId: String(location.id), courierServiceId: "" });
                      setLocationQuery(location.label);
                      setLocations([]);
                    }}>
                      {location.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Kurir & ongkir</p>
              {ratesLoading ? <Skeleton className="h-14 w-full" /> : rates.length > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Pilihan kurir dan ongkir">
                  {rates.map((rate) => {
                    const selected = form.courierServiceId === String(rate.courier_service_id);
                    return <Button key={rate.courier_service_id} type="button" variant={selected ? "secondary" : "outline"} role="radio" aria-checked={selected} className="h-auto min-h-14 items-start justify-start whitespace-normal p-3 text-left" onClick={() => setForm({ ...form, courierServiceId: String(rate.courier_service_id) })}>
                      <span>
                        <span className="block font-semibold">{rate.courier_code} · {rate.courier_service}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{formatIdr(rate.shipping_cost)}{rate.estimated_days ? ` · ${rate.estimated_days}` : ""}</span>
                      </span>
                    </Button>;
                  })}
                </div>
              ) : <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">Pilih produk dan kecamatan untuk melihat kurir.</div>}
            </div>
          </section>
          <DialogFooter className="mx-0 mb-0 border-t px-0 pt-5 pb-0">
            <Button type="button" variant="outline" size="xl" onClick={() => onClose()} disabled={saving}>Batal</Button>
            <Button type="submit" size="xl" disabled={saving}>
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

  if (loading) return (
    <Card size="sm" className="py-0" aria-label="Memuat pesanan tertinggal" aria-busy="true">
      <CardContent className="divide-y divide-border p-0">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_11rem_12rem_auto] lg:items-center lg:gap-4">
          <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
          <div className="space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
          <div className="space-y-2"><Skeleton className="h-5 w-28" /><Skeleton className="h-3 w-2/3" /></div>
          <Skeleton className="h-9 w-full lg:w-56" />
        </div>
      ))}
      </CardContent>
    </Card>
  );

  if (error) return (
    <Card role="alert" className="border-destructive/20">
      <CardContent className="py-6 text-center">
        <AlertCircle className="mx-auto size-8 text-destructive" aria-hidden="true" />
        <h2 className="mt-3 font-semibold">Pesanan tertinggal gagal dimuat</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" size="xl" variant="outline" onClick={() => void load()}><RefreshCw />Coba lagi</Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* No card title here: the page header above already names this screen and
          describes it, so a second heading only cost vertical space. */}
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {/* Both controls are the same shape now - a div wrapping a label and
              the field. The search used to be a <label> with flex-1, which
              stretched it to 871px on a 1440px screen and sat its baseline 6px
              below the select despite items-end. */}
          <div className="flex w-full flex-col gap-1.5 sm:w-72">
            <label htmlFor="abandoned-search" className="text-sm font-medium">Cari lead</label>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              {/* sm:h-9 matches the select trigger. Below sm, admin.css gives
                  every input a 3rem floor, so the trigger is raised to match it
                  rather than the input being shrunk under a touch target. */}
              <Input id="abandoned-search" className="pl-9 sm:h-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Produk, nama, WhatsApp, atau ABN" />
            </span>
          </div>
          {/* gap, not space-y. Tailwind v4 puts space-y's margin on
              :not(:last-child), and Base UI's Select renders a hidden input as
              the last child - so the trigger picked up a 6px bottom margin that
              nothing occupied and sat 6px above the search field's baseline.
              gap ignores the out-of-flow input. */}
          <div className="flex w-full flex-col gap-1.5 sm:w-52">
            <label htmlFor="follow-up-filter" className="text-sm font-medium">Status follow-up</label>
            <Select value={status} onValueChange={(value) => { setStatus((value || "all") as FollowUpStatus | "all"); setPage(1); }}>
              <SelectTrigger id="follow-up-filter" className="w-full sm:h-9 sm:min-h-9">
                {/* Base UI renders the raw value when Value has no children,
                    so the trigger read "all" instead of "Semua status". */}
                <SelectValue>{status === "all" ? "Semua status" : followUpLabels[status]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                {Object.entries(followUpLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
            {/* The count used to float under the card. On the row's trailing
                edge it fills space that was simply blank. */}
            <p className="text-xs font-medium text-muted-foreground sm:ml-auto sm:pb-2.5" role="status" aria-live="polite">
              {refreshing ? "Memperbarui pesanan tertinggal…" : `${pagination.totalItems} pesanan tertinggal`}
            </p>
          </CardContent>
        </Card>
      {notice && (
        <Card size="sm" role="status" aria-live="polite" className="bg-muted/40">
          <CardContent className="text-muted-foreground">{notice}</CardContent>
        </Card>
      )}
      {leads.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <PackageSearch className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">{search.trim() || status !== "all" ? "Tidak ada hasil yang cocok" : "Belum ada pesanan tertinggal"}</h2>
            <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{search.trim() || status !== "all" ? "Ubah pencarian atau filter follow-up." : "Lead akan muncul ketika pembeli sudah mengisi nama dan WhatsApp tetapi belum menyelesaikan order."}</p>
          </CardContent>
        </Card>
      ) : (
        /* One divided list rather than a card per lead. This is a work queue: at
           a card each, seven leads ran 2097px in an 832px viewport - roughly
           240px per lead, most of it padding and a footer holding two buttons.
           The row keeps every field and both actions, and stacks on small
           screens. */
        <Card size="sm" className="py-0">
          <CardContent className="divide-y divide-border p-0">
            {leads.map((lead) => {
              const phone = lead.customerPhone.replace(/\D/g, "").replace(/^0/, "62");
              const message = `Halo Kak ${lead.customerName || "Pelanggan"}, kami ingin membantu melanjutkan pesanan ${lead.productName || "produk pilihan Kakak"}. Apakah ada yang bisa kami bantu?`;
              const FollowUpIcon = followUpIcons[lead.followUpStatus];
              return (
                <div
                  key={lead.id}
                  role="article"
                  aria-labelledby={`lead-${lead.id}-title`}
                  className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_11rem_12rem_auto] lg:items-center lg:gap-4"
                >
                  <div className="min-w-0">
                    <h3 id={`lead-${lead.id}-title`} className="truncate font-medium">{lead.productName || "Produk belum dipilih"}</h3>
                    <p className="truncate text-xs text-muted-foreground">{lead.variantName || "Varian belum dipilih"} · {lead.orderNumber}</p>
                    {!lead.variantId && (
                      <Badge variant="destructive" className="mt-1"><AlertCircle aria-hidden="true" />Pilih produk sebelum konversi</Badge>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{lead.customerName}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{lead.customerPhone}</p>
                  </div>
                  <div className="min-w-0">
                    <Badge variant={followUpVariants[lead.followUpStatus]}><FollowUpIcon aria-hidden="true" />{followUpLabels[lead.followUpStatus]}</Badge>
                    {/* Only when there is something to report. "Belum ada follow-up
                        tercatat" repeated on every untouched lead, restating the
                        badge beside it. */}
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {lead.followedUpAt
                        ? `Dicatat ${formatDate(lead.followedUpAt)}${lead.followedUpBy ? ` oleh ${lead.followedUpBy}` : ""}`
                        : `Masuk ${formatDate(lead.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                    <Button type="button" variant="outline" size="lg" className="min-h-11 w-full sm:w-auto lg:min-h-9" disabled={updatingId === lead.id} onClick={() => {
                      window.open(buildWaUrl(phone, message), "_blank", "noopener,noreferrer");
                      void followUp(lead);
                    }}><ExternalLink />{updatingId === lead.id ? "Mencatat…" : "Follow up WA"}</Button>
                    <Button type="button" size="lg" className="min-h-11 w-full sm:w-auto lg:min-h-9" onClick={() => setSelectedLead(lead)}><UserRoundPlus />Jadikan order</Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
      {pagination.totalPages > 1 && (
        <Pagination aria-label="Halaman pesanan tertinggal" className="justify-between">
          <PaginationContent className="w-full justify-between gap-3">
            <PaginationItem>
              <Button type="button" variant="outline" size="xl" disabled={refreshing || pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                <ChevronLeft /> <span className="hidden sm:inline">Sebelumnya</span>
              </Button>
            </PaginationItem>
            <PaginationItem>
              <span className="text-sm font-medium text-muted-foreground" aria-current="page">Halaman {pagination.page} dari {pagination.totalPages}</span>
            </PaginationItem>
            <PaginationItem>
              <Button type="button" variant="outline" size="xl" disabled={refreshing || pagination.page >= pagination.totalPages} onClick={() => setPage((current) => current + 1)}>
                <span className="hidden sm:inline">Berikutnya</span> <ChevronRight />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
      <ConversionDialog lead={selectedLead} products={products} onClose={(orderNumber) => {
        setSelectedLead(null);
        if (orderNumber) window.location.assign(`/admin/orders/${encodeURIComponent(orderNumber)}`);
      }} />
    </div>
  );
}
