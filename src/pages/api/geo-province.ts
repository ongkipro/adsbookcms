import type { APIRoute } from 'astro';
import {
  loadStoreCodDisabledProvinceCodes,
  resolveFormModeContext,
} from '../../lib/form-mode';
import { getRuntimeEnv } from '../../lib/env';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    const disabledCodes =
      await loadStoreCodDisabledProvinceCodes(database);
    const context = await resolveFormModeContext(request, disabledCodes);

    return new Response(
      JSON.stringify({
        success: true,
        province: context.province,
        province_code: context.provinceCode,
        mode: context.resolvedMode,
        source: context.source,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: 'Gagal mendeteksi GeoIP' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
