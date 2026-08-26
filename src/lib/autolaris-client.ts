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
 * AutoLaris is this repository's payment gateway only. Shipping is Mengantar's
 * (`mengantar-client.ts`), so the combined shipping-and-payment Create Order
 * path `/api/h2h/submit` is deliberately not used: it requires AutoLaris' own
 * `id_area` district identifiers, and it registers a shipment nobody fulfils.
 *
 * Contract observed against the provider's published development key on
 * 2026-08-19, not inferred from the documentation:
 *
 *   POST /api/h2h/create_payment  -> { rc, ket, data: { trx_id, virtual_account,
 *                                      qr, payment_code, url, amount, admin, total } }
 *   POST /api/h2h/advice          -> { rc, ket, data: { awb } }
 *   GET  /api/h2h/list_payment    -> { rc, ket, data: [ { channel_code, ... } ] }
 *
 * Three request constraints were established by isolating one field at a time
 * against a payload the provider had already accepted. Each returns
 * `rc: "01" / "Invalid parameter"` with no further detail, so they are enforced
 * here rather than discovered by a customer at checkout:
 *
 *   - `reff_id` accepts digits only. `INV-10001` is rejected.
 *   - `customer_id` must be present and non-empty; any digits are accepted.
 *   - `callback_url` must be present and non-empty.
 */
export type AutoLarisCreatePaymentInput = {
  /** Digits only, at most 30 — the provider rejects any other shape. */
  reffId: string;
  channelCode: AutoLarisChannel;
  /** Digits only. The provider does not require a customer it already knows. */
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  expiresAt: Date;
  amount: number;
  /** Must be non-empty and absolute. */
  callbackUrl: string;
};

export type AutoLarisPayment = {
  transactionId: string;
  virtualAccount?: string;
  qr?: string;
  paymentCode?: string;
  url?: string;
  amount: number;
  admin: number;
  total: number;
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
 * `pending` is the only settlement this repository claims to understand: a
 * freshly created, unpaid transaction returns `rc: "02" / "PENDING"`, observed
 * directly. No response from a *settled* transaction has been observed, so
 * every other code is `unproven` and must never be read as paid — see
 * `UNIMPLEMENTED_SPECS.md`.
 */
export type AutoLarisPaymentInquiry = {
  code: string;
  status: string;
  awb?: string;
  settlement: "pending" | "unproven";
};

export const AUTOLARIS_PENDING_CODE = "02";

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
    };
  };
};

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

/** `yyyyMMddHHmmss` in Asia/Jakarta, the format the provider's examples use. */
export function formatAutoLarisExpiry(expiresAt: Date) {
  if (Number.isNaN(expiresAt.getTime())) {
    throw new Error("Masa berlaku pembayaran AutoLaris tidak valid.");
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(expiresAt)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}${parts.month}${parts.day}${hour}${parts.minute}${parts.second}`;
}

export function buildAutoLarisCreatePaymentPayload(
  input: AutoLarisCreatePaymentInput,
) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error(
      "Nominal pembayaran AutoLaris harus berupa bilangan bulat positif.",
    );
  }

  return {
    reff_id: requiredDigits(input.reffId, "referensi", 30),
    channel_code: input.channelCode,
    customer_id: requiredDigits(input.customerId, "id pembeli", 30),
    customer_name: requiredText(input.customerName, "nama pembeli", 100),
    customer_phone: requiredPhone(input.customerPhone, "telepon pembeli"),
    customer_email: requiredEmail(input.customerEmail),
    expired: formatAutoLarisExpiry(input.expiresAt),
    amount: String(input.amount),
    callback_url: requiredCallbackUrl(input.callbackUrl),
  };
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
 * Create Order / `POST /api/h2h/submit`. In this repository AutoLaris is a
 * money channel only: an order is submitted with `courirId: 1`, which the
 * provider treats as a **digital product** — no courier is booked and no
 * physical shipment is registered (physical delivery is Mengantar's, dispatched
 * separately). For a prepaid QRIS/VA order the money is already collected, so
 * `codValue` is 0; `grandTotal` is the order total. `origin`/`destination` are
 * AutoLaris' own area codes and, with nothing to deliver, are supplied from
 * configuration (the same code for both is fine) rather than the buyer address.
 *
 * The `/submit` response shape is NOT contract-verified here (only
 * create_payment/advice/list_payment are — see the header note); `createOrder`
 * therefore returns the raw provider fields and treats only `rc: "00"` as
 * accepted, never inferring settlement beyond that.
 */
export type AutoLarisCreateOrderInput = {
  /** Digits only, at most 30 — same rule the provider enforces on reff_id. */
  reffId: string;
  channelCode: string;
  /** Defaults to 1 = digital product (no courier, no shipment). */
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

export type AutoLarisOrderResult = {
  accepted: boolean;
  code: string;
  message: string;
  orderId?: string;
  awb?: string;
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
    origin: requiredText(input.origin, "origin", 20),
    destination: requiredText(input.destination, "destination", 20),
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

  async createPayment(
    input: AutoLarisCreatePaymentInput,
  ): Promise<AutoLarisPayment> {
    if (autoLarisChannelLockReason(input.channelCode)) {
      throw new Error("Channel pembayaran tidak aktif di provider.");
    }
    const payload = await this.request(
      "/api/h2h/create_payment",
      buildAutoLarisCreatePaymentPayload(input),
    );
    return parseAutoLarisPaymentResponse(payload, input.amount);
  }

  /**
   * Create Order (`/api/h2h/submit`) as a digital product (`courir_id: 1` — no
   * courier, no shipment; physical delivery stays Mengantar's). This endpoint
   * ISSUES ITS OWN PAYMENT (its body carries `channel_code`, like
   * `createPayment`), so it must never run on top of a checkout that already
   * called `createPayment` — that would mint a second VA/QRIS for one order.
   * It is transport only and intentionally unwired; see the "AutoLaris Create
   * Order" row in `UNIMPLEMENTED_SPECS.md` for when it would replace
   * `createPayment` at checkout. Only `rc: "00"` is treated as accepted.
   */
  async createOrder(
    input: AutoLarisCreateOrderInput,
  ): Promise<AutoLarisOrderResult> {
    const payload = await this.request(
      "/api/h2h/submit",
      buildAutoLarisCreateOrderPayload(input),
    );
    const code = String(payload.rc || "").trim();
    return {
      accepted: code === "00",
      code,
      message: nonEmpty(payload.ket) || "",
      orderId: nonEmpty(payload.data?.transaction_id || payload.data?.trx_id),
      awb: nonEmpty(payload.data?.awb),
    };
  }

  /**
   * Reads one transaction's settlement state. This never mutates payment state
   * and never returns "paid" — see `AutoLarisPaymentInquiry`.
   */
  async inquirePayment(transactionId: string): Promise<AutoLarisPaymentInquiry> {
    const payload = await this.request("/api/h2h/advice", {
      // Echoed back exactly as the provider issued it. Every observed `trx_id`
      // is numeric, but validating the provider's own identifier against our
      // guess of its shape would only break when the provider changes it.
      transaction_id: requiredText(transactionId, "id transaksi", 64),
    });
    const code = String(payload.rc || "").trim();
    return {
      code,
      status: String(payload.ket || "").trim(),
      awb: nonEmpty(payload.data?.awb),
      settlement: code === AUTOLARIS_PENDING_CODE ? "pending" : "unproven",
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
