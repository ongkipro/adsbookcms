import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  EllipsisVertical,
  Landmark,
  Lock,
  RefreshCw,
  Settings2,
  WalletCards,
} from "lucide-react";
import SellerBankAccounts from "./SellerBankAccounts";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

type FeeBearer = "buyer" | "seller";

export type PaymentChannel = {
  code: string;
  label: string;
  feeDescription: string;
  lockReason?: string;
};

type SettingsResponse = {
  success?: boolean;
  error?: string;
  data?: {
    credentials?: {
      autolaris?: {
        api_key_configured?: boolean;
        api_key_masked?: string;
        webhook_secret_configured?: boolean;
        webhook_secret_masked?: string;
      };
    };
    store?: {
      payment_fee_bearer?: FeeBearer;
      cod_fee_bearer?: FeeBearer;
      is_cod_enabled?: boolean;
      is_autolaris_enabled?: boolean;
      disabled_autolaris_channels?: string[];
    };
  };
};

type PaymentMethod = {
  payment_method?: string;
  is_active?: boolean;
};

type Notice = { tone: "success" | "error" | "info"; text: string } | null;

function StatusBadge({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={ready
        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
        : "border-amber-200 bg-amber-50 text-amber-900"}
    >
      {ready ? <CheckCircle2 /> : <AlertCircle />}
      {children}
    </Badge>
  );
}

