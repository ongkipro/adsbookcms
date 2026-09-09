export const AUTOLARIS_CHANNELS = [
  "QRIS",
  "VABCA",
  "VAMANDIRI",
  "VABNI",
  "VABRI",
  "VAPERMATA",
  "VABSI",
  "VACIMB",
  "VADANAMON",
] as const;

export type AutoLarisChannel = (typeof AUTOLARIS_CHANNELS)[number];

export const AUTOLARIS_CHECKOUT_CHANNELS = [
  "QRIS",
  "VABCA",
  "VAMANDIRI",
  "VABNI",
  "VABRI",
  "VAPERMATA",
  "VABSI",
  "VACIMB",
  "VADANAMON",
] as const satisfies readonly AutoLarisChannel[];

export type AutoLarisCheckoutChannel =
  (typeof AUTOLARIS_CHECKOUT_CHANNELS)[number];

export function isAutoLarisCheckoutChannel(value: unknown): value is AutoLarisCheckoutChannel {
  return (
    typeof value === "string" &&
    (AUTOLARIS_CHECKOUT_CHANNELS as readonly string[]).includes(value)
  );
}

export const AUTOLARIS_LOCKED_CHANNEL_REASONS = {
  VABSI: "Tidak aktif di provider.",
  VACIMB: "Tidak aktif di provider.",
  VADANAMON: "Tidak aktif di provider.",
} as const satisfies Partial<Record<AutoLarisCheckoutChannel, string>>;

export function autoLarisChannelLockReason(code: string): string | undefined {
  return AUTOLARIS_LOCKED_CHANNEL_REASONS[
    code as keyof typeof AUTOLARIS_LOCKED_CHANNEL_REASONS
  ];
}

export function resolveDisabledAutoLarisChannels(value: unknown): AutoLarisChannel[] {
  const requested = new Set(
    Array.isArray(value)
      ? value.map((code) => String(code).trim().toUpperCase())
      : String(value || "")
          .split(",")
          .map((code) => code.trim().toUpperCase()),
  );

  return AUTOLARIS_CHANNELS.filter(
    (code) => requested.has(code) || Boolean(autoLarisChannelLockReason(code)),
  );
}

export const AUTOLARIS_CHANNEL_OPTIONS: ReadonlyArray<{
  code: AutoLarisCheckoutChannel;
  label: string;
  description: string;
  paymentMethod: "qris" | "bank_transfer";
}> = [
  { code: "QRIS", label: "QRIS", description: "Scan QR dari aplikasi bank atau e-wallet", paymentMethod: "qris" },
  { code: "VABCA", label: "Virtual Account BCA", description: "Bayar melalui BCA Virtual Account", paymentMethod: "bank_transfer" },
  { code: "VAMANDIRI", label: "Virtual Account Mandiri", description: "Bayar melalui Mandiri Virtual Account", paymentMethod: "bank_transfer" },
  { code: "VABNI", label: "Virtual Account BNI", description: "Bayar melalui BNI Virtual Account", paymentMethod: "bank_transfer" },
  { code: "VABRI", label: "Virtual Account BRI", description: "Bayar melalui BRI Virtual Account", paymentMethod: "bank_transfer" },
  { code: "VAPERMATA", label: "Virtual Account Permata", description: "Bayar melalui Permata Virtual Account", paymentMethod: "bank_transfer" },
  { code: "VABSI", label: "Virtual Account BSI", description: "Bayar melalui BSI Virtual Account", paymentMethod: "bank_transfer" },
  { code: "VACIMB", label: "Virtual Account CIMB Niaga", description: "Bayar melalui CIMB Niaga Virtual Account", paymentMethod: "bank_transfer" },
  { code: "VADANAMON", label: "Virtual Account Danamon", description: "Bayar melalui Danamon Virtual Account", paymentMethod: "bank_transfer" },
];


/**
 * AutoLaris creates the payment instruction and its dashboard order in one
 * request through `/api/h2h/submit`. Physical fulfilment remains Mengantar's;
 * the install supplies the provider-specific mirror area ids and fixed
 * `courir_id: 1` separately from Mengantar's identifiers.
 *
 * Contract verified against the provider's published Postman collection on
 * 2026-09-02:
 *
 *   POST /api/h2h/submit          -> { rc, ket, data: { transaction_id,
 *                                      biaya_admin, total, payment_info } }
 *   POST /api/h2h/advice          -> { rc, ket, data: { awb } }
 *   GET  /api/h2h/list_payment    -> { rc, ket, data: [ { channel_code, ... } ] }
 *
 * `reff_id` is digits-only; payment instructions are nested under
 * `payment_info` for both QRIS and VA channels.
 */
export type AutoLarisPayment = {
  transactionId: string;
  virtualAccount?: string;
  qr?: string;
  paymentCode?: string;
  url?: string;
  amount: number;
  admin: number;
  total: number;
  expiresAt?: string;
};

