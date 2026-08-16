
const MAX_VARIANTS = 200;
export function createCatalogProductId() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return 10_000 + (values[0] % 90_000);
}

export type ProductMutationPayload = {
  id?: unknown;
  title?: unknown;
  slug?: unknown;
  category?: unknown;
  is_active?: unknown;
  image_url?: unknown;
  variants?: unknown;
};

export type ProductStatusTogglePayload = {
  id: number;
  is_active: boolean;
};

type ProductStatusToggleParseResult =
  | { value: ProductStatusTogglePayload }
  | { error: string };

export function parseProductStatusTogglePayload(
  input: unknown,
): ProductStatusToggleParseResult | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  const isStatusOnlyPayload =
    Object.hasOwn(record, "is_active") &&
    keys.every((key) => key === "id" || key === "is_active");
  if (!isStatusOnlyPayload) return null;

  const productId =
    typeof record.id === "number"
      ? record.id
      : typeof record.id === "string" && /^\d+$/.test(record.id)
        ? Number(record.id)
        : Number.NaN;
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return { error: "ID produk tidak valid." };
  }
  if (typeof record.is_active !== "boolean") {
    return { error: "Status produk harus berupa boolean." };
  }

  return {
    value: {
      id: productId,
      is_active: record.is_active,
    },
  };
}

export async function updateProductActiveStatus(
  database: D1Database,
  payload: ProductStatusTogglePayload,
): Promise<boolean> {
  const result = await database
    .prepare("UPDATE products SET is_active = ? WHERE id = ?")
    .bind(payload.is_active ? 1 : 0, payload.id)
    .run();
  return Boolean(result.meta.changes);
}

type ParsedVariant = {
  id?: number;
  sku: string;
  title: string;
  price: number;
  compare_price: number | null;
  weight_grams: number;
  stock: number;
};

type ParsedProduct = {
  id?: number;
  title: string;
  slug: string;
  category: string;
  image_url: string | null;
  is_active: boolean;
  variants: ParsedVariant[];
};

type ParseResult<T> = { value: T } | { error: string };

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function capitalizeTitle(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseInteger(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numberValue) ? numberValue : null;
}

