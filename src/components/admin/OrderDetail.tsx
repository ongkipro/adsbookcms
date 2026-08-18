import { formatIdr } from "@/lib/format-idr";
import { calculateCodCustomerTotal, calculateCodFeeBreakdown } from "@/lib/payment-fee-policy";
import { TrafficSourceBadge } from "./TrafficSourceBadge";
import { type SyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { buildWaUrl, defaultCrmTemplates, renderCrmMessage } from "../../lib/crm-template";
import { CrmActionGroup } from "./CrmActionGroup";
import { CRM_STEPS } from "./CrmActionButton";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button, buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { groupLocationResults } from "../../lib/location-search";
import {
  ArrowLeft,
  Copy,
  Check,
  Phone,
  MapPin,
  Package,
  Truck,
  CreditCard,
  ShieldAlert,
  MessageSquare,
  Trash2,
  ExternalLink,
  RefreshCw,
  Edit3,
  Loader2,
} from "lucide-react";

type OrderItem = {
  id: number | string;
  variant_id: number;
  quantity: number;
  unit_price: number;
  variant_title: string | null;
  variant_sku: string | null;
  product_title: string | null;
};

type ReceiverPerformance = {
  checkedAt?: string;
  totals?: {
    total?: number;
    delivered?: number;
    rts?: number;
    undelivered?: number;
    inProgress?: number;
  };
};

type PaymentDetails = {
  provider_transaction_id: string | null;
  reference_id: string;
  channel_code: string;
  status: string;
  amount: number;
  admin_fee: number;
  total_amount: number;
  expires_at: string | null;
  paid_at: string | null;
  failed_reason: string | null;
};

type SellerBankAccount = {
  bank_code: string;
  account_holder: string;
  account_number: string;
  is_active: number | boolean;
};

type Order = {
  id: number | string;
  order_number: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  postal_code: string | null;
  destination_area_id: string | null;
  total_amount: number;
  shipping_cost: number;
  discount_amount?: number;
  cod_service_fee: number;
  cod_service_fee_vat: number;
  cod_fee_bearer: "buyer" | "seller";
  payment_method: string;
  payment_status: string;
  shipping_status: string;
  confirmed_at: string | null;
  courier_code: string | null;
  courier_service: string | null;
  cnote_no: string | null;
  provider_order_id: string | null;
  provider_dispatch_error: string | null;
  dispatchEligible?: boolean;
  dispatchReason?: string | null;
  receiver_delivery_rate: number | null;
  receiver_risk_label: string | null;
  receiver_performance: ReceiverPerformance | null;
  receiver_performance_checked_at: string | null;
  ad_click_ids?: string | null;
  created_at: string;
  payment: PaymentDetails | null;
  items: OrderItem[];
};

type LocationOption = {
  id: string;
  label: string;
  district: string;
  subdistrict_name?: string;
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

const shippingLabels: Record<string, string> = {
  pending: "Menunggu konfirmasi",
  processing: "Siap push Mengantar",
  shipped: "Dikirim",
  delivered: "Selesai",
  returned: "RTS",
  cancelled: "Batal",
};

const shippingStatusBadges: Record<string, string> = {
  abandoned: "bg-rose-50 text-rose-900 border-rose-200",
  pending: "bg-amber-50 text-amber-900 border-amber-200",
  processing: "bg-sky-50 text-sky-900 border-sky-200",
  shipped: "bg-blue-50 text-blue-900 border-blue-200",
  delivered: "bg-emerald-50 text-emerald-900 border-emerald-200",
  returned: "bg-rose-100 text-rose-950 border-rose-300",
  cancelled: "bg-slate-100 text-slate-700 border-slate-200",
};

const shippingStatusDots: Record<string, string> = {
  abandoned: "bg-rose-500",
  pending: "bg-amber-500",
  processing: "bg-sky-500",
  shipped: "bg-blue-500",
  delivered: "bg-emerald-500",
  returned: "bg-rose-600",
  cancelled: "bg-slate-400",
};

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
  manual_transfer: "Transfer bank manual",
  bank_transfer: "Virtual Account",
  qris: "QRIS",
  invoice: "Pembayaran online",
};

const currency = formatIdr;

const formatDate = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date)} WIB`;
};

function EditCustomerDialog({
  order,
  onUpdated,
}: {
  order: Order;
  onUpdated: (order: Order) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!order.provider_order_id && new URLSearchParams(window.location.search).get("edit") === "shipping") {
      setOpen(true);
    }
  }, [order.provider_order_id]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submitErrorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [searchLocation, setSearchLocation] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [isSearchingLocations, setIsSearchingLocations] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [useSubdistrict] = useState(false);
  const [selectedCourierServiceId, setSelectedCourierServiceId] = useState("");
  const [formData, setFormData] = useState({
    customer_name: order.customer_name || "",
    customer_phone: order.customer_phone || "",
    address: order.address || "",
    district: order.district || "",
    city: order.city || "",
    province: order.province || "",
    postal_code: order.postal_code || "",
    destination_area_id: order.destination_area_id || "",
  });

  useEffect(() => {
    setFormData({
      customer_name: order.customer_name || "",
      customer_phone: order.customer_phone || "",
      address: order.address || "",
      district: order.district || "",
      city: order.city || "",
      province: order.province || "",
      postal_code: order.postal_code || "",
      destination_area_id: order.destination_area_id || "",
    });
    setSearchLocation("");
    setLocations([]);
    setLocationError("");
    setShowValidation(false);
  }, [order, open]);

  useEffect(() => {
    if (submitError) submitErrorRef.current?.focus();
  }, [submitError]);

  const visibleLocations = useMemo(
    () =>
      useSubdistrict
        ? locations
        : groupLocationResults(locations).map((group) => group.items[0]),
    [locations, useSubdistrict]
  );
  const customerEditable = !order.provider_order_id;
  const courierEditable =
    customerEditable &&
    order.payment_method === "cod" &&
    order.shipping_status === "pending";
  const locationEditable = courierEditable;
  const firstItem = order.items?.[0];

  useEffect(() => {
    const query = searchLocation.trim();
    if (query.length < 2) {
      setLocations([]);
      setLocationError("");
      setIsSearchingLocations(false);
      return;
    }
    const controller = new AbortController();
    setIsSearchingLocations(true);
    setLocationError("");
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/locations?search=${encodeURIComponent(query)}`,
        {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }
      )
        .then(async (response) => {
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.success) throw new Error(payload.error || "Gagal mencari kecamatan");
          const items = ((payload.items && payload.items.length ? payload.items : payload.alternatives) || payload.locations || []) as LocationOption[];
          setLocations(items);
        })
        .catch((err) => {
          if (err.name !== "AbortError") setLocationError(err.message || "Terjadi kesalahan");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsSearchingLocations(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchLocation, useSubdistrict]);

  useEffect(() => {
    if (
      !open ||
      !courierEditable ||
      !formData.destination_area_id ||
      !firstItem
    ) {
      setShippingRates([]);
      setSelectedCourierServiceId("");
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      destination_id: formData.destination_area_id,
      payment_method: order.payment_method || "cod",
      variant_id: String(firstItem?.variant_id || 1),
      quantity: String(firstItem?.quantity || 1),
    });
    setRatesLoading(true);
    void fetch(`/api/shipping-rates?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Tarif pengiriman gagal dimuat.");
        }
        const rates = ((payload.items || payload.rates || []) as ShippingRate[]);
        setShippingRates(rates);
        const current = rates.find(
          (rate) =>
            rate.courier_code === order.courier_code &&
            rate.courier_service === order.courier_service
        );
        setSelectedCourierServiceId(
          current ? String(current.courier_service_id) : ""
        );
      })
      .catch((reason) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          setShippingRates([]);
          setSelectedCourierServiceId("");
          toast.error(
            reason instanceof Error
              ? reason.message
              : "Tarif pengiriman gagal dimuat."
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRatesLoading(false);
      });
    return () => controller.abort();
  }, [
    firstItem,
    formData.destination_area_id,
    open,
    order.courier_code,
    order.courier_service,
    courierEditable,
  ]);

  const selectedRate = shippingRates.find(
    (rate) => String(rate.courier_service_id) === selectedCourierServiceId
  );
  const editableFields = [
    "customer_name",
    "customer_phone",
    "address",
    "district",
    "city",
    "province",
    "postal_code",
    "destination_area_id",
  ] as const;
  const customerDirty = editableFields.some(
    (field) => formData[field].trim() !== String(order[field] || "").trim(),
  );
  const isFieldDirty = (field: (typeof editableFields)[number]) =>
    formData[field].trim() !== String(order[field] || "").trim();
  const fieldErrors = {
    customer_name:
      isFieldDirty("customer_name") && formData.customer_name.trim().length < 2
        ? "Nama minimal 2 karakter."
        : "",
    customer_phone:
      isFieldDirty("customer_phone") &&
      !/^(08|628)\d{8,11}$/.test(formData.customer_phone.replace(/[^\d]/g, ""))
        ? "Nomor HP harus berisi 10–13 digit, misalnya 081234567890."
        : "",
    address:
      isFieldDirty("address") && formData.address.trim().length < 10
        ? "Alamat lengkap minimal 10 karakter."
        : "",
    district:
      isFieldDirty("district") && formData.district.trim().length < 2
        ? "Pilih kecamatan dari hasil pencarian."
        : "",
    city:
      isFieldDirty("city") && formData.city.trim().length < 2
        ? "Kota/kabupaten belum valid."
        : "",
    province:
      isFieldDirty("province") && formData.province.trim().length < 2
        ? "Provinsi belum valid."
        : "",
    postal_code:
      isFieldDirty("postal_code") &&
      Boolean(formData.postal_code) &&
      !/^\d{5}$/.test(formData.postal_code)
        ? "Kode pos harus 5 digit."
        : "",
    destination_area_id: "",
  } satisfies Record<(typeof editableFields)[number], string>;
  const selectedRateChanged = Boolean(
    courierEditable &&
    selectedRate &&
    (selectedRate.courier_code !== order.courier_code ||
      selectedRate.courier_service !== order.courier_service ||
      formData.destination_area_id !== String(order.destination_area_id || "")),
  );
  const locationChanged =
    formData.destination_area_id.trim() !==
    String(order.destination_area_id || "").trim();
  const rateRequired = courierEditable && locationChanged && !selectedRate;
  const formValid =
    !Object.values(fieldErrors).some(Boolean) &&
    !rateRequired;

  const handleSubmit = async (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>
  ) => {
    event.preventDefault();
    setShowValidation(true);
    if (!customerEditable || (!customerDirty && !selectedRateChanged)) return;
    if (!formValid) {
      window.requestAnimationFrame(() => {
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-validation-error="true"]')
          ?.focus();
      });
      return;
    }
    setLoading(true);
    setSubmitError("");
    try {
      const customerPayload = Object.fromEntries(
        editableFields
          .filter((field) => formData[field].trim() !== String(order[field] || "").trim())
          .map((field) => [field, formData[field].trim()]),
      );
      const shippingPayload =
        selectedRateChanged && selectedRate
          ? {
              destination_area_id: formData.destination_area_id,
              courier_code: selectedRate.courier_code,
              courier_service_id: selectedRate.courier_service_id,
            }
          : {};
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(String(order.id))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...customerPayload, ...shippingPayload }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal menyimpan data.");
      }
      onUpdated({ ...order, ...payload.data });
      setOpen(false);
      toast.success("Data pembeli dan pengiriman berhasil diperbarui.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terjadi kesalahan.";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!loading) {
        setSubmitError("");
        setOpen(nextOpen);
      }
    }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!customerEditable}
          title={!customerEditable ? "Data terkunci karena shipment Mengantar sudah dibuat." : undefined}
          className="h-8.5 px-3 rounded-lg border-slate-200 bg-white font-extrabold text-xs text-slate-700 hover:bg-slate-50"
        >
          <Edit3 className="mr-1.5 size-3.5 text-slate-500" />
          Edit Pembeli & Alamat
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto p-0 sm:max-w-2xl rounded-2xl">
        <DialogHeader className="border-b border-slate-100 px-6 py-4 text-left">
          <DialogTitle className="text-base font-black text-slate-900">
            Edit Pembeli & Pengiriman
          </DialogTitle>
          <DialogDescription className="text-xs">
            Data pembeli dapat diperbarui sebelum shipment dibuat. Kurir hanya dapat diganti untuk order COD yang masih menunggu.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-4 px-6 py-5">
          {submitError && (
            <div ref={submitErrorRef} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800" role="alert" tabIndex={-1}>
              {submitError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-bold text-slate-700">
              <span>Nama Lengkap</span>
              <Input
                id="edit-customer-name"
                name="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                autoComplete="name"
                maxLength={100}
                aria-invalid={showValidation && Boolean(fieldErrors.customer_name)}
                aria-describedby={fieldErrors.customer_name ? "edit-customer-name-error" : undefined}
                className="h-10 text-xs font-bold"
              />
              {showValidation && fieldErrors.customer_name && (
                <span id="edit-customer-name-error" className="block text-[11px] font-semibold text-rose-700">
                  {fieldErrors.customer_name}
                </span>
              )}
            </label>
            <label className="block space-y-1 text-xs font-bold text-slate-700">
              <span>Nomor WhatsApp / HP</span>
              <Input
                id="edit-customer-phone"
                name="customer_phone"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={40}
                aria-invalid={showValidation && Boolean(fieldErrors.customer_phone)}
                aria-describedby={fieldErrors.customer_phone ? "edit-customer-phone-error" : undefined}
                className="h-10 text-xs font-bold font-mono"
              />
              {showValidation && fieldErrors.customer_phone && (
                <span id="edit-customer-phone-error" className="block text-[11px] font-semibold text-rose-700">
                  {fieldErrors.customer_phone}
                </span>
              )}
            </label>
          </div>

          <label className="block space-y-1 text-xs font-bold text-slate-700">
            <span>Alamat Jalan / Rumah</span>
            <Textarea
              id="edit-customer-address"
              name="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              autoComplete="street-address"
              maxLength={500}
              aria-invalid={showValidation && Boolean(fieldErrors.address)}
              aria-describedby={fieldErrors.address ? "edit-customer-address-error" : undefined}
              className="min-h-24 resize-y text-xs font-medium"
              placeholder="Contoh: Jl. Merdeka No. 12 RT 01/02"
            />
            {showValidation && fieldErrors.address && (
              <span id="edit-customer-address-error" className="block text-[11px] font-semibold text-rose-700">
                {fieldErrors.address}
              </span>
            )}
          </label>

          <div className="space-y-2 border-t border-slate-100 pt-3">
            <label className="block space-y-1 text-xs font-bold text-slate-700">
              <span>Cari Kecamatan / Kota</span>
              <Input
                id="edit-customer-location-search"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                disabled={!locationEditable}
                type="search"
                placeholder="Ketik minimal 2 huruf (contoh: Kebayoran Baru)"
                aria-controls="edit-customer-location-results"
                aria-describedby="edit-customer-location-help"
                className="h-10 text-xs"
              />
              <span id="edit-customer-location-help" className="block text-[11px] font-medium text-slate-500">
                Pilih hasil pencarian agar kecamatan, kota, provinsi, dan ID tujuan tetap sinkron.
              </span>
            </label>

            {isSearchingLocations && (
              <p className="text-[11px] font-bold text-blue-600">Mencari area...</p>
            )}
            {locationError && (
              <p className="text-[11px] font-bold text-rose-600">{locationError}</p>
            )}

            {visibleLocations.length > 0 && (
              <div id="edit-customer-location-results" className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-1.5 space-y-1" aria-label="Hasil pencarian lokasi">
                {visibleLocations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      const areaId = String(loc.id || (loc as any).location_id || "").trim();
                      setFormData({
                        ...formData,
                        district: loc.district || "",
                        city: loc.city || "",
                        province: loc.province || "",
                        postal_code: loc.postal_code || formData.postal_code || "",
                        destination_area_id: areaId,
                      });
                      setLocations([]);
                      setSearchLocation("");
                    }}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-white transition-colors"
                  >
                    <span className="font-bold text-slate-950 block">{loc.label}</span>
                    <span className="text-[10px] text-slate-500">{[loc.district, loc.city, loc.province].filter(Boolean).join(", ")}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Kecamatan</span>
                <Input
                  value={formData.district}
                  readOnly
                  placeholder="Nama kecamatan"
                  className="h-8 text-xs font-semibold"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Kota / Kab</span>
                <Input
                  value={formData.city}
                  readOnly
                  placeholder="Nama kota/kabupaten"
                  className="h-8 text-xs font-semibold"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Provinsi</span>
                <Input
                  value={formData.province}
                  readOnly
                  placeholder="Nama provinsi"
                  className="h-8 text-xs font-semibold"
                />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Kode Pos</span>
                <Input
                  value={formData.postal_code}
                  readOnly
                  placeholder="5 digit"
                  className="h-8 text-xs font-semibold font-mono"
                />
              </div>
            </div>
          </div>

          {/* Opsi Kurir & Biaya Pengiriman (Ongkir) */}
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Truck className="size-4 text-emerald-600" />
                <span>Pilih Kurir & Biaya Pengiriman (Ongkir)</span>
              </span>
              {ratesLoading && (
                <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1 animate-pulse">
                  <Loader2 className="size-3 animate-spin" /> Memuat tarif...
                </span>
              )}
            </div>

            {ratesLoading ? (
              <div className="space-y-2">
                <div className="h-12 w-full rounded-xl bg-slate-100 animate-pulse border border-slate-200" />
                <div className="h-12 w-full rounded-xl bg-slate-100 animate-pulse border border-slate-200" />
              </div>
            ) : shippingRates.length > 0 ? (
              <div className="grid-cols-1 grid gap-2 max-h-52 overflow-y-auto pr-1" role="radiogroup" aria-label="Pilihan kurir dan ongkir">
                {shippingRates.map((rate) => {
                  const isSelected = String(rate.courier_service_id) === selectedCourierServiceId;
                  return (
                    <button
                      key={rate.courier_service_id}
                      type="button"
                      onClick={() => setSelectedCourierServiceId(String(rate.courier_service_id))}
                      role="radio"
                      aria-checked={isSelected}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between",
                        isSelected
                          ? "border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600/30 shadow-xs"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "size-4 rounded-full border flex items-center justify-center transition-colors shrink-0",
                            isSelected ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-white"
                          )}
                        >
                          {isSelected && <Check className="size-2.5 text-white stroke-[3]" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-xs uppercase text-slate-900">
                              {rate.courier_code} · {rate.courier_service}
                            </span>
                          </div>
                          {rate.estimated_days && (
                            <span className="text-[10px] font-bold text-slate-500 block mt-0.5">
                              Estimasi: {rate.estimated_days}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-black text-xs text-emerald-700">
                          {currency(rate.shipping_cost)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : !courierEditable ? (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <span className="font-bold block text-slate-800">Biaya Ongkir Terkunci</span>
                <span>
                  Layanan pengiriman & ongkir saat ini:{" "}
                  <strong className="text-slate-900">
                    {[order.courier_code, order.courier_service].filter(Boolean).join(" · ").toUpperCase() || "Belum ditentukan"}
                  </strong>{" "}
                  ({currency(order.shipping_cost || 0)})
                </span>
              </div>
            ) : formData.destination_area_id ? (
              <p className="text-xs text-amber-700 font-bold bg-amber-50 p-3 rounded-xl border border-amber-200">
                Tidak ada pilihan kurir otomatis yang tersedia untuk lokasi ini ({formData.district || formData.destination_area_id}). Silakan ketik dan pilih ulang kecamatan dari menu pencarian di atas.
              </p>
            ) : (
              <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 font-medium">
                Cari & pilih kecamatan pada kolom pencarian di atas untuk menampilkan opsi kurir & biaya pengiriman.
              </p>
            )}
            {showValidation && rateRequired && (
              <p
                tabIndex={-1}
                data-validation-error="true"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"
                role="alert"
              >
                Pilih layanan kurir untuk lokasi COD yang baru sebelum menyimpan.
              </p>
            )}
          {/* Ringkasan Real-Time Total Order (Preview) */}
          {(() => {
            const itemTotal =
              (order.items || []).reduce(
                (acc, item) => acc + Number(item.unit_price || 0) * Number(item.quantity || 1),
                0
              ) || Math.max(0, Number(order.total_amount || 0) - Number(order.shipping_cost || 0));
            const newShippingCost = selectedRate
              ? Number(selectedRate.shipping_cost || 0)
              : Number(order.shipping_cost || 0);
            const discount = Number(order.discount_amount || 0);
            const orderAmount = Math.max(0, itemTotal - discount + newShippingCost);
            const codFee = order.payment_method === "cod"
              ? calculateCodFeeBreakdown(orderAmount)
              : null;
            const newTotalAmount = order.payment_method === "cod"
              ? calculateCodCustomerTotal(orderAmount, order.cod_fee_bearer)
              : orderAmount;
            return (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-1.5 text-xs">
                <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider block">
                  Ringkasan Total Order (Preview Setelah Simpan)
                </span>
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Produk</span>
                  <span className="font-semibold text-slate-900">{currency(itemTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Biaya Pengiriman (Ongkir Baru)</span>
                  <span className="font-semibold text-emerald-700">{currency(newShippingCost)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Diskon</span>
                    <span className="font-semibold text-slate-900">−{currency(discount)}</span>
                  </div>
                )}
                {codFee && order.cod_fee_bearer === "buyer" && (
                  <div className="flex justify-between text-slate-600">
                    <span>Fee COD + PPN</span>
                    <span className="font-semibold text-slate-900">{currency(codFee.totalFee)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm text-slate-900 pt-1.5 border-t border-slate-200">
                  <span>Total Tagihan Order</span>
                  <span className="text-emerald-700">{currency(newTotalAmount)}</span>
                </div>
              </div>
            );
          })()}
          </div>

          <DialogFooter className="border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="h-10 text-xs font-bold"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={loading || (!customerDirty && !selectedRateChanged)}
              className="h-10 text-xs font-bold"
            >
              {loading ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {!customerEditable && (
      <span className="max-w-52 text-right text-[10px] leading-snug text-slate-500">
        Terkunci: shipment Mengantar sudah dibuat.
      </span>
    )}
    </div>
  );
}

export function OrderDetail({ invoice }: { invoice: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [copiedTarget, setCopiedTarget] = useState("");
  const [crmTemplates, setCrmTemplates] = useState({ ...defaultCrmTemplates });
  const [crmSellerName, setCrmSellerName] = useState("");
  const [crmBankAccounts, setCrmBankAccounts] = useState("");
  const [clickedSteps, setClickedSteps] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    void fetch(`/api/admin/orders/${encodeURIComponent(invoice)}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) throw new Error(payload.error || "Detail order tidak ditemukan.");
        return payload.data as Order;
      })
      .then((data) => {
        setOrder(data);
      })
      .catch((reason) => {
        if (!(reason instanceof Error && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Detail order gagal dimuat.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [invoice]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/settings", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) return;
        if (payload.data?.crm_templates) {
          setCrmTemplates((current) => ({
            ...current,
            ...payload.data.crm_templates,
          }));
        }
        setCrmSellerName(String(payload.data?.store?.name || "").trim());
      })
      .catch(() => undefined);

    void fetch("/api/admin/seller-bank-accounts", {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success || !Array.isArray(payload.data)) return;
        const accounts = payload.data as SellerBankAccount[];
        setCrmBankAccounts(
          accounts
            .filter((account) => Boolean(account.is_active))
            .map((account) =>
              [
                account.bank_code,
                account.account_number,
                account.account_holder ? `a.n. ${account.account_holder}` : "",
              ]
                .filter(Boolean)
                .join(" ")
            )
            .filter(Boolean)
            .join(", ")
        );
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const allCrmMessages = useMemo<Record<string, string>>(() => {
    if (!order) return {};
    const safePhone = String(order.customer_phone || "").trim();
    const items = Array.isArray(order.items) ? order.items : [];
    const messages: Record<string, string> = {};
    for (const step of CRM_STEPS) {
      messages[step.key] = renderCrmMessage(crmTemplates[step.key] || "", {
        customerName: order.customer_name || "Pelanggan",
        customerPhone: safePhone,
        address: order.address || undefined,
        district: order.district || "",
        city: order.city || undefined,
        province: order.province || "",
        postalCode: order.postal_code || undefined,
        orderNumber: order.order_number,
        productName:
          items
            .map((item) => item.product_title || item.variant_title)
            .filter(Boolean)
            .join(", ") || "Produk",
        productPrice: items.reduce(
          (total, item) =>
            total + (item.quantity || 1) * (item.unit_price || 0),
          0,
        ),
        shippingCost: order.shipping_cost || 0,
        totalAmount: order.total_amount || 0,
        courierCode: order.courier_code || "",
        cnoteNo: order.cnote_no || undefined,
        sellerName: crmSellerName,
        bankAccounts: crmBankAccounts,
        epaymentLink: "",
        orderDetailsLink: `/admin/orders/${encodeURIComponent(order.order_number)}`,
      });
    }
    return messages;
  }, [order, crmTemplates, crmSellerName, crmBankAccounts]);

  const allCrmUrls = useMemo<Record<string, string>>(() => {
    if (!order) return {};
    const safePhone = String(order.customer_phone || "").trim();
    return Object.fromEntries(
      CRM_STEPS.map((step) => [
        step.key,
        buildWaUrl(safePhone, allCrmMessages[step.key] || ""),
      ]),
    );
  }, [allCrmMessages, order]);

  const copyToClipboard = async (
    text: string,
    target: string,
    label: string,
  ) => {
    if (!text.trim()) {
      toast.error(`${label} belum tersedia.`);
      return;
    }
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard API tidak tersedia");
      }
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      toast.success(`${label} berhasil disalin.`);
      window.setTimeout(
        () =>
          setCopiedTarget((current) => (current === target ? "" : current)),
        2000,
      );
    } catch {
      toast.error(`${label} gagal disalin. Periksa izin clipboard browser.`);
    }
  };

  const updateStatus = async (shippingStatus: string) => {
    if (!order) return;
    const previous = order.shipping_status;
    setOrder({ ...order, shipping_status: shippingStatus });
    setSaving(true);
    setNotice("Menyimpan status pengiriman…");
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(String(order.id))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shipping_status: shippingStatus }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Status pengiriman gagal diperbarui.");
      }
      setNotice(payload.message || "Status pengiriman berhasil diperbarui.");
      toast.success("Status pengiriman berhasil diperbarui.");
    } catch (reason) {
      setOrder((current) => (current ? { ...current, shipping_status: previous } : current));
      const msg = reason instanceof Error ? reason.message : "Status pengiriman gagal diperbarui.";
      setNotice(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const pushToMengantar = async () => {
    if (!order) return;
    setSaving(true);
    setNotice("Mengirim order ke Mengantar…");
    try {
      const response = await fetch(
        `/api/admin/orders/${encodeURIComponent(String(order.id))}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dispatch-order" }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Order gagal dikirim ke Mengantar.");
      }
      setOrder((current) => (current ? { ...current, ...payload.data } : current));
      setNotice(payload.message || "Shipment diterima Mengantar.");
      toast.success(payload.message || "Shipment diterima Mengantar.");
      window.location.assign(`/admin/shipping?order=${encodeURIComponent(order.order_number)}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Pesanan gagal dikonfirmasi.";
      setNotice(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteOrder = async () => {
    if (!order) return;
    if (!window.confirm(`Apakah Anda yakin ingin menghapus pesanan ${order.order_number}? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setSaving(true);
    setNotice("Menghapus order…");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(String(order.id))}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal menghapus order.");
      }
      toast.success(`Order ${order.order_number} berhasil dihapus.`);
      window.location.assign("/admin/orders");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Gagal menghapus order.";
      setNotice(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };
  const refreshRtsScoring = async () => {
    if (!order) return;
    setSaving(true);
    setNotice("Memeriksa risiko RTS dari Mengantar…");
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(String(order.id))}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh-scoring" }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        data?: Partial<typeof order>;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal memperbarui risiko RTS dari Mengantar.");
      }
      toast.success(payload.message || "Risiko RTS berhasil diperbarui dari Mengantar.");
      setNotice(payload.message || "");
      if (payload.data) {
        setOrder((prev) => (prev ? { ...prev, ...payload.data } : prev));
      }
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Gagal memperbarui risiko RTS.";
      setNotice(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200/70" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-48 animate-pulse rounded-2xl bg-slate-200/70" />
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
          </div>
          <div className="space-y-6">
            <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" />
            <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm max-w-xl mx-auto my-12" role="alert">
        <ShieldAlert className="size-12 text-rose-500 mx-auto mb-3" />
        <h2 className="text-xl font-black text-slate-950">Detail Order Tidak Ditemukan</h2>
        <p className="mt-2 text-xs font-semibold text-slate-600">{error || "Sistem tidak dapat menemukan record invoice ini."}</p>
        <a href="/admin/orders" className="inline-flex items-center gap-2 mt-6 h-10 px-5 rounded-xl bg-slate-900 text-xs font-bold text-white hover:bg-slate-800 transition-colors">
          <ArrowLeft className="size-4" />
          Kembali ke Daftar Order
        </a>
      </section>
    );
  }

  const safePhone = String(order.customer_phone || "").trim();
  const waNumber = safePhone.replace(/\D/g, "").replace(/^0/, "62");
  const riskValue = String(order.receiver_risk_label || "").toUpperCase();
  const risk = riskValue.includes("HIGH")
    ? { label: "Risiko tinggi", style: "bg-rose-100 text-rose-800 border-rose-200" }
    : riskValue.includes("MEDIUM")
    ? { label: "Risiko sedang", style: "bg-amber-100 text-amber-800 border-amber-200" }
    : riskValue.includes("LOW")
    ? { label: "Risiko rendah", style: "bg-emerald-100 text-emerald-800 border-emerald-200" }
    : { label: "Belum dinilai", style: "bg-slate-100 text-slate-700 border-slate-200" };

  const paymentStatus = String(order.payment_status || "unpaid").toLowerCase();
  const paymentPaid = ["paid", "settled", "success"].includes(paymentStatus);
  const paymentFailed = ["failed", "expired"].includes(paymentStatus);
  const paymentRefunded = paymentStatus === "refunded";

  const paymentDotColor = paymentPaid
    ? "bg-emerald-500"
    : paymentFailed
      ? "bg-rose-500"
      : paymentRefunded
        ? "bg-purple-500"
        : "bg-amber-500";

  const paymentStatusStyle = paymentPaid
    ? "bg-emerald-50 text-emerald-900 border-emerald-200"
    : paymentFailed
      ? "bg-rose-50 text-rose-900 border-rose-200"
      : paymentRefunded
        ? "bg-purple-50 text-purple-900 border-purple-200"
        : "bg-amber-50 text-amber-900 border-amber-200";

  const paymentReady =
    order.payment_method === "cod" ||
    ["paid", "settled", "success"].includes(order.payment_status);

  const shippingDataComplete = Boolean(
    order.address &&
      order.address.trim().length >= 10 &&
      order.district &&
      order.city &&
      order.province &&
      order.destination_area_id &&
      order.courier_code &&
      order.courier_service &&
      order.warehouse_id
  );

  const canConfirm =
    order.shipping_status === "pending" &&
    paymentReady &&
    shippingDataComplete &&
    !order.provider_order_id;

  const statusOptions =
    order.shipping_status === "pending"
      ? ["pending", "cancelled"]
      : order.shipping_status === "cancelled"
      ? ["cancelled"]
      : ["processing", "shipped", "delivered", "returned", "cancelled"];

  const items = Array.isArray(order.items) ? order.items : [];
  const formattedAddress = [
    order.address,
    order.district,
    order.city,
    order.province,
    order.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
  const deliveryTotals = order.receiver_performance?.totals;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Navigation & Action Header */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <a
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-600 hover:text-slate-950 transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span>Kembali ke Daftar Order</span>
          </a>

          <div className="flex items-center gap-2">
            <EditCustomerDialog order={order} onUpdated={setOrder} />

            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void deleteOrder()}
              disabled={saving}
              className="h-8.5 px-3 rounded-lg font-extrabold text-xs"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              Hapus
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`gap-1.5 text-[10px] font-black uppercase tracking-wider ${paymentStatusStyle}`}>
                <span className={`size-1.5 shrink-0 rounded-full ${paymentDotColor}`} aria-hidden="true" />
                {paymentLabels[paymentStatus] || order.payment_status}
              </Badge>
              <Badge variant="outline" className={`gap-1.5 text-[10px] font-black uppercase tracking-wider ${shippingStatusBadges[order.shipping_status] || "bg-slate-100 text-slate-800"}`}>
                <span className={`size-1.5 shrink-0 rounded-full ${shippingStatusDots[order.shipping_status] || "bg-slate-400"}`} aria-hidden="true" />
                {shippingLabels[order.shipping_status] || order.shipping_status}
              </Badge>
              <Badge variant="outline" className={`text-[10px] font-black uppercase tracking-wider ${risk.style}`}>
                {risk.label}
              </Badge>
              <TrafficSourceBadge adClickIds={order.ad_click_ids} />
            </div>

            <div className="mt-2 flex items-center gap-3">
              <h2 className="font-mono text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                {order.order_number}
              </h2>
              <button
                type="button"
                onClick={() =>
                  void copyToClipboard(
                    order.order_number,
                    "invoice",
                    "Nomor order",
                  )
                }
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors"
                title="Salin nomor order"
              >
                {copiedTarget === "invoice" ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                <span>{copiedTarget === "invoice" ? "Tersalin" : "Salin"}</span>
              </button>
            </div>

            <p className="mt-1 text-xs text-slate-500">
              Dibuat pada {formatDate(order.created_at)} · ID Internal <span className="font-mono font-bold">{order.id}</span>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Status:</span>
              <Select
                value={order.shipping_status}
                disabled={saving}
                onValueChange={(value) => value && void updateStatus(value)}
              >
                <SelectTrigger className="h-10 min-w-44 text-xs font-bold">
                  <SelectValue>{shippingLabels[order.shipping_status] || order.shipping_status}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {shippingLabels[value] || value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {safePhone && (
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9.5 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
              >
                <Phone className="size-3.5" />
                <span>Chat WhatsApp</span>
              </a>
            )}
          </div>
        </div>

        {notice && (
          <div className="mt-3 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700 flex items-center justify-between">
            <span>{notice}</span>
            {saving && <RefreshCw className="size-3.5 animate-spin text-slate-500" />}
          </div>
        )}
      </section>

      {/* Main Grid: Left Column (Details) + Right Column (Summary & Actions) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Customer, Address & Products */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer & Address Card */}
          <Card className="rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4 sm:px-6">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <MapPin className="size-4 text-slate-600" />
                <span>Identitas Pemesan & Alamat Pengiriman</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Nama Lengkap</span>
                  <p className="mt-1 text-base font-black text-slate-950">{order.customer_name || "—"}</p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Nomor HP / WhatsApp</span>
                  <p className="mt-1 font-mono text-sm font-black text-slate-950">{safePhone || "—"}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Alamat Jalan
                  </span>
                  <button
                    type="button"
                    disabled={!formattedAddress}
                    onClick={() =>
                      void copyToClipboard(
                        formattedAddress,
                        "address",
                        "Alamat pelanggan",
                      )
                    }
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Salin alamat lengkap pelanggan"
                  >
                    {copiedTarget === "address" ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                    {copiedTarget === "address" ? "Tersalin" : "Salin alamat"}
                  </button>
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-800 leading-relaxed">
                  {order.address || "Alamat jalan belum diisi"}
                </p>
                <p className="mt-1 text-xs text-slate-500 font-medium">
                  {[order.district, order.city, order.province].filter(Boolean).join(", ")} {order.postal_code || ""}
                </p>
                {order.destination_area_id && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md">
                    <span>ID Area Mengantar:</span>
                    <strong className="font-bold text-slate-800">{order.destination_area_id}</strong>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Ordered Products Card */}
          <Card className="rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4 sm:px-6 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Package className="size-4 text-slate-600" />
                <span>Rincian Produk Dipesan</span>
              </CardTitle>
              <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {items.length} item
              </span>
            </CardHeader>
            <CardContent className="p-0 divide-y divide-slate-100">
              {items.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 font-semibold">
                  Rincian item produk belum tersedia.
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="min-w-0">
                      <h3 className="font-black text-sm text-slate-950 truncate">
                        {item.product_title || "Produk"}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 font-medium">
                        {item.variant_title || "Standard"}
                        {item.variant_sku ? ` · SKU: ${item.variant_sku}` : ""}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-sm text-slate-950">
                        {currency(item.unit_price * item.quantity)}
                      </p>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                        {item.quantity} x {currency(item.unit_price)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Mengantar Expedition & Tracking Card */}
          <Card className="rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4 sm:px-6">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Truck className="size-4 text-slate-600" />
                <span>Pengiriman & Ekspedisi Mengantar</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Kurir & Layanan</span>
                  <p className="mt-1 text-sm font-black text-slate-900">
                    {[order.courier_code, order.courier_service].filter(Boolean).join(" · ").toUpperCase() || "Belum dipilih"}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Nomor Resi</span>
                  <div className="mt-1 flex items-center gap-2">
                    <p className={`min-w-0 break-all font-mono text-sm font-black ${order.cnote_no ? "text-emerald-700" : "text-amber-700"}`}>
                      {order.cnote_no || "Belum diterbitkan"}
                    </p>
                    {order.cnote_no && (
                      <button
                        type="button"
                        onClick={() =>
                          void copyToClipboard(
                            order.cnote_no || "",
                            "tracking",
                            "Nomor resi",
                          )
                        }
                        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Salin resi"
                      >
                        {copiedTarget === "tracking" ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Gudang Pengirim</span>
                  <p className="mt-1 text-xs font-bold text-slate-800">
                    {order.warehouse_name || "Default Warehouse"}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">ID Provider Order</span>
                  <p className="mt-1 break-all font-mono text-xs font-bold text-slate-800">
                    {order.provider_order_id || "—"}
                  </p>
                </div>
              </div>

              {order.provider_dispatch_error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                  <p className="font-black text-rose-900">Gagal Push ke Mengantar:</p>
                  <p className="mt-0.5 font-normal leading-relaxed">{order.provider_dispatch_error}</p>
                </div>
              )}

              {order.shipping_status === "pending" ? (
                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={() => void pushToMengantar()}
                    disabled={saving || !canConfirm}
                    className="w-full h-11 text-xs font-bold rounded-xl"
                  >
                    {!paymentReady
                      ? "Menunggu Pembayaran Online"
                      : !shippingDataComplete
                      ? "Lengkapi Alamat & Ekspedisi"
                      : "Push Order ke Mengantar"}
                  </Button>
                </div>
              ) : (
                <a
                  href={`/admin/shipping?order=${encodeURIComponent(order.order_number)}`}
                  className={cn(buttonVariants({ variant: "outline" }), "w-full h-10 text-xs font-bold rounded-xl mt-2")}
                >
                  <ExternalLink className="mr-1.5 size-3.5" />
                  Lihat Manajemen Resi & Tracking
                </a>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Financials, Risk & CRM */}
        <div className="space-y-6">
          {/* Payment Summary Card */}
          <Card className="rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4 sm:px-6">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <CreditCard className="size-4 text-slate-600" />
                <span>Ringkasan Pembayaran</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Metode Pembayaran</span>
                <span className="font-bold text-slate-900">
                  {paymentMethodLabels[order.payment_method] || String(order.payment_method || "COD").toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-medium">Status Pembayaran</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${paymentStatusStyle}`}>
                  <span className={`size-1.5 shrink-0 rounded-full ${paymentDotColor}`} aria-hidden="true" />
                  {paymentLabels[paymentStatus] || order.payment_status}
                </span>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Subtotal Produk</span>
                  <span className="font-bold text-slate-900">
                    {currency(items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0))}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Biaya Ongkir</span>
                  <span className="font-bold text-slate-900">{currency(order.shipping_cost || 0)}</span>
                </div>

                {order.payment_method === "cod" && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Biaya COD (3%)</span>
                      <span className="font-bold text-slate-900">{currency(order.cod_service_fee || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">PPN 11% (dari Fee COD)</span>
                      <span className="font-bold text-slate-900">{currency(order.cod_service_fee_vat || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Penanggung Fee COD</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${order.cod_fee_bearer === "buyer" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>
                        {order.cod_fee_bearer === "buyer" ? "Pembeli" : "Seller"}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="border-t-2 border-slate-900 pt-3 flex justify-between items-center">
                <span className="font-black text-slate-950 text-sm">Total Tagihan</span>
                <span className="font-black text-emerald-700 text-lg">
                  {currency(order.total_amount || 0)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Receiver Risk Card */}
          <Card className="rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4 sm:px-6">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <ShieldAlert className="size-4 text-slate-600" />
                <span>Riwayat & Performa Penerima (RTS)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 sm:p-6 space-y-3 text-xs">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-3xl font-black text-slate-950">
                  {order.receiver_delivery_rate == null ? "—" : `${order.receiver_delivery_rate}%`}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${risk.style}`}>
                  {risk.label}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">Tingkat keberhasilan pengiriman historis nomor HP ini.</p>

              {deliveryTotals && typeof deliveryTotals === "object" && (
                <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-700 font-medium space-y-1 border border-slate-100">
                  <p>
                    <strong className="text-slate-950 font-bold">{deliveryTotals.delivered ?? 0}</strong> terkirim ·{" "}
                    <strong className="text-rose-700 font-bold">{deliveryTotals.rts ?? 0}</strong> RTS ·{" "}
                    <strong className="text-blue-700 font-bold">{deliveryTotals.inProgress ?? 0}</strong> diproses
                  </p>
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refreshRtsScoring()}
                disabled={saving}
                className="w-full h-9 text-xs font-bold rounded-xl mt-2 border-slate-200"
              >
                <RefreshCw className={cn("mr-1.5 size-3.5", saving && "animate-spin")} />
                {saving ? "Memeriksa..." : "Cek / Refresh Risiko RTS (Mengantar)"}
              </Button>
            </CardContent>
          </Card>

          {/* CRM WhatsApp Quick Actions */}
          <Card className="rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-4 sm:px-6 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <MessageSquare className="size-4 text-slate-600" />
                <span>CRM Follow-up WhatsApp</span>
              </CardTitle>
              <a href="/admin/settings/crm" className="text-[11px] font-bold text-emerald-700 hover:underline">
                Pengaturan
              </a>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              <CrmActionGroup
                crmUrls={allCrmUrls}
                clickedSteps={clickedSteps}
                onStepClick={(stepKey) => setClickedSteps((current) => ({ ...current, [stepKey]: true }))}
                size="md"
              />
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Salin pesan CRM
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CRM_STEPS.map((step) => {
                    const target = `crm-${step.key}`;
                    const copied = copiedTarget === target;
                    return (
                      <button
                        key={step.key}
                        type="button"
                        onClick={() =>
                          void copyToClipboard(
                            allCrmMessages[step.key] || "",
                            target,
                            `Template ${step.fullLabel}`,
                          )
                        }
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                        title={`Salin ${step.title}`}
                      >
                        {copied ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        {copied ? "Tersalin" : step.fullLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
