import {
  getProvinceName,
  normalizeProvinceCode,
} from './province.ts';

export type GeoLocationResult = {
  province: string;
  provinceCode: string;
  city: string;
  country: string;
  source: 'cloudflare' | 'header' | 'ipapi' | 'fallback';
};

type CloudflareRequest = Request & {
  cf?: {
    regionCode?: unknown;
    region?: unknown;
    city?: unknown;
    country?: unknown;
  };
};

export async function resolveGeoLocation(request: Request): Promise<GeoLocationResult> {
  const headers = request.headers;
  const cf = (request as CloudflareRequest).cf;
  const cfRegionCode = normalizeProvinceCode(cf?.regionCode);
  const cfRegionNameCode = normalizeProvinceCode(cf?.region);
  const cfProvinceCode = cfRegionCode || cfRegionNameCode;

  if (cfProvinceCode) {
    return {
      province: getProvinceName(cfProvinceCode),
      provinceCode: cfProvinceCode,
      city: String(cf?.city || headers.get('cf-ipcity') || headers.get('x-cf-city') || ''),
      country: String(cf?.country || headers.get('cf-ipcountry') || headers.get('x-cf-country') || 'ID'),
      source: 'cloudflare',
    };
  }

  const headerProvince =
    headers.get('cf-region-code') ||
    headers.get('x-cf-region-code') ||
    headers.get('cf-region') ||
    headers.get('x-cf-region') ||
    '';
  const headerProvinceCode = normalizeProvinceCode(headerProvince);
  if (headerProvinceCode) {
    return {
      province: getProvinceName(headerProvinceCode),
      provinceCode: headerProvinceCode,
      city: headers.get('cf-ipcity') || headers.get('x-cf-city') || '',
      country: headers.get('cf-ipcountry') || headers.get('x-cf-country') || 'ID',
      source: 'cloudflare',
    };
  }

  const customProvince =
    headers.get('x-user-province') || headers.get('x-geo-province') || '';
  const customProvinceCode = normalizeProvinceCode(customProvince);
  if (customProvinceCode) {
    return {
      province: getProvinceName(customProvinceCode),
      provinceCode: customProvinceCode,
      city: headers.get('x-user-city') || '',
      country: headers.get('x-user-country') || 'ID',
      source: 'header',
    };
  }

  return {
    province: '',
    provinceCode: '',
    city: '',
    country: 'ID',
    source: 'fallback',
  };
}

/**
 * The visitor's Cloudflare location as request headers, for a request this
 * Worker builds itself. `new Request(...)` does not carry `request.cf`, so a
 * route handed a rebuilt request — `/produk/<slug>` rewriting to the landing
 * page that serves as the product page — saw no province, and the form's
 * hybrid rule sent every buyer to the full form. `resolveGeoLocation` already
 * reads these headers as its fallback. Values come from `cf` only; nothing the
 * client sent is copied. COD eligibility is enforced again when the order is
 * submitted, so a forged header can change which form is shown, never whether
 * COD is accepted.
 */
export function geoHeadersFromCf(request: Request): Record<string, string> {
  const cf = (request as CloudflareRequest).cf;
  const headers: Record<string, string> = {};
  const set = (name: string, value: unknown) => {
    const text = String(value ?? '').trim();
    if (text) headers[name] = text;
  };
  set('x-cf-region-code', cf?.regionCode);
  set('x-cf-region', cf?.region);
  set('x-cf-city', cf?.city);
  set('x-cf-country', cf?.country);
  return headers;
}