export type AutoLarisCredentialVerification = {
  verified: boolean;
  verificationSupported: boolean;
  message: string;
  channels?: string[];
};

/**
 * A read of one transaction's settlement state.
 *
 * AutoLaris' Advice contract uses `02/PENDING` for an unpaid instruction and
 * `00` plus an explicit success status for a settled one. Any other shape stays
 * unproven and cannot move money-bearing state.
 */
export type AutoLarisPaymentInquiry = {
  code: string;
  status: string;
  awb?: string;
  settlement: "pending" | "paid" | "unproven";
};

export const AUTOLARIS_PENDING_CODE = "02";
export const AUTOLARIS_PAID_CODE = "00";
/**
 * Words that may settle a payment, and the two that were removed.
 *
 * The provider's own documentation (`ongkipro/autolaris`,
 * `docs/guides/payment-gateway.md` §6) is explicit: *"`SUCCESS`/`BERHASIL`
 * terlalu generik dan `DELIVERED` adalah status pengiriman; ketiganya tidak
 * boleh ditafsirkan sebagai lunas"* — and only an explicit settlement status
 * confirmed by the provider may mark a transaction and its order paid.
 *
 * `SUCCESS` and `BERHASIL` were in this set. They are now gone, because §7 of
 * the same guide settles what `rc: "00"` actually means: the **API call**
 * succeeded, not the payment. A `00` answered with a generic success word is
 * therefore ambiguous between "advice request succeeded" and "payment
 * settled" — and resolving that ambiguity in favour of paid marks an order paid
 * that may not be, which is the one direction this path must never fail in.
 *
 * What remains is unambiguous settlement vocabulary: nothing generic, nothing
 * from the shipping lifecycle. The provider has still published no complete
 * settlement mapping, so these three are a conservative reading rather than a
 * confirmed contract — which is exactly why every `rc: "00"` that does not
 * match is captured as evidence rather than discarded
 * (`reconcileAutoLarisPaymentStatuses`), and why manual reconciliation remains
 * the documented fallback.
 */
const AUTOLARIS_PAID_STATUSES = new Set([
  "PAID",
  "SETTLED",
  "LUNAS",
]);

type AutoLarisResponse = {
  rc?: string;
  ket?: string;
  data?: {
    trx_id?: string;
    transaction_id?: string;
    virtual_account?: string;
    qr?: string;
    payment_code?: string;
    url?: string;
    awb?: string;
    amount?: number;
    admin?: number;
    biaya_admin?: number;
    total?: number;
    payment_info?: {
      va?: string;
      qr?: string;
      url?: string;
      expired?: string;
    };
  };
};

/**
 * `payment_info.expired` arrives without an offset, and is read as Jakarta time.
 *
 * That is an **assumption, not a documented fact**. The provider's own
 * reference lists the timezone of `expired` under "Batas kontrak" — the things
 * the published collection does not state (`ongkipro/autolaris`,
 * `docs/reference/h2h-api.md`). This comment previously claimed the opposite,
 * that Jakarta time was documented, which is the kind of guess-dressed-as-fact
 * that survives precisely because it reads as settled.
 *
 * `+07:00` is the reasonable reading for an Indonesian provider quoting local
 * time, and it is what ships. The consequence if it is wrong is worth naming:
 * were the provider to send UTC, every instruction would be treated as expiring
 * seven hours later than it does, and `/payment` would keep presenting a dead
 * virtual account as live. An unparseable value returns `undefined` and the
 * instruction simply carries no expiry, which fails in the safe direction.
 *
 * Confirm with AutoLaris before go-live, as the reference itself instructs.
 */
