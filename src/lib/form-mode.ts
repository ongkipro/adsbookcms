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
