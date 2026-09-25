import { formatIdr } from "./format-idr.ts";

/** One quote row as `/api/admin/ongkir?action=estimate` returns it. */
export type QuotedRate = {
  courier_code: string;
  courier_service: string;
  price: number;
  cod_fee: number;
  estimated_days: string;
  unsupported_cod: boolean;
};

export type RateFilter = "all" | "cod";
export type RateSort = "price-asc" | "price-desc" | "eta-asc";

// "2-4 hari", "1 - 3 days", "3" → 2, 1, 3; unknown sorts last.
const firstDay = (eta: string) => {
  const match = /\d+/.exec(eta || "");
  return match ? Number(match[0]) : Number.POSITIVE_INFINITY;
};

/** "1 - 3 days", "2-4 hari", "3" → "1–3 hari", "2–4 hari", "3 hari"; "" stays "". */
export function etaLabel(eta: string) {
  const range = (eta || "").replace(/\b(days?|hari)\b/gi, "").replace(/\s*-\s*/g, "–").trim();
  return range ? `${range} hari` : "";
}

export function visibleRates(rates: readonly QuotedRate[], filter: RateFilter, sort: RateSort) {
  const rows = rates.filter((rate) => filter === "all" || !rate.unsupported_cod);
  const compare: Record<RateSort, (a: QuotedRate, b: QuotedRate) => number> = {
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    "eta-asc": (a, b) => firstDay(a.estimated_days) - firstDay(b.estimated_days) || a.price - b.price,
  };
  return [...rows].sort(compare[sort]);
}

/** The text a CS agent pastes into a buyer's WhatsApp chat. */
export function ratesWhatsAppText(rates: readonly QuotedRate[], destination: string, weightKg: number) {
  const lines = visibleRates(rates, "all", "price-asc").map((rate) => {
    const eta = etaLabel(rate.estimated_days) ? ` (${etaLabel(rate.estimated_days)})` : "";
    return `• *${rate.courier_code.toUpperCase()}*: ${formatIdr(rate.price)}${eta}${rate.unsupported_cod ? "" : " [COD OK]"}`;
  });
  return [`*Pilihan Ongkos Kirim (${weightKg} kg)*`, `Tujuan: ${destination}`, "", ...lines].join("\n");
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export const RISK_COPY: Record<RiskLevel, { label: string; guidance: string; tone: "good" | "warn" | "bad" | "none" }> = {
  LOW: { label: "Risiko RTS rendah", guidance: "Riwayat pengiriman baik. Aman diproses dengan COD.", tone: "good" },
  MEDIUM: { label: "Risiko RTS sedang", guidance: "Konfirmasi nama penerima dan kesiapan COD lewat WhatsApp sebelum paket diserahkan ke kurir.", tone: "warn" },
  HIGH: { label: "Risiko RTS tinggi", guidance: "Tingkat retur tinggi. Minta pembeli transfer DP atau lunas sebelum dikirim.", tone: "bad" },
  UNKNOWN: { label: "Belum ada riwayat selesai", guidance: "Data belum cukup. Lakukan verifikasi manual seperti biasa.", tone: "none" },
};

export const formatRate = (rate: number | null) =>
  rate == null ? "—" : rate.toLocaleString("id-ID", { maximumFractionDigits: 1 });

/** `wa.me` wants digits in 62-form. */
export const waMeNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
};
