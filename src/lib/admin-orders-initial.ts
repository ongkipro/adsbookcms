import { sourceSlugPredicate } from "./source-slug.ts";

/**
 * The filters `/admin/orders` server-renders its first rows under: the ones
 * OrdersTable starts from (`?search=`, `?status=` or `?shipping_status=`,
 * `?source_slug=`), read the way the island reads them, as the same predicates
 * `GET /api/admin/orders` applies. Without them a deep link painted every
 * order under a filter that said otherwise until the client fetch returned.
 *
 * lazy: the predicates are restated here, not shared, because the list API
 * builds its WHERE inline in a protected route. `admin-orders-initial.test.ts`
 * fails when the two disagree on a deep link. Upgrade path: move the API's
 * builder into this module and call it from both.
 */
export function initialOrderListWhere(pageQuery: URLSearchParams): {
  sql: string;
  params: string[];
} {
  const parts = ["shipping_status <> 'abandoned'"];
  const params: string[] = [];
  const search = String(pageQuery.get("search") || "").trim().slice(0, 120);
  if (search) {
    const term = `%${search}%`;
    parts.push("(customer_name LIKE ? OR customer_phone LIKE ? OR order_number LIKE ? OR cnote_no LIKE ?)");
    params.push(term, term, term, term);
  }
  const status = String(pageQuery.get("status") || pageQuery.get("shipping_status") || "all")
    .trim()
    .toLowerCase();
  if (status !== "all") {
    parts.push("shipping_status = ?");
    params.push(status);
  }
  const sourceSlug = sourceSlugPredicate(pageQuery.get("source_slug"));
  if (sourceSlug) {
    parts.push(sourceSlug.sql);
    params.push(...sourceSlug.params);
  }
  return { sql: parts.join(" AND "), params };
}
