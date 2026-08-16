import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../lib/api";
import {
  buildEmbedFormUrl,
  buildEmbedFormUrls,
  buildFormUrl,
  buildFormUrls,
  parseFormMode,
  resolveFormVariant,
} from "../../lib/form-config";
import {
  loadStoreCodDisabledProvinceCodes,
  resolveFormModeContext,
} from "../../lib/form-mode";
import { getRuntimeEnv } from "../../lib/env";
import { getStorefrontProduct } from "../../lib/catalog";
import { catalogItemGroupId, catalogItemId } from "../../lib/catalog-feed";

export const prerender = false;

const PUBLIC_CACHE_CONTROL =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";
const STORE_CONFIG_CACHE_KEY = "store-config:cod-disabled-province-codes:v1";
const STORE_CONFIG_CACHE_TTL_SECONDS = 300;

async function loadCachedStoreCodDisabledProvinceCodes(
  database: D1Database | undefined,
  sessions: KVNamespace | undefined,
): Promise<string[]> {
  if (sessions) {
    try {
      const cached = await sessions.get<unknown>(STORE_CONFIG_CACHE_KEY, "json");
      if (
        Array.isArray(cached) &&
        cached.every((code): code is string => typeof code === "string")
      ) {
        return cached;
      }
    } catch (error) {
      console.error("store-config-kv-read", error);
    }
  }

  const disabledCodes = await loadStoreCodDisabledProvinceCodes(database);

  if (sessions) {
    try {
      await sessions.put(
        STORE_CONFIG_CACHE_KEY,
        JSON.stringify(disabledCodes),
        { expirationTtl: STORE_CONFIG_CACHE_TTL_SECONDS },
      );
    } catch (error) {
      console.error("store-config-kv-write", error);
    }
  }

  return disabledCodes;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const productKey = String(url.searchParams.get("product_id") || "").trim();
  const variantKey = String(url.searchParams.get("variant_id") || "").trim();
  const requestedMode = parseFormMode(
    String(url.searchParams.get("form") || "hybrid").toLowerCase(),
  );

  if (!productKey) {
    return jsonError("product_id wajib diisi.", 400, {
      code: "PRODUCT_ID_REQUIRED",
    });
  }
  if (!requestedMode) {
    return jsonError("form harus middle, full, atau hybrid.", 400, {
      code: "FORM_MODE_INVALID",
    });
  }

  const product = await getStorefrontProduct(locals, productKey);
  if (!product) {
    return jsonError("Produk aktif tidak ditemukan.", 404, {
      code: "PRODUCT_NOT_FOUND",
    });
  }

  const selectedVariant = resolveFormVariant(product, variantKey);
  if (!selectedVariant) {
    return jsonError("Varian aktif tidak ditemukan untuk produk ini.", 404, {
      code: "VARIANT_NOT_FOUND",
    });
  }

  const runtimeEnv = getRuntimeEnv(locals);
  const database = runtimeEnv?.OMS_DB as D1Database | undefined;
  const sessions = runtimeEnv?.SESSION as KVNamespace | undefined;
  const disabledCodes = await loadCachedStoreCodDisabledProvinceCodes(
    database,
    sessions,
  );
  const modeContext = await resolveFormModeContext(request, disabledCodes);
  const formUrls = buildFormUrls(product, selectedVariant);
  const embedUrls = buildEmbedFormUrls(product, selectedVariant);
  const resolvedMode =
    requestedMode === "hybrid" ? modeContext.resolvedMode : requestedMode;

  return jsonOk(
    {
      product: {
        id: product.catalogId,
        content_id: catalogItemGroupId(product.productId),
        slug: product.slug,
        name: product.productName,
        image: product.image,
        price: product.price,
        compare_price: product.comparePrice,
      },
      variants: product.variants.map((variant) => ({
        id: variant.catalogId,
        content_id: catalogItemId(product.productId, variant.id),
        label: variant.label,
        price: variant.price,
        compare_price: variant.comparePrice ?? variant.price,
      })),
      selected_variant: {
        id: selectedVariant.catalogId,
        content_id: catalogItemId(product.productId, selectedVariant.id),
        label: selectedVariant.label,
        price: selectedVariant.price,
        compare_price: selectedVariant.comparePrice ?? selectedVariant.price,
      },
      form: {
        requested_mode: requestedMode,
        resolved_mode: resolvedMode,
        province: modeContext.province,
        province_code: modeContext.provinceCode,
        source: modeContext.source,
        render_url: buildFormUrl(requestedMode, product, selectedVariant),
        urls: formUrls,
        embed_url: buildEmbedFormUrl(requestedMode, product, selectedVariant),
        embed_urls: embedUrls,
      },
    },
    200,
    { "cache-control": PUBLIC_CACHE_CONTROL },
  );
};