export function parseAutoLarisExpiry(value: unknown): string | undefined {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+07:00`,
  );
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function parseAutoLarisPaymentResponse(
  payload: unknown,
  trustedRequestAmount?: number,
): AutoLarisPayment {
  if (!payload || typeof payload !== "object") {
    throw new Error("AutoLaris mengembalikan respons yang tidak valid.");
  }
  const response = payload as AutoLarisResponse;
  if (response.rc !== "00" || !response.data) {
    throw new Error(
      nonEmpty(response.ket) ||
        `AutoLaris menolak permintaan (rc=${response.rc || "unknown"}).`,
    );
  }

  const transactionId = nonEmpty(
    response.data.transaction_id || response.data.trx_id,
  );
  const amount = Number(response.data.amount ?? trustedRequestAmount);
  const admin = Number(response.data.biaya_admin ?? response.data.admin);
  const total = Number(response.data.total);
  if (
    !transactionId ||
    !Number.isFinite(amount) ||
    !Number.isFinite(admin) ||
    !Number.isFinite(total)
  ) {
    throw new Error("AutoLaris mengembalikan data pembayaran yang tidak lengkap.");
  }

  const expiresAt = parseAutoLarisExpiry(response.data.payment_info?.expired);
  return {
    transactionId,
    virtualAccount: nonEmpty(
      response.data.payment_info?.va || response.data.virtual_account,
    ),
    qr: nonEmpty(response.data.payment_info?.qr || response.data.qr),
    paymentCode: nonEmpty(response.data.payment_code),
    url: nonEmpty(response.data.payment_info?.url || response.data.url),
    amount,
    admin,
    total,
    ...(expiresAt ? { expiresAt } : {}),
  };
}

const DEFAULT_BASE_URL = "https://api-h2h.autolaris.com";
const DEFAULT_TIMEOUT_MS = 10_000;

function nonEmpty(value: string | undefined) {
  return value?.trim() || undefined;
}

function requiredText(value: string, field: string, max: number) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new Error(`Data ${field} AutoLaris tidak lengkap.`);
  }
  return normalized;
}

function requiredDigits(value: string, field: string, max: number) {
  const normalized = requiredText(value, field, max);
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Data ${field} AutoLaris harus berupa angka.`);
  }
  return normalized;
}

function requiredAreaId(value: string, field: string) {
  const normalized = requiredDigits(value, field, 20);
  const areaId = Number(normalized);
  if (!Number.isSafeInteger(areaId) || areaId <= 0) {
    throw new Error(`Data ${field} AutoLaris tidak valid.`);
  }
  return areaId;
}

function requiredPhone(value: string, field: string) {
  const phone = value.replace(/\D/g, "");
  if (phone.length < 8 || phone.length > 20) {
    throw new Error(`Data ${field} AutoLaris tidak valid.`);
  }
  return phone;
}

function requiredEmail(value: string) {
  const email = requiredText(value, "email pembeli", 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Data email pembeli AutoLaris tidak valid.");
  }
  return email;
}

function requiredCallbackUrl(value: string) {
  const callbackUrl = requiredText(value, "callback", 500);
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error("Data callback AutoLaris tidak valid.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Data callback AutoLaris tidak valid.");
  }
  return parsed.toString();
}

function requiredPositiveIntString(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Data ${field} AutoLaris harus bilangan bulat positif.`);
  }
  return String(value);
}

function nonNegativeIntString(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Data ${field} AutoLaris tidak boleh negatif.`);
  }
  return String(value);
}

export type AutoLarisOrderDetail = {
  name: string;
  qty: number;
  unitPrice: number;
};

/**
 * Create Order / `POST /api/h2h/submit`. The install's accepted AutoLaris
 * contract assigns `courirId: 1` and provider-specific origin/destination area
 * ids. This record supplies the payment instruction; this CMS still dispatches
 * physical fulfilment only through its explicit Mengantar operator action. For
 * prepaid QRIS/VA, `codValue` is 0 and `grandTotal` is the committed order total.
 *
 * The `/submit` response shape is contract-verified against the provider's
 * published collection; `createOrder` maps its nested payment instructions.
 */
export type AutoLarisCreateOrderInput = {
  /** Digits only, at most 30 — same rule the provider enforces on reff_id. */
  reffId: string;
  channelCode: AutoLarisCheckoutChannel;
  /** Defaults to the install's accepted operational assignment, 1. */
  courirId?: number;
  origin: string;
  destination: string;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  shipperName: string;
  shipperPhone: string;
  shipperEmail: string;
  shipperAddress: string;
  receiverName: string;
  receiverPhone: string;
  receiverEmail: string;
  receiverAddress: string;
  grandTotal: number;
  /** 0 for prepaid QRIS/VA — the balance is already in. */
  codValue?: number;
  callbackUrl?: string;
  remark?: string;
  orderDetails: AutoLarisOrderDetail[];
};

