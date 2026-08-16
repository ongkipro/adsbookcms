export type TrafficSourceType = 'meta' | 'google' | 'tiktok' | 'organic' | 'custom';

export type TrafficSourceInfo = {
  type: TrafficSourceType;
  label: string;
  badgeClass: string;
  textClass: string;
  iconName?: string;
  details: {
    gclid?: string;
    fbclid?: string;
    ttclid?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
};

/**
 * Parses ad click IDs JSON string and resolves canonical lead traffic source
 */
export function parseTrafficSource(rawClickIds?: string | null): TrafficSourceInfo {
  let parsed: Record<string, unknown> = {};

  if (rawClickIds && typeof rawClickIds === 'string') {
    try {
      const json = JSON.parse(rawClickIds);
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      // Ignore JSON parse errors for corrupt cookies/payloads
    }
  }

  const gclid = typeof parsed.gclid === 'string' ? parsed.gclid : undefined;
  const gbraid = typeof parsed.gbraid === 'string' ? parsed.gbraid : undefined;
  const wbraid = typeof parsed.wbraid === 'string' ? parsed.wbraid : undefined;
  const fbclid = typeof parsed.fbclid === 'string' ? parsed.fbclid : undefined;
  const fbc = typeof parsed._fbc === 'string' ? parsed._fbc : undefined;
  const fbp = typeof parsed._fbp === 'string' ? parsed._fbp : undefined;
  const ttclid = typeof parsed.ttclid === 'string' ? parsed.ttclid : undefined;

  const utmSource = typeof parsed.utm_source === 'string' ? parsed.utm_source.toLowerCase().trim() : undefined;
  const utmMedium = typeof parsed.utm_medium === 'string' ? parsed.utm_medium.trim() : undefined;
  const utmCampaign = typeof parsed.utm_campaign === 'string' ? parsed.utm_campaign.trim() : undefined;

  const details = {
    gclid: gclid || gbraid || wbraid,
    fbclid: fbclid || (fbc ? fbc : undefined),
    ttclid,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
  };

  // 1. Meta Ads (fbclid, _fbc, _fbp, or utm_source contains meta/facebook/instagram/fb/ig)
  const isMeta = Boolean(
    fbclid ||
      fbc ||
      fbp ||
      (utmSource && (utmSource.includes('meta') || utmSource.includes('facebook') || utmSource.includes('fb') || utmSource.includes('instagram') || utmSource.includes('ig'))),
  );

  if (isMeta) {
    let label = 'Meta Ads';
    if (utmSource?.includes('instagram') || utmSource?.includes('ig')) {
      label = 'Instagram Ads';
    } else if (utmSource?.includes('facebook') || utmSource?.includes('fb')) {
      label = 'Facebook Ads';
    }

    return {
      type: 'meta',
      label,
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/80 hover:bg-blue-100/70',
      textClass: 'text-blue-600 font-semibold',
      details,
    };
  }

  // 2. Google Ads (gclid, gbraid, wbraid, or utm_source contains google/gads/cpc)
  const isGoogle = Boolean(
    gclid ||
      gbraid ||
      wbraid ||
      (utmSource && (utmSource.includes('google') || utmSource.includes('gads') || utmSource.includes('cpc'))),
  );

  if (isGoogle) {
    return {
      type: 'google',
      label: 'Google Ads',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100/70',
      textClass: 'text-emerald-600 font-semibold',
      details,
    };
  }

  // 3. TikTok Ads (ttclid, or utm_source contains tiktok/tt)
  const isTikTok = Boolean(
    ttclid || (utmSource && (utmSource.includes('tiktok') || utmSource.includes('tt'))),
  );

  if (isTikTok) {
    return {
      type: 'tiktok',
      label: 'TikTok Ads',
      badgeClass: 'bg-purple-50 text-purple-700 border-purple-200/80 hover:bg-purple-100/70',
      textClass: 'text-purple-600 font-semibold',
      details,
    };
  }

  // 4. Custom UTM Referral
  if (utmSource && utmSource !== 'organic' && utmSource !== 'direct') {
    const formattedSource = utmSource.charAt(0).toUpperCase() + utmSource.slice(1);
    return {
      type: 'custom',
      label: `${formattedSource} Referral`,
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80 hover:bg-amber-100/70',
      textClass: 'text-amber-600 font-semibold',
      details,
    };
  }

  // 5. Organic / Direct
  return {
    type: 'organic',
    label: 'Organic / Direct',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200/60',
    textClass: 'text-slate-500 font-medium',
    details,
  };
}