export function parseProductMutationPayload(
  body: ProductMutationPayload | null,
  requireId: true,
): ParseResult<ParsedProduct & { id: number }>;
export function parseProductMutationPayload(
  body: ProductMutationPayload | null,
  requireId: false,
): ParseResult<ParsedProduct>;
export function parseProductMutationPayload(
  body: ProductMutationPayload | null,
  requireId: boolean,
): ParseResult<ParsedProduct> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Payload tidak valid." };
  }

  const rawTitle = clean(body.title, 160);
  const title = capitalizeTitle(rawTitle);
  const slug = normalizeSlug(clean(body.slug, 200)) || normalizeSlug(title);
  const category = clean(body.category, 120) || "Umum";
  const imageUrl = clean(body.image_url, 500);
  if (
    imageUrl &&
    !imageUrl.startsWith("/assets/uploads/") &&
    !imageUrl.startsWith("/images/")
  ) {
    return { error: "URL gambar produk tidak valid." };
  }
  const isActive = typeof body.is_active === "boolean" ? body.is_active : true;
  const parsedProductId =
    body.id === undefined ? undefined : parseInteger(body.id);

  if (
    parsedProductId !== undefined &&
    (parsedProductId === null || parsedProductId <= 0)
  ) {
    return { error: "ID produk tidak valid." };
  }
  if (requireId && parsedProductId === undefined) {
    return { error: "ID produk wajib valid untuk update." };
  }
  if (!requireId && parsedProductId !== undefined) {
    return { error: "ID produk dibuat otomatis oleh sistem." };
  }
  const productId = parsedProductId ?? undefined;
  if (!title || !slug) {
    return { error: "Judul dan slug produk wajib diisi." };
  }
  if (!Array.isArray(body.variants) || body.variants.length === 0) {
    return { error: "Produk minimal harus memiliki 1 varian." };
  }
  if (body.variants.length > MAX_VARIANTS) {
    return { error: `Produk maksimal memiliki ${MAX_VARIANTS} varian.` };
  }

  const variants: ParsedVariant[] = [];
  const skuSet = new Set<string>();
  const variantIdSet = new Set<number>();

  for (const rawVariant of body.variants) {
    if (
      !rawVariant ||
      typeof rawVariant !== "object" ||
      Array.isArray(rawVariant)
    ) {
      return { error: "Data varian tidak valid." };
    }

    const variantId =
      rawVariant.id === undefined ? undefined : parseInteger(rawVariant.id);
    if (!requireId && variantId !== undefined) {
      return { error: "ID varian dibuat otomatis oleh D1." };
    }
    const sku = clean(rawVariant.sku, 80).toUpperCase();
    const rawTitleStr = typeof rawVariant.title === "string" ? rawVariant.title.trim() : "";
    if (rawTitleStr.length > 15) {
      return { error: `Nama varian "${rawTitleStr}" melebihi batas maksimal 15 karakter.` };
    }
    const variantTitle = clean(rawVariant.title, 15);
    const price = parseInteger(rawVariant.price);
    const comparePrice =
      rawVariant.compare_price === undefined ||
      rawVariant.compare_price === null ||
      rawVariant.compare_price === ""
        ? null
        : parseInteger(rawVariant.compare_price);
    const weightGrams = parseInteger(rawVariant.weight_grams) ?? 1000;
    const rawStock = parseInteger(rawVariant.stock);
    const stock = rawStock === null ? 1000 : rawStock < 0 ? 0 : rawStock;

    if (variantId !== undefined && (!variantId || variantId <= 0)) {
      return { error: "ID varian tidak valid." };
    }
    if (!sku || !variantTitle) {
      return { error: "SKU dan judul varian wajib diisi." };
    }
    if (skuSet.has(sku)) {
      return { error: `SKU ${sku} duplikat dalam payload.` };
    }
    if (variantId !== undefined && variantIdSet.has(variantId)) {
      return { error: "ID varian duplikat dalam payload." };
    }
    if (!price || price <= 0) {
      return { error: `Harga varian ${sku} harus integer positif.` };
    }
    if (!weightGrams || weightGrams <= 0) {
      return { error: `Berat varian ${sku} harus integer positif.` };
    }
    if (comparePrice !== null && comparePrice < 0) {
      return { error: `Harga coret varian ${sku} harus nol atau lebih.` };
    }
    if (comparePrice !== null && comparePrice < price) {
      return {
        error: `Harga coret varian ${sku} tidak boleh lebih kecil dari harga jual.`,
      };
    }

    skuSet.add(sku);
    variants.push({
      id: variantId,
      sku,
      title: variantTitle,
      price,
      compare_price: comparePrice,
      weight_grams: weightGrams,
      stock,
    });
  }

  return {
    value: {
      id: productId,
      title,
      slug,
      category,
      image_url: imageUrl || null,
      is_active: isActive,
      variants,
    },
  };
}

export type ProductDeletionResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "referenced" };

export async function deleteCatalogProduct(
  database: D1Database,
  productId: number,
): Promise<ProductDeletionResult> {
  const product = await database
    .prepare("SELECT id FROM products WHERE id = ? LIMIT 1")
    .bind(productId)
    .first();
  if (!product) return { status: "not_found" };

  const results = await database.batch([
    database
      .prepare(
        `
        DELETE FROM product_variants
        WHERE product_id = ?
          AND NOT EXISTS (
            SELECT 1
            FROM order_items oi
            INNER JOIN product_variants referenced
              ON referenced.id = oi.variant_id
            WHERE referenced.product_id = ?
          )
      `,
      )
      .bind(productId, productId),
    database
      .prepare(
        `
        DELETE FROM products
        WHERE id = ?
          AND NOT EXISTS (
            SELECT 1 FROM product_variants WHERE product_id = ?
          )
      `,
      )
      .bind(productId, productId),
  ]);
  return Number(results[1]?.meta?.changes || 0) > 0
    ? { status: "deleted" }
    : { status: "referenced" };
}