function InlineNotice({ notice }: { notice: Notice }) {
  if (!notice) return null;
  const styles = notice.tone === "error"
    ? "border-rose-200 bg-rose-50 text-rose-800"
    : notice.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-blue-200 bg-blue-50 text-blue-900";
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 text-xs font-medium ${styles}`}
      role={notice.tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {notice.text}
    </div>
  );
}

function FeeChoice({
  legend,
  description,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  description: string;
  value: FeeBearer;
  onChange: (value: FeeBearer) => void;
  disabled: boolean;
}) {
  const options: Array<{ value: FeeBearer; label: string; detail: string }> = [
    {
      value: "seller",
      label: "Seller",
      detail: "Fee dipotong dari hasil bersih toko.",
    },
    {
      value: "buyer",
      label: "Pembeli",
      detail: "Fee ditambahkan ke total tagihan.",
    },
  ];
  return (
    <fieldset className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
      <legend className="px-1 text-sm font-semibold text-card-foreground">{legend}</legend>
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`Penanggung fee ${legend}`}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              disabled={disabled}
              className={`flex min-h-16 items-start gap-3 rounded-lg border px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                selected
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`} aria-hidden="true">
                {selected && <CheckCircle2 className="size-3.5" />}
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span className="mt-1 block text-xs leading-4 text-muted-foreground">{option.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function PaymentSettings({
  callbackUrl,
  channels,
}: {
  callbackUrl: string;
  channels: PaymentChannel[];
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [codEnabled, setCodEnabled] = useState(false);
  const [autolarisEnabled, setAutolarisEnabled] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [callbackReady, setCallbackReady] = useState(false);
  const [apiMasked, setApiMasked] = useState("Belum dikonfigurasi");
  const [callbackMasked, setCallbackMasked] = useState("Belum dikonfigurasi");
  const [disabledChannels, setDisabledChannels] = useState<string[]>([]);
  const [paymentFeeBearer, setPaymentFeeBearer] = useState<FeeBearer>("buyer");
  const [codFeeBearer, setCodFeeBearer] = useState<FeeBearer>("buyer");
  const [savedFee, setSavedFee] = useState<{ payment: FeeBearer; cod: FeeBearer }>({
    payment: "buyer",
    cod: "buyer",
  });
  const [manualActiveCount, setManualActiveCount] = useState(0);
  const [credentialsOpen, setCredentialsOpen] = useState(true);
  const [banksOpen, setBanksOpen] = useState(false);
  const channelSaveSequence = useRef(0);

  const request = async (method: "PUT" | "POST", body: Record<string, unknown>) => {
    const response = await fetch("/api/admin/settings", {
      method,
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || "Pengaturan pembayaran gagal diproses.");
    }
    return payload;
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    setNotice(null);
    try {
      const [settingsResponse, methodsResponse] = await Promise.all([
        fetch("/api/admin/settings", { headers: { Accept: "application/json" } }),
        fetch("/api/payment-methods", { headers: { Accept: "application/json" } }),
      ]);
      const settings = (await settingsResponse.json().catch(() => ({}))) as SettingsResponse;
      const methods = await methodsResponse.json().catch(() => ({}));
      if (!settingsResponse.ok || settings.success === false || !settings.data?.store) {
        throw new Error(settings.error || "Pengaturan pembayaran gagal dimuat.");
      }
      if (!methodsResponse.ok || methods.success === false) {
        throw new Error(methods.error || "Metode pembayaran gagal dimuat.");
      }
      const store = settings.data.store;
      const credentials = settings.data.credentials?.autolaris;
      const nextPaymentFee = store.payment_fee_bearer === "seller" ? "seller" : "buyer";
      const nextCodFee = store.cod_fee_bearer === "seller" ? "seller" : "buyer";
      const nextApiReady = Boolean(credentials?.api_key_configured);
      const nextCallbackReady = Boolean(credentials?.webhook_secret_configured);
      setCodEnabled(Boolean(store.is_cod_enabled));
      setAutolarisEnabled(Boolean(store.is_autolaris_enabled));
      setApiReady(nextApiReady);
      setCallbackReady(nextCallbackReady);
      setApiMasked(credentials?.api_key_masked || "Belum dikonfigurasi");
      setCallbackMasked(credentials?.webhook_secret_masked || "Belum dikonfigurasi");
      setDisabledChannels(Array.isArray(store.disabled_autolaris_channels) ? store.disabled_autolaris_channels : []);
      setPaymentFeeBearer(nextPaymentFee);
      setCodFeeBearer(nextCodFee);
      setSavedFee({ payment: nextPaymentFee, cod: nextCodFee });
      const methodList = Array.isArray(methods.data) ? methods.data as PaymentMethod[] : [];
      setManualActiveCount(methodList.filter((item) => item.payment_method === "manual_transfer" && item.is_active).length);
      setCredentialsOpen(!(nextApiReady && nextCallbackReady));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Pengaturan pembayaran gagal dimuat.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const usableChannels = useMemo(() => channels.filter((channel) => !channel.lockReason), [channels]);
  const activeChannelCount = autolarisEnabled && apiReady
    ? usableChannels.filter((channel) => !disabledChannels.includes(channel.code)).length
    : 0;
  const providerCount = Number(codEnabled) + Number(autolarisEnabled && apiReady);
  const feeDirty = paymentFeeBearer !== savedFee.payment || codFeeBearer !== savedFee.cod;
  const mutationsDisabled = loading || Boolean(loadError) || Boolean(busy);

  const saveMaster = async (kind: "cod" | "autolaris", nextValue: boolean) => {
    const previousCod = codEnabled;
    const previousAutoLaris = autolarisEnabled;
    const nextCod = kind === "cod" ? nextValue : codEnabled;
    const nextAutoLaris = kind === "autolaris" ? nextValue : autolarisEnabled;
    setCodEnabled(nextCod);
    setAutolarisEnabled(nextAutoLaris);
    setBusy("master");
    setNotice(null);
    try {
      const payload = await request("PUT", {
        action: "save-payment-toggles",
        is_cod_enabled: nextCod,
        is_autolaris_enabled: nextAutoLaris,
      });
      setNotice({ tone: "success", text: payload.message || "Status metode pembayaran diperbarui." });
    } catch (error) {
      setCodEnabled(previousCod);
      setAutolarisEnabled(previousAutoLaris);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Status gagal disimpan." });
    } finally {
      setBusy("");
    }
  };

  const saveChannel = async (code: string, checked: boolean) => {
    const previous = disabledChannels;
    const next = checked
      ? previous.filter((item) => item !== code)
      : Array.from(new Set([...previous, code]));
    const sequence = ++channelSaveSequence.current;
    setDisabledChannels(next);
    setBusy(`channel:${code}`);
    setNotice(null);
    try {
      const payload = await request("PUT", {
        action: "save-autolaris-channels",
        disabled_autolaris_channels: next,
      });
      if (sequence !== channelSaveSequence.current) return;
      const persisted = payload.data?.disabled_autolaris_channels;
      setDisabledChannels(Array.isArray(persisted) ? persisted : next);
      setNotice({ tone: "success", text: payload.message || "Status channel diperbarui." });
    } catch (error) {
      if (sequence === channelSaveSequence.current) setDisabledChannels(previous);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Status channel gagal disimpan." });
    } finally {
      if (sequence === channelSaveSequence.current) setBusy("");
    }
  };

  const saveFeePolicy = async () => {
    setBusy("fee");
    setNotice(null);
    const saving = { payment: paymentFeeBearer, cod: codFeeBearer };
    try {
      const payload = await request("PUT", {
        action: "save-payment-fee-policy",
        payment_fee_bearer: saving.payment,
        cod_fee_bearer: saving.cod,
      });
      setSavedFee(saving);
      setNotice({ tone: "success", text: payload.message || "Kebijakan biaya disimpan." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Kebijakan biaya gagal disimpan." });
    } finally {
      setBusy("");
    }
  };

  const runLocalCheck = async (action: "test-autolaris" | "test-autolaris-channels") => {
    setBusy(action);
    setNotice(null);
    try {
      const payload = await request("POST", { action });
      setNotice({ tone: "info", text: payload.message || "Pemeriksaan konfigurasi lokal selesai." });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Konfigurasi gagal diperiksa." });
    } finally {
      setBusy("");
    }
  };

  const copyCallback = async () => {
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setNotice({ tone: "success", text: "URL callback disalin." });
    } catch {
      setNotice({ tone: "error", text: "URL callback tidak dapat disalin. Salin langsung dari kolom URL." });
    }
  };

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 py-2">
          <InlineNotice notice={{ tone: "error", text: loadError }} />
          <Button type="button" variant="outline" size="xl" onClick={() => void load()}>
            <RefreshCw /> Coba lagi
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5" aria-busy={loading || Boolean(busy)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="outline" className="h-7 gap-1.5 bg-card px-3 text-xs">
          {loading ? <RefreshCw className="animate-spin" /> : <CheckCircle2 className="text-emerald-600" />}
          {loading ? "Memuat konfigurasi…" : `${providerCount} provider checkout aktif`}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="xl" disabled={loading} aria-label="Buka aksi pembayaran">
              <EllipsisVertical /> Aksi
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel>Pembayaran</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => window.location.assign("/admin/balance")}>Buka rekonsiliasi</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.location.assign("/admin/profile")}>Kelola kredensial API</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void load()}>Muat ulang konfigurasi</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <InlineNotice notice={notice} />

      <Card>
        <CardHeader className="border-b">
          <CardTitle as="h3" className="font-semibold">Status metode pembayaran</CardTitle>
          <CardDescription>Metode aktif otomatis tersedia pada checkout pembeli.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="flex min-h-36 flex-col justify-between gap-4 rounded-xl border border-border bg-muted/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <StatusBadge ready={codEnabled}>{loading ? "Memuat" : codEnabled ? "Aktif" : "Nonaktif"}</StatusBadge>
                <h4 className="mt-3 font-semibold text-card-foreground">COD</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Tunai saat pesanan tiba melalui kurir.</p>
              </div>
              <Switch
                checked={codEnabled}
                onCheckedChange={(checked) => void saveMaster("cod", checked)}
                disabled={mutationsDisabled}
                aria-label="Aktifkan pembayaran COD"
              />
            </div>
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">Fee: <strong className="text-foreground">3% + PPN · {codFeeBearer === "buyer" ? "Pembeli" : "Seller"}</strong></p>
          </div>

          <div className="flex min-h-36 flex-col justify-between gap-4 rounded-xl border border-border bg-muted/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <StatusBadge ready={apiReady && autolarisEnabled}>
                  {loading ? "Memuat" : !apiReady ? "Belum siap" : autolarisEnabled ? "Aktif" : "Nonaktif"}
                </StatusBadge>
                <h4 className="mt-3 font-semibold text-card-foreground">AutoLaris</h4>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">QRIS dan Virtual Account.</p>
              </div>
              <Switch
                checked={autolarisEnabled}
                onCheckedChange={(checked) => void saveMaster("autolaris", checked)}
                disabled={mutationsDisabled || !apiReady}
                aria-label="Aktifkan AutoLaris"
              />
            </div>
            <p className="border-t border-border pt-3 text-xs text-muted-foreground">Channel: <strong className="text-foreground">{activeChannelCount}/{channels.length} aktif</strong></p>
          </div>

          <div className="flex min-h-36 flex-col justify-between gap-4 rounded-xl border border-border bg-muted/25 p-4">
            <div>
              <StatusBadge ready={manualActiveCount > 0}>{loading ? "Memuat" : manualActiveCount > 0 ? "Aktif" : "Belum tersedia"}</StatusBadge>
              <h4 className="mt-3 font-semibold text-card-foreground">Transfer manual</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Rekening tujuan milik toko.</p>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => setBanksOpen(true)} disabled={loading}>
              <Landmark /> Kelola {manualActiveCount} rekening aktif
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle as="h3" className="font-semibold">Channel AutoLaris</CardTitle>
          <CardDescription>Hanya channel aktif yang ditampilkan di checkout.</CardDescription>
          <CardAction className="flex items-center gap-2">
            <Badge variant="outline">{activeChannelCount} aktif · {channels.length - activeChannelCount} tidak aktif</Badge>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Periksa konfigurasi channel"
              title="Periksa konfigurasi channel"
              onClick={() => void runLocalCheck("test-autolaris-channels")}
              disabled={mutationsDisabled}
            >
              <RefreshCw className={busy === "test-autolaris-channels" ? "animate-spin" : ""} />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0 sm:px-4">
          <Table className="payment-channel-table">
            <TableHeader>
              <TableRow>
                <TableHead>Metode</TableHead>
                <TableHead>Biaya</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Checkout</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((channel) => {
                const locked = Boolean(channel.lockReason);
                const storeDisabled = disabledChannels.includes(channel.code);
                const active = !locked && !storeDisabled && autolarisEnabled && apiReady;
                const status = locked
                  ? "Tidak aktif di provider"
                  : !apiReady
                    ? "API belum siap"
                    : !autolarisEnabled
                      ? "AutoLaris nonaktif"
                      : storeDisabled
                        ? "Dinonaktifkan toko"
                        : "Aktif di checkout";
                return (
                  <TableRow key={channel.code} className={locked ? "bg-muted/40 hover:bg-muted/40" : ""}>
                    <TableCell data-label="Metode" className="payment-channel-method whitespace-normal">
                      <div className="font-medium text-foreground">{channel.label}</div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{channel.code}</div>
                    </TableCell>
                    <TableCell data-label="Biaya" className="whitespace-normal text-muted-foreground">{channel.feeDescription}</TableCell>
                    <TableCell data-label="Status" className="whitespace-normal">
                      <Badge
                        id={`channel-reason-${channel.code}`}
                        variant="outline"
                        className={active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : locked
                            ? "border-border bg-muted text-muted-foreground"
                            : "border-amber-200 bg-amber-50 text-amber-900"}
                      >
                        {locked ? <Lock /> : active ? <CheckCircle2 /> : <AlertCircle />}
                        {status}
                      </Badge>
                      {locked && <p className="mt-2 text-xs leading-5 text-muted-foreground">{channel.lockReason}</p>}
                    </TableCell>
                    <TableCell data-label="Checkout" className="payment-channel-switch text-right">
                      <Switch
                        checked={!locked && !storeDisabled}
                        onCheckedChange={(checked) => void saveChannel(channel.code, checked)}
                        disabled={mutationsDisabled || locked}
                        aria-label={locked ? `${channel.label} — tidak aktif di provider` : `Tampilkan ${channel.label} di checkout`}
                        aria-describedby={`channel-reason-${channel.code}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle as="h3" className="font-semibold">Kebijakan biaya transaksi</CardTitle>
          <CardDescription>Tentukan apakah fee dibayar pembeli atau dipotong dari hasil seller.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FeeChoice
            legend="Pembayaran online"
            description="QRIS 0,7%; VA BCA Rp6.500; VA lain Rp3.000 per transaksi."
            value={paymentFeeBearer}
            onChange={setPaymentFeeBearer}
            disabled={mutationsDisabled}
          />
          <FeeChoice
            legend="COD"
            description="3% dari harga + ongkir, ditambah PPN 11% atas biaya layanan."
            value={codFeeBearer}
            onChange={setCodFeeBearer}
            disabled={mutationsDisabled}
          />
        </CardContent>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-4 pt-4">
          <span className="text-xs text-muted-foreground">{feeDirty ? "Ada perubahan belum disimpan" : "Kebijakan sudah tersimpan"}</span>
          <Button type="button" size="xl" onClick={() => void saveFeePolicy()} disabled={!feeDirty || mutationsDisabled}>
            <WalletCards /> {busy === "fee" ? "Menyimpan…" : "Simpan kebijakan"}
          </Button>
        </div>
      </Card>

      <Collapsible open={credentialsOpen} onOpenChange={setCredentialsOpen}>
        <Card>
          <CardHeader className="border-b">
            <CardTitle as="h3" className="font-semibold">Kesiapan AutoLaris & callback</CardTitle>
            <CardDescription>Validasi lokal untuk API key, callback secret, dan URL webhook.</CardDescription>
            <CardAction className="flex items-center gap-2">
              <StatusBadge ready={apiReady && callbackReady}>{Number(apiReady) + Number(callbackReady)}/2 siap</StatusBadge>
              <CollapsibleTrigger
                className="inline-flex size-11 items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Buka detail kesiapan AutoLaris"
              >
                <ChevronDown className={`size-4 transition-transform ${credentialsOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
            </CardAction>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-1">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div className="rounded-xl border border-border bg-muted/25 p-4">
                  <p className="text-xs font-medium text-muted-foreground">AutoLaris API key</p>
                  <p className="mt-2 truncate font-mono text-sm text-foreground">{loading ? "Memuat…" : apiMasked}</p>
                  <StatusBadge ready={apiReady}>{apiReady ? "Tersimpan" : "Belum diatur"}</StatusBadge>
                </div>
                <div className="rounded-xl border border-border bg-muted/25 p-4">
                  <p className="text-xs font-medium text-muted-foreground">Callback secret</p>
                  <p className="mt-2 truncate font-mono text-sm text-foreground">{loading ? "Memuat…" : callbackMasked}</p>
                  <StatusBadge ready={callbackReady}>{callbackReady ? "Tersimpan" : "Belum diatur"}</StatusBadge>
                </div>
                <div className="rounded-xl border border-border bg-muted/25 p-4">
                  <label htmlFor="autolaris-callback-url" className="text-xs font-medium text-muted-foreground">Webhook callback URL</label>
                  <div className="mt-2 flex gap-2">
                    <Input id="autolaris-callback-url" value={callbackUrl} readOnly className="h-11 min-w-0 font-mono text-xs" />
                    <Button type="button" variant="outline" size="icon-lg" className="size-11" onClick={() => void copyCallback()} aria-label="Salin URL callback">
                      <Clipboard />
                    </Button>
                  </div>
                </div>
              </div>
              {!callbackReady && (
                <InlineNotice notice={{ tone: "info", text: "Callback secret diatur melalui environment server, bukan dari browser. Checkout online dapat aktif, tetapi rekonsiliasi callback belum siap sampai secret tersedia." }} />
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="xl" onClick={() => void runLocalCheck("test-autolaris")} disabled={mutationsDisabled || !apiReady}>
                  <RefreshCw className={busy === "test-autolaris" ? "animate-spin" : ""} /> Periksa kesiapan lokal
                </Button>
                <Button type="button" variant="outline" size="xl" onClick={() => window.location.assign("/admin/profile")}>
                  <Settings2 /> Kelola kredensial API
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Collapsible open={banksOpen} onOpenChange={setBanksOpen}>
        <Card id="rekening-bank-section" className="scroll-mt-20">
          <CardHeader className="border-b">
            <CardTitle as="h3" className="font-semibold">Rekening transfer manual</CardTitle>
            <CardDescription>Rekening aktif langsung tersedia di checkout sesuai urutan.</CardDescription>
            <CardAction className="flex items-center gap-2">
              <Badge variant="outline">{manualActiveCount} aktif</Badge>
              <CollapsibleTrigger
                className="inline-flex size-11 items-center justify-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Buka pengaturan rekening transfer"
              >
                <ChevronDown className={`size-4 transition-transform ${banksOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
            </CardAction>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <SellerBankAccounts onAccountsChange={(accounts) => {
                const active = accounts.filter((account) => Boolean(account.is_active)).length;
                setManualActiveCount(active);
                if (accounts.length === 0) setBanksOpen(true);
              }} />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <style>{`
        @media (max-width: 767px) {
          .payment-channel-table [data-slot="table-header"] { display: none; }
          .payment-channel-table,
          .payment-channel-table [data-slot="table-body"] { display: block; width: 100%; }
          .payment-channel-table [data-slot="table-row"] {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: .75rem;
            margin: .75rem;
            padding: 1rem;
            border: 1px solid var(--border);
            border-radius: var(--radius);
          }
          .payment-channel-table [data-slot="table-cell"] { display: block; padding: 0; white-space: normal; }
          .payment-channel-table .payment-channel-method { grid-column: 1; grid-row: 1; }
          .payment-channel-table .payment-channel-switch { grid-column: 2; grid-row: 1; align-self: start; }
          .payment-channel-table [data-label="Biaya"],
          .payment-channel-table [data-label="Status"] { grid-column: 1 / -1; }
          .payment-channel-table [data-label="Biaya"]::before {
            content: "Biaya: ";
            font-weight: 600;
            color: var(--foreground);
          }
        }
      `}</style>
    </div>
  );
}
