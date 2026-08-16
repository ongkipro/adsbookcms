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

export type AutoLarisPaymentInput = {
  reffId: string;
  channelCode: AutoLarisChannel;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  amount: number;
  callbackUrl: string;
  expiresAt?: Date;
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

type AutoLarisResponse = {
  rc?: string;
  ket?: string;
  data?: {
    trx_id?: string;
    virtual_account?: string;
    qr?: string;
    payment_code?: string;
    url?: string;
    amount?: number;
    admin?: number;
    total?: number;
  };
};

export function parseAutoLarisPaymentResponse(payload: unknown): AutoLarisPayment {
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

  const transactionId = nonEmpty(response.data.trx_id);
  const amount = Number(response.data.amount);
  const admin = Number(response.data.admin);
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
    virtualAccount: nonEmpty(response.data.virtual_account),
    qr: nonEmpty(response.data.qr),
    paymentCode: nonEmpty(response.data.payment_code),
    url: nonEmpty(response.data.url),
    amount,
    admin,
    total,
  };
}

const DEFAULT_BASE_URL = "https://api-h2h.autolaris.com";
const DEFAULT_TIMEOUT_MS = 10_000;

function expiryStamp(date: Date) {
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${wib.getUTCFullYear()}${part(wib.getUTCMonth() + 1)}${part(wib.getUTCDate())}${part(wib.getUTCHours())}${part(wib.getUTCMinutes())}${part(wib.getUTCSeconds())}`;
}

function nonEmpty(value: string | undefined) {
  return value?.trim() || undefined;
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

  async createPayment(input: AutoLarisPaymentInput): Promise<AutoLarisPayment> {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new Error(
        "Nominal pembayaran AutoLaris harus berupa bilangan bulat positif.",
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/h2h/create_payment`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reff_id: input.reffId,
          channel_code: input.channelCode,
          customer_id: input.customerId,
          customer_name: input.customerName,
          customer_phone: input.customerPhone,
          customer_email: input.customerEmail,
          expired: expiryStamp(
            input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
          ),
          amount: String(input.amount),
          callback_url: input.callbackUrl,
        }),
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
      return parseAutoLarisPaymentResponse(payload);
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
  async verifyCredentials(): Promise<{ verified: boolean; message: string }> {
    if (!this.apiKey) {
      return { verified: false, message: "API Key AutoLaris belum dikonfigurasi." };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/api/h2h/create_payment`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amount: "0", reff_id: "PING_TEST" }),
        signal: controller.signal,
      });

      let payload: AutoLarisResponse | undefined;
      try {
        payload = (await response.json()) as AutoLarisResponse;
      } catch {}

      if (response.status === 401 || response.status === 403) {
        return {
          verified: false,
          message: "API Key AutoLaris tidak valid atau ditolak oleh server AutoLaris.",
        };
      }

      const messageStr = (payload?.ket || "").toLowerCase();
      if (
        messageStr.includes("unauthorized") ||
        messageStr.includes("invalid key") ||
        messageStr.includes("token tidak valid")
      ) {
        return {
          verified: false,
          message: "API Key AutoLaris tidak valid (Server AutoLaris menolak otentikasi).",
        };
      }

      return {
        verified: true,
        message: "Kredensial API Key AutoLaris terverifikasi aktif & valid di server AutoLaris.",
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { verified: false, message: "Koneksi ke AutoLaris timeout." };
      }
      return {
        verified: false,
        message:
          error instanceof Error
            ? error.message
            : "Gagal terhubung ke server AutoLaris.",
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
