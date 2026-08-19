import {
  DEFAULT_COD_DISABLED_PROVINCE_CODES,
  getProvinceName,
  isProvinceExcluded,
  normalizeProvinceCode,
  parseProvinceCodeList,
} from './province.ts';
import { resolveGeoLocation } from './geo.ts';

export type FormMode = 'middle' | 'full' | 'hybrid';

export type FormModeContext = {
  mode: FormMode;
  resolvedMode: 'middle' | 'full';
  province: string;
  provinceCode: string;
  source: 'query' | 'cloudflare' | 'header' | 'geoip' | 'fallback';
};

export function getCodDisabledProvinceCodes(
  storedValue?: string | readonly string[] | null,
): string[] {
  if (storedValue === undefined || storedValue === null) {
    return [...DEFAULT_COD_DISABLED_PROVINCE_CODES];
  }
  return parseProvinceCodeList(storedValue);
}

export function getCodDisabledProvinces(
  storedValue?: string | readonly string[] | null,
): string[] {
  return getCodDisabledProvinceCodes(storedValue)
    .map((code) => getProvinceName(code).toLowerCase())
    .filter(Boolean);
}

export async function loadStoreCodDisabledProvinceCodes(
  database?: D1Database | null,
): Promise<string[]> {
  if (!database?.prepare) return getCodDisabledProvinceCodes();
  const store = await database
    .prepare(
      'SELECT cod_disabled_province_codes FROM stores ORDER BY id LIMIT 1',
    )
    .first<{ cod_disabled_province_codes: string | null }>();
  return getCodDisabledProvinceCodes(store?.cod_disabled_province_codes);
}

export function resolveFormModeFromProvince(
  province: string,
  disabledList: readonly string[],
): 'middle' | 'full' {
  const provinceCode = normalizeProvinceCode(province);
  if (!provinceCode) return 'full';
  return isProvinceExcluded(provinceCode, disabledList) ? 'full' : 'middle';
}

/**
 * Whether a COD order must be refused for the address it is being placed to.
 *
 * The hybrid dispatch decides which form a visitor *sees* from their geo-IP
 * province, but the address they type is what actually gets delivered, and the
 * two need not agree — a buyer in Java can address an order to Papua from the
 * middle form. This is the server's own answer, so a crafted request cannot
 * place a COD order into an excluded province by skipping the browser.
 *
 * An unresolvable province is refused too. Failing open here would accept COD
 * for exactly the addresses the policy could not classify.
 */
export function isCodBlockedForProvince(
  paymentMethod: string,
  province: string,
  disabledCodes: readonly string[],
): boolean {
  if (paymentMethod !== 'cod') return false;
  const provinceCode = normalizeProvinceCode(province);
  return !provinceCode || isProvinceExcluded(provinceCode, disabledCodes);
}

export async function resolveFormModeContext(
  request: Request,
  disabledProvinces?: string | readonly string[] | null,
): Promise<FormModeContext> {
  const disabledList = getCodDisabledProvinceCodes(disabledProvinces);
  const geo = await resolveGeoLocation(request);

  const mode: FormMode = 'hybrid';
  const resolvedMode = resolveFormModeFromProvince(
    geo.provinceCode,
    disabledList,
  );
  const mappedSource: FormModeContext['source'] =
    geo.source === 'ipapi' ? 'geoip' : geo.source;

  return {
    mode,
    resolvedMode,
    province: geo.province,
    provinceCode: geo.provinceCode,
    source: mappedSource,
  };
}
