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
  deliveryRate: number | null;
  riskLevel: ReceiverRiskLevel;
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

  if (!couriers.length) {
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
  const deliveryRate = percent(totals.delivered, denominator);

  return {
    phone,
    checkedAt,
    deliveryRate,
    riskLevel: classifyReceiverRisk(deliveryRate),
    totals,
    couriers: couriers.sort((left, right) => right.total - left.total || left.courier.localeCompare(right.courier)),
  };
}
