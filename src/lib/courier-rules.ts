import type { CourierRateResult } from "./mengantar-client";
export type CourierAvailabilityRule = {
  courier_code: string;
  is_enabled: number;
  is_cod_enabled: number;
};

const courierKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function isCourierRateEnabled(
  courierCode: string,
  rules: CourierAvailabilityRule[],
  isCod: boolean,
) {
  const rule = rules.find(
    (candidate) =>
      courierKey(candidate.courier_code) === courierKey(courierCode),
  );
  return rule?.is_enabled === 1 && (!isCod || rule.is_cod_enabled === 1);
}

export function selectQuotedRate(
  rates: CourierRateResult[],
  courierCode: string,
  courierServiceId?: number,
) {
  const normalizedCode = courierKey(courierCode);
  if (!normalizedCode) return undefined;

  if (courierServiceId && Number.isInteger(courierServiceId)) {
    const indexedRate = rates[courierServiceId - 1];
    if (
      indexedRate &&
      courierKey(indexedRate.courier_code) === normalizedCode
    ) {
      return indexedRate;
    }
  }

  const matches = rates.filter(
    (rate) => courierKey(rate.courier_code) === normalizedCode,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
