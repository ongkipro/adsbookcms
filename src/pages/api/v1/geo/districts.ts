import type { APIRoute } from 'astro';
import { handleOptions, headlessError, headlessOk, validateHeadlessRequest } from '../../../../lib/headless-api';
import { searchDistrictCatalog } from '../../../../lib/district-catalog';
import { createDistrictDiscoveryLocation } from '../../../../lib/location-search';

export const prerender = false;

export const OPTIONS = handleOptions;

export const GET: APIRoute = async ({ request, url, locals }) => {
  const validation = await validateHeadlessRequest(request, locals, { operation: 'districtSearch' });
  if (!validation.allowed) {
    return validation.errorResponse;
  }

  try {
    const query = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim();
    const limit = Math.max(1, Math.min(100, parseInt(url.searchParams.get('limit') || '30', 10)));

    if (!query || query.length < 2) {
      return validation.finalize(headlessOk(
        {
          query,
          districts: [],
        },
        200,
        validation.corsHeaders
      ));
    }

    const matches = searchDistrictCatalog(query, limit);
    const districts = matches.map((match) => {
      const loc = createDistrictDiscoveryLocation(match);
      return {
        district: match.district,
        city: match.city,
        province: match.province,
        label: loc.label,
      };
    });

    return validation.finalize(headlessOk(
      {
        query,
        count: districts.length,
        districts,
      },
      200,
      validation.corsHeaders
    ));
  } catch (error) {
    return validation.finalize(headlessError('Gagal mencari lokasi kecamatan.', 500, {
      code: 'DISTRICT_SEARCH_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, validation.corsHeaders));
  }
};
