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
  "DANA",
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

export type AutoLarisCreateOrderInput = {
  reffId: string;
  channelCode: AutoLarisChannel;
  originAreaId: string;
  destinationAreaId: string;
  weightGrams: number;
  shipperName: string;
  shipperPhone: string;
  shipperAddress: string;
  receiverName: string;
  receiverPhone: string;
  receiverEmail: string;
  receiverAddress: string;
  orderDetails: ReadonlyArray<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  amount: number;
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
  verified: false;
  verificationSupported: false;
  message: string;
};


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
// Provider-team operational instruction for the online-payment Create Order path.
// AutoLaris' published examples confirm the `courir_id` spelling, but not this value.
const AUTOLARIS_PAYMENT_COURIR_ID = 1;

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

function requiredAreaId(value: string, field: string) {
  const normalized = requiredText(value, field, 20);
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Data ${field} AutoLaris tidak valid.`);
  }
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
  const email = requiredText(value, "email penerima", 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Data email penerima AutoLaris tidak valid.");
  }
  return email;
}

export function buildAutoLarisCreateOrderPayload(
  input: AutoLarisCreateOrderInput,
) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error(
      "Nominal pembayaran AutoLaris harus berupa bilangan bulat positif.",
    );
  }
  if (
    !Number.isSafeInteger(input.weightGrams) ||
    input.weightGrams <= 0 ||
    input.weightGrams > 10_000_000
  ) {
    throw new Error("Berat order AutoLaris tidak valid.");
  }
  if (input.orderDetails.length < 1 || input.orderDetails.length > 100) {
    throw new Error("Item order AutoLaris tidak lengkap.");
  }

  let goodsTotal = 0;
  const orderDetails = input.orderDetails.map((item) => {
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isSafeInteger(item.unitPrice) ||
      item.unitPrice < 0
    ) {
      throw new Error("Item order AutoLaris tidak valid.");
    }
    goodsTotal += item.quantity * item.unitPrice;
    if (!Number.isSafeInteger(goodsTotal) || goodsTotal <= 0) {
      throw new Error("Total barang AutoLaris tidak valid.");
    }
    return {
      name: requiredText(item.name, "nama item", 150),
      qty: String(item.quantity),
      unit_price: String(item.unitPrice),
    };
  });

  return {
    reff_id: requiredText(input.reffId, "referensi", 30),
    channel_code: input.channelCode,
    courir_id: AUTOLARIS_PAYMENT_COURIR_ID,
    origin: requiredAreaId(input.originAreaId, "origin"),
    destination: requiredAreaId(input.destinationAreaId, "destination"),
    weight: String(input.weightGrams),
    shipper_name: requiredText(input.shipperName, "nama pengirim", 100),
    shipper_phone: requiredPhone(input.shipperPhone, "telepon pengirim"),
    shipper_email: "",
    shipper_address: requiredText(input.shipperAddress, "alamat pengirim", 500),
    receiver_name: requiredText(input.receiverName, "nama penerima", 100),
    receiver_phone: requiredPhone(input.receiverPhone, "telepon penerima"),
    receiver_email: requiredEmail(input.receiverEmail),
    receiver_address: requiredText(input.receiverAddress, "alamat penerima", 500),
    callback_url: "",
    grand_total: String(goodsTotal),
    cod_value: "0",
    remark: `AdsBookCMS ${requiredText(input.reffId, "referensi", 30)}`,
    order_details: orderDetails,
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

  async createOrder(input: AutoLarisCreateOrderInput): Promise<AutoLarisPayment> {
    if (autoLarisChannelLockReason(input.channelCode)) {
      throw new Error("Channel pembayaran tidak aktif di provider.");
    }
    const requestPayload = buildAutoLarisCreateOrderPayload(input);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/h2h/submit`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      let providerPayload: AutoLarisResponse;
      try {
        providerPayload = (await response.json()) as AutoLarisResponse;
      } catch {
        throw new Error("AutoLaris mengembalikan respons yang tidak valid.");
      }

      if (!response.ok) {
        throw new Error(
          nonEmpty(providerPayload.ket) || `AutoLaris gagal (${response.status}).`,
        );
      }
      return parseAutoLarisPaymentResponse(providerPayload, input.amount);
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
  async verifyCredentials(): Promise<AutoLarisCredentialVerification> {
    if (!this.apiKey) {
      return {
        verified: false,
        verificationSupported: false,
        message: "API Key AutoLaris belum dikonfigurasi.",
      };
    }

    return {
      verified: false,
      verificationSupported: false,
      message:
        "API Key AutoLaris tersimpan, tetapi tidak dapat diverifikasi otomatis karena kontrak yang tersedia tidak menyediakan endpoint baca-saja. Tidak ada permintaan ke AutoLaris yang dikirim.",
    };
  }
}
