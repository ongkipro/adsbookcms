export type ReceiverRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export type ReceiverCourierPerformance = {
  courier: string;
  total: number;
  delivered: number;
  rts: number;
  undelivered: number;
  inProgress: number;
  value: number;
  apiRate: number | null;
  deliveryRate: number | null;
};

export type ReceiverPerformance = {
  phone: string;
  checkedAt: string;
  /**
   * Percent. Mengantar's own `summary.average_number` (0–10, the unweighted
   * mean of per-courier rates) times ten when the response carries a summary;
   * otherwise delivered / completed across all couriers.
   */
  deliveryRate: number | null;
  riskLevel: ReceiverRiskLevel;
  /** Mengantar `summary.average_score`: "A".."E-", "≈"-prefixed on thin history, "-" for none. */
  grade: string | null;
  totals: {
    total: number;
    delivered: number;
    rts: number;
    undelivered: number;
    inProgress: number;
    value: number;
  };
  couriers: ReceiverCourierPerformance[];
};

const countKeys = ['total', 'delivered', 'rts', 'undelivered', 'inProgress'] as const;

const nonNegativeNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const percent = (delivered: number, total: number): number | null => {
  if (total <= 0) return null;
  return Math.round((delivered / total) * 1000) / 10;
};

export const classifyReceiverRisk = (deliveryRate: number | null): ReceiverRiskLevel => {
  if (deliveryRate == null) return 'UNKNOWN';
  if (deliveryRate < 40) return 'HIGH';
  if (deliveryRate < 70) return 'MEDIUM';
  return 'LOW';
};

export function parseReceiverPerformance(
  payload: unknown,
  phone: string,
  checkedAt = new Date().toISOString(),
): ReceiverPerformance {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Format riwayat penerima Mengantar tidak valid.');
  }

  const couriers = Object.entries(payload as Record<string, unknown>).flatMap(([courier, raw]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const record = raw as Record<string, unknown>;
    if (!countKeys.some((key) => record[key] !== undefined)) return [];

    const total = nonNegativeNumber(record.total);
    const delivered = nonNegativeNumber(record.delivered);
    const rts = nonNegativeNumber(record.rts);
    const undelivered = nonNegativeNumber(record.undelivered);
    const denominator = total > 0 ? total : delivered + rts + undelivered;
    const apiRateNumber = Number(record.rate);

    return [{
      courier,
      total,
      delivered,
      rts,
      undelivered,
      inProgress: nonNegativeNumber(record.inProgress),
      value: nonNegativeNumber(record.value),
      apiRate: Number.isFinite(apiRateNumber) ? apiRateNumber : null,
      deliveryRate: percent(delivered, denominator),
    } satisfies ReceiverCourierPerformance];
  });

  // `summary` is the stable part of the provider contract: present even for a
  // receiver with no history, where every courier comes back as `{}`.
  const rawSummary = (payload as Record<string, unknown>).summary;
  const summary = rawSummary && typeof rawSummary === 'object' && !Array.isArray(rawSummary)
    ? rawSummary as Record<string, unknown>
    : null;

  if (!couriers.length && !summary) {
    throw new Error('Respons Mengantar tidak berisi riwayat kurir yang dapat dibaca.');
  }

  const totals = couriers.reduce(
    (sum, courier) => ({
      total: sum.total + courier.total,
      delivered: sum.delivered + courier.delivered,
      rts: sum.rts + courier.rts,
      undelivered: sum.undelivered + courier.undelivered,
      inProgress: sum.inProgress + courier.inProgress,
      value: sum.value + courier.value,
    }),
    { total: 0, delivered: 0, rts: 0, undelivered: 0, inProgress: 0, value: 0 },
  );
  const denominator = totals.total > 0
    ? totals.total
    : totals.delivered + totals.rts + totals.undelivered;
  const averageNumber = Number(summary?.average_number);
  const deliveryRate = !summary
    ? percent(totals.delivered, denominator)
    : summary.average_number == null || !Number.isFinite(averageNumber)
      ? null
      : Math.round(Math.min(10, Math.max(0, averageNumber)) * 100) / 10;
  const grade = typeof summary?.average_score === 'string' && summary.average_score.trim()
    ? summary.average_score.trim()
    : null;

  return {
    phone,
    checkedAt,
    deliveryRate,
    riskLevel: classifyReceiverRisk(deliveryRate),
    grade,
    totals,
    couriers: couriers.sort((left, right) => right.total - left.total || left.courier.localeCompare(right.courier)),
  };
}
