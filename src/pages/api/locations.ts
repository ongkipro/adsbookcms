import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../lib/env';
import { searchDistrictCatalog } from '../../lib/district-catalog';
import {
  buildProviderDestinationSearches,
  createDistrictDiscoveryLocation,
  filterProviderDestinationAlternatives,
  resolveProviderDestinations,
  sortLocationResults,
} from '../../lib/location-search';
import {
  buildResolveCacheKey,
  buildSearchCacheKey,
  cacheResolvedLocation,
  cacheSearchResult,
  getCachedLocation,
} from '../../lib/location-cache';
import { MengantarClient, type MengantarAddressSearchResult } from '../../lib/mengantar-client';
import { getProviderConfig } from '../../lib/provider-config';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '../../lib/rate-limit';

type LocationsPayload = {
  success: true;
  items: unknown[];
  locations: unknown[];
  alternatives: unknown[];
};

export const prerender = false;

export const GET: APIRoute = async ({ request, url, locals }) => {
  try {
    const runtimeEnv = getRuntimeEnv(locals);
    const rateLimit = await checkRateLimit(
      runtimeEnv?.SESSION as KVNamespace | undefined,
      `public-location:${getClientIp(request.headers)}`,
      120,
      60_000,
    );
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ success: false, error: 'Terlalu banyak pencarian lokasi. Coba lagi sebentar.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...rateLimitHeaders(rateLimit.remaining, rateLimit.resetAt) } },
      );
    }
    const search = url.searchParams.get('search') || '';
    const level = url.searchParams.get('level');
    if (!search || search.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: true, locations: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Typing suggestions never need the provider: the local catalogue is
    // instant, needs no network, and stays usable if Mengantar is slow or
    // down. `level=resolve` (fired on selection, not on keystroke) is the
    // only call that has to reach the provider for a real destination id.
    if (level === 'district') {
      const items = searchDistrictCatalog(search).map(createDistrictDiscoveryLocation);
      return new Response(
        JSON.stringify({ success: true, items, locations: items }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const sessions = runtimeEnv?.SESSION as KVNamespace | undefined;
    const province = (url.searchParams.get('province') || '').trim();
    const city = (url.searchParams.get('city') || '').trim();
    const cacheKey = level === 'resolve' && city
      ? buildResolveCacheKey(search, city, province)
      : buildSearchCacheKey(search);
    const cached = await getCachedLocation<LocationsPayload>(sessions, cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const database = runtimeEnv?.OMS_DB;
    if (!database || typeof database !== "object") {
      const items = searchDistrictCatalog(search).map(createDistrictDiscoveryLocation);
      return new Response(
        JSON.stringify({ success: true, items, locations: items }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    const config = (await getProviderConfig(database as D1Database, locals)).mengantar;
    if (!config.apiKey) {
      const items = searchDistrictCatalog(search).map(createDistrictDiscoveryLocation);
      return new Response(
        JSON.stringify({ success: true, items, locations: items }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    const client = new MengantarClient(config.apiKey, config.baseUrl);
    const providerSearches = level === 'resolve' && city
      ? buildProviderDestinationSearches(search, city, province)
      : [search];
    const results: MengantarAddressSearchResult[] = [];
    for (const providerSearch of providerSearches) {
      const batch = await client.searchAddress(providerSearch);
      results.push(...batch);
      if (
        level !== 'resolve'
        || resolveProviderDestinations(
          batch.map((item) => ({
            label: '',
            district: String(item.DISTRICT_NAME || '').trim(),
            district_name: String(item.DISTRICT_NAME || '').trim(),
            subdistrict_name: String(item.SUBDISTRICT_NAME || '').trim(),
            city: String(item.CITY_NAME || '').trim(),
            province: String(item.PROVINCE_NAME || '').trim(),
          })),
          search.trim(),
          city,
        ).length > 0
      ) {
        break;
      }
    }

    const providerResults = results.filter((item) => String(item._id || '').trim());
    let items = providerResults.map((item) => {
      const providerId = String(item._id).trim();
      const district = String(item.DISTRICT_NAME || '').trim();
      const subdistrict = String(item.SUBDISTRICT_NAME || '').trim();
      const city = String(item.CITY_NAME || '').trim();
      const province = String(item.PROVINCE_NAME || '').trim();
      const postalCode = String(item.ZIP_CODE || '').trim();

      // Put kecamatan before kelurahan so autocomplete results scan by district first.
      const parts = [district];
      if (subdistrict && subdistrict !== district) parts.push(subdistrict);
      parts.push(city, province);
      const label = parts.filter(Boolean).join(', ');

      return {
        location_id: providerId,
        id: providerId,
        label,
        // DISTRICT_NAME is kecamatan; SUBDISTRICT_NAME is kelurahan/desa.
        district: district || subdistrict,
        subdistrict_name: subdistrict,
        district_name: district,
        city,
        city_name: city,
        province,
        province_name: province,
        postal_code: postalCode,
      };
    });
    let alternatives = [...items];
    if (level === 'resolve') {
      alternatives = filterProviderDestinationAlternatives(items, search.trim(), city);
      const resolved = resolveProviderDestinations(items, search.trim(), city);
      if (resolved.length > 0) {
        items = resolved;
      } else if (alternatives.length > 0) {
        items = alternatives;
      }
    } else {
      sortLocationResults(items, search);
    }
    items = Array.from(
      new Map(items.map((item) => [item.id, item])).values(),
    ).slice(0, 50);
    alternatives = Array.from(
      new Map(alternatives.map((item) => [item.id, item])).values(),
    ).slice(0, 50);
    const payload: LocationsPayload = {
      success: true,
      items,
      locations: items,
      alternatives: items.length === 0 ? alternatives : [],
    };
    // Only a resolved destination is worth caching for a day; a raw
    // provider search can drift as Mengantar's own catalogue changes.
    if (level === 'resolve' && city) {
      await cacheResolvedLocation(sessions, cacheKey, payload);
    } else {
      await cacheSearchResult(sessions, cacheKey, payload);
    }
    return new Response(JSON.stringify(payload));
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: 'Gagal mencari lokasi' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
