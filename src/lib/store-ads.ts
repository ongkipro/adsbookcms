// Extension-qualified like every other module here: Vite resolves either form,
// but `node --experimental-strip-types` does not, and the bare specifier is why
// this module could not be unit-tested at all (audit 2026-08-23 §2.6).
import { getRuntimeEnv, getEnvValue } from './env.ts';

export const GOOGLE_ADS_CONVERSION_ID_PATTERN = /^AW-\d{5,20}$/;
export const GOOGLE_ADS_CONVERSION_LABEL_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * The conversion destination is an atomic public configuration. A half-filled
 * or malformed environment fallback must disable the direct Google Ads tag,
 * not emit a broken `send_to` value into the storefront.
 */
export function hasValidGoogleAdsConversion(
  conversionId: string,
  conversionLabel: string,
): boolean {
  return GOOGLE_ADS_CONVERSION_ID_PATTERN.test(conversionId)
    && GOOGLE_ADS_CONVERSION_LABEL_PATTERN.test(conversionLabel);
}

export type StoreAdsConfig = {
  metaPixelId: string;
  metaCapiToken: string;
  googleTagManagerId: string;
  googleAdsConversionId: string;
  googleAdsConversionLabel: string;
};

export async function getStoreAdsConfig(locals?: App.Locals): Promise<StoreAdsConfig> {
  let dbPixelId = '';
  let dbCapiToken = '';
  let dbGoogleId = '';
  let dbGoogleTagManagerId = '';
  let dbGoogleLabel = '';

  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (database && typeof database === 'object' && 'prepare' in database) {
    try {
      const row = (await database
        .prepare(
          `
        SELECT meta_pixel_id, meta_capi_token, google_tag_manager_id, google_ads_conversion_id, google_ads_conversion_label
        FROM stores
        ORDER BY id
        LIMIT 1
      `,
        )
        .first()) as {
        meta_pixel_id?: string | null;
        meta_capi_token?: string | null;
        google_tag_manager_id?: string | null;
        google_ads_conversion_id?: string | null;
        google_ads_conversion_label?: string | null;
      } | null;

      if (row) {
        dbPixelId = row.meta_pixel_id ?? '';
        dbCapiToken = row.meta_capi_token ?? '';
        dbGoogleTagManagerId = row.google_tag_manager_id ?? '';
        dbGoogleId = row.google_ads_conversion_id ?? '';
        dbGoogleLabel = row.google_ads_conversion_label ?? '';
      }
    } catch {
      // Fallback to env on table read error
    }
  }

  const envSource = getRuntimeEnv(locals);
  const metaPixelId =
    dbPixelId ||
    getEnvValue('NEXT_PUBLIC_FB_PIXEL_ID', envSource) ||
    getEnvValue('PUBLIC_FB_PIXEL_ID', envSource) ||
    getEnvValue('FB_PIXEL_ID', envSource) ||
    getEnvValue('META_PIXEL_ID', envSource);

  const metaCapiToken =
    dbCapiToken ||
    getEnvValue('META_CAPI_ACCESS_TOKEN', envSource) ||
    getEnvValue('META_CAPI_TOKEN', envSource);

  const googleTagManagerId =
    dbGoogleTagManagerId ||
    getEnvValue('PUBLIC_GTM_ID', envSource) ||
    getEnvValue('GTM_ID', envSource);

  const candidateGoogleAdsConversionId =
    dbGoogleId || getEnvValue('GOOGLE_ADS_CONVERSION_ID', envSource);
  const candidateGoogleAdsConversionLabel =
    dbGoogleLabel || getEnvValue('GOOGLE_ADS_CONVERSION_LABEL', envSource);
  const hasGoogleAdsConversion = hasValidGoogleAdsConversion(
    candidateGoogleAdsConversionId,
    candidateGoogleAdsConversionLabel,
  );

  return {
    metaPixelId,
    metaCapiToken,
    googleTagManagerId,
    googleAdsConversionId: hasGoogleAdsConversion ? candidateGoogleAdsConversionId : '',
    googleAdsConversionLabel: hasGoogleAdsConversion ? candidateGoogleAdsConversionLabel : '',
  };
}
