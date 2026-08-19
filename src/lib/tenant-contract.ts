export const STOREFRONT_TEMPLATE_IDS = [
  "compact-market",
] as const;

/**
 * Persisted definitions extend the built-in IDs at runtime. The identifier is
 * deliberately only a constrained slug; existence and definition validity are
 * checked against D1 by the storefront template resolver.
 */
export type StorefrontTemplateId = string;

export function isStorefrontTemplateId(
  value: string,
): value is StorefrontTemplateId {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 40;
}