export function buildAutoLarisCreateOrderPayload(input: AutoLarisCreateOrderInput) {
  if (!Array.isArray(input.orderDetails) || input.orderDetails.length === 0) {
    throw new Error("Rincian order AutoLaris tidak boleh kosong.");
  }
  const courirId = input.courirId ?? 1;
  if (!Number.isSafeInteger(courirId) || courirId <= 0) {
    throw new Error("courir_id AutoLaris harus bilangan bulat positif.");
  }

  return {
    reff_id: requiredDigits(input.reffId, "referensi", 30),
    channel_code: requiredText(input.channelCode, "channel order", 30),
    courir_id: courirId,
    origin: requiredAreaId(input.origin, "origin"),
    destination: requiredAreaId(input.destination, "destination"),
    weight: nonNegativeIntString(input.weight ?? 1000, "berat"),
    length: nonNegativeIntString(input.length ?? 1, "panjang"),
    width: nonNegativeIntString(input.width ?? 1, "lebar"),
    height: nonNegativeIntString(input.height ?? 1, "tinggi"),
    shipper_name: requiredText(input.shipperName, "nama pengirim", 100),
    shipper_phone: requiredPhone(input.shipperPhone, "telepon pengirim"),
    shipper_email: requiredEmail(input.shipperEmail),
    shipper_address: requiredText(input.shipperAddress, "alamat pengirim", 255),
    receiver_name: requiredText(input.receiverName, "nama penerima", 100),
    receiver_phone: requiredPhone(input.receiverPhone, "telepon penerima"),
    receiver_email: requiredEmail(input.receiverEmail),
    receiver_address: requiredText(input.receiverAddress, "alamat penerima", 255),
    callback_url: input.callbackUrl ? requiredCallbackUrl(input.callbackUrl) : "",
    grand_total: requiredPositiveIntString(input.grandTotal, "grand total"),
    cod_value: nonNegativeIntString(input.codValue ?? 0, "nilai COD"),
    longitude: "",
    latitude: "",
    remark: (input.remark ?? "").trim().slice(0, 255),
    order_details: input.orderDetails.map((item) => ({
      name: requiredText(item.name, "nama item", 100),
      qty: requiredPositiveIntString(item.qty, "qty item"),
      unit_price: nonNegativeIntString(item.unitPrice, "harga item"),
    })),
  };
}

export class AutoLarisClient {
  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(
    apiKey: string,
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
  }

  private async request(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<AutoLarisResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      let payload: AutoLarisResponse;
      try {
        payload = (await response.json()) as AutoLarisResponse;
      } catch {
        throw new Error("AutoLaris mengembalikan respons yang tidak valid.");
      }
      if (!response.ok) {
        throw new Error(
          nonEmpty(payload.ket) || `AutoLaris gagal (${response.status}).`,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("AutoLaris timeout.");
      }
      throw error instanceof Error
        ? error
        : new Error("Gagal menghubungi AutoLaris.");
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Create one dashboard order and its single QRIS/VA instruction. */
  async createOrder(
    input: AutoLarisCreateOrderInput,
  ): Promise<AutoLarisPayment> {
    if (autoLarisChannelLockReason(input.channelCode)) {
      throw new Error("Channel pembayaran tidak aktif di provider.");
    }
    const payload = await this.request(
      "/api/h2h/submit",
      buildAutoLarisCreateOrderPayload(input),
    );
    return parseAutoLarisPaymentResponse(payload, input.grandTotal);
  }

  /**
   * Reads one transaction's settlement state. This method never mutates local
   * payment state; callers decide whether an explicit paid result may do so.
   */
  async inquirePayment(transactionId: string): Promise<AutoLarisPaymentInquiry> {
    const payload = await this.request("/api/h2h/advice", {
      // Echoed back exactly as the provider issued it. Every observed `trx_id`
      // is numeric, but validating the provider's own identifier against our
      // guess of its shape would only break when the provider changes it.
      transaction_id: requiredText(transactionId, "id transaksi", 64),
    });
    const code = String(payload.rc || "").trim();
    const status = String(payload.ket || "").trim();
    const normalizedStatus = status.toUpperCase();
    const paid =
      code === AUTOLARIS_PAID_CODE &&
      AUTOLARIS_PAID_STATUSES.has(normalizedStatus);
    return {
      code,
      status,
      awb: nonEmpty(payload.data?.awb),
      settlement:
        paid
          ? "paid"
          : code === AUTOLARIS_PENDING_CODE
            ? "pending"
            : "unproven",
    };
  }

  /**
   * Confirms the key against the provider's read-only channel catalogue. This
   * is the one AutoLaris endpoint that reads without creating anything.
   */
  async verifyCredentials(): Promise<AutoLarisCredentialVerification> {
    if (!this.apiKey) {
      return {
        verified: false,
        verificationSupported: true,
        message: "API Key AutoLaris belum dikonfigurasi.",
      };
    }

    try {
      const payload = await this.request("/api/h2h/list_payment");
      if (payload.rc !== "00" || !Array.isArray(payload.data)) {
        return {
          verified: false,
          verificationSupported: true,
          message:
            nonEmpty(payload.ket) ||
            "AutoLaris menolak API Key yang tersimpan.",
        };
      }
      const channels = (payload.data as Array<{ channel_code?: string }>)
        .map((channel) => String(channel.channel_code || "").trim())
        .filter(Boolean);
      return {
        verified: true,
        verificationSupported: true,
        channels,
        message: `Koneksi AutoLaris aktif: ${channels.length} channel tersedia.`,
      };
    } catch (error) {
      return {
        verified: false,
        verificationSupported: true,
        message:
          error instanceof Error && error.message
            ? error.message
            : "Koneksi AutoLaris gagal.",
      };
    }
  }
}
