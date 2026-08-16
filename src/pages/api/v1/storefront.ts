import type { APIRoute } from 'astro';
import { handleOptions, headlessError, headlessOk, validateHeadlessRequest } from '../../../lib/headless-api';
import { getTenantHomeContent } from '../../../lib/tenant-content';
import { getStoreAdsConfig } from '../../../lib/store-ads';
import { getRuntimeEnv } from '../../../lib/env';
import { loadStoreCodDisabledProvinceCodes } from '../../../lib/form-mode';

export const prerender = false;

export const OPTIONS = handleOptions;

export const GET: APIRoute = async ({ request, locals }) => {
  const tenantConfig = locals.tenant;
  const validation = await validateHeadlessRequest(request, locals);
  if (!validation.allowed && validation.errorResponse) {
    return validation.errorResponse;
  }

  try {
    const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
    const [homeContent, adsConfig, disabledCodProvinces] = await Promise.all([
      getTenantHomeContent(locals),
      getStoreAdsConfig(locals),
      loadStoreCodDisabledProvinceCodes(database),
    ]);

    return headlessOk(
      {
        storefront: {
          slug: tenantConfig.slug,
          name: tenantConfig.name,
          tagline: tenantConfig.tagline,
          description: tenantConfig.description,
          site_url: tenantConfig.siteUrl,
          logo: tenantConfig.logo,
          theme_color: tenantConfig.themeColor,
          locale: tenantConfig.locale,
          template: tenantConfig.storefrontTemplate,
          admin_name: tenantConfig.adminName,
        },
        content: homeContent,
        tracking: {
          meta_pixel_id: adsConfig.metaPixelId || null,
          google_ads_conversion_id: adsConfig.googleAdsConversionId || null,
          google_ads_conversion_label: adsConfig.googleAdsConversionLabel || null,
          google_tag_manager_id: adsConfig.googleTagManagerId || null,
        },
        payment: {
          cod_enabled: true,
          cod_disabled_provinces: disabledCodProvinces,
          supported_methods: ['COD', 'BANK_TRANSFER', 'E_WALLET', 'QRIS'],
        },
      },
      200,
      // Install-specific configuration: pixel/CAPI IDs and the live COD province policy.
      // Never store it anywhere, so an admin change takes effect on the next request.
      { ...validation.corsHeaders, 'cache-control': 'no-store' }
    );
  } catch (error) {
    return headlessError('Gagal memuat data storefront.', 500, {
      code: 'STOREFRONT_LOAD_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, validation.corsHeaders);
  }
};
