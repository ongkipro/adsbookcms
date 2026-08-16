export const STOREFRONT_TEMPLATE_IDS = [
  "compact-market",
  "wide-catalog",
] as const;

export type StorefrontTemplateId = (typeof STOREFRONT_TEMPLATE_IDS)[number];

export function isStorefrontTemplateId(
  value: string,
): value is StorefrontTemplateId {
  return STOREFRONT_TEMPLATE_IDS.some((candidate) => candidate === value);
}
