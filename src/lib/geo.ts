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
