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
import { MengantarClient, type MengantarAddressSearchResult } from '../../lib/mengantar-client';
import { getProviderConfig } from '../../lib/provider-config';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const search = url.searchParams.get('search') || '';
    const level = url.searchParams.get('level');
    if (!search || search.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: true, locations: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const database = getRuntimeEnv(locals)?.OMS_DB;
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
    const province = (url.searchParams.get('province') || '').trim();
    const city = (url.searchParams.get('city') || '').trim();
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
    return new Response(
      JSON.stringify({
        success: true,
        items,
        locations: items,
        alternatives: items.length === 0 ? alternatives : [],
      }),
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: 'Gagal mencari lokasi' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
