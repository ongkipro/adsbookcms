import type { Product } from "../data/products";

export interface CatalogProductRow {
  id: number;
  title: string;
  slug: string;
  category?: string | null;
  image_url?: string | null;
  is_active?: number | null;
  created_at?: string | null;
}

export interface CatalogVariantRow {
  id: number;
  product_id: number;
  sku?: string | null;
  title: string;
  price: number;
  compare_price?: number | null;
  stock?: number | null;
}

function variantLabel(productTitle: string, variantTitle: string): string {
  const cleanVariant = variantTitle.trim();
  return cleanVariant || productTitle.trim();
}

function getCatalogProductDetails(title: string, category: string) {
  const categoryLabel = category.trim() || "Produk";
  return {
    subheadline: `Pilih varian ${title} berdasarkan opsi dan harga yang tersedia.`,
    description: `${title} tercantum dalam kategori ${categoryLabel}. Detail yang ditampilkan mengikuti data katalog toko.`,
    benefits: [],
    keyPoints: [],
    idealFor: [],
  };
}

export function mergeStorefrontCatalog(
  editorialProducts: Product[],
  productRows: CatalogProductRow[],
  variantRows: CatalogVariantRow[]
) {
  const variantsByProduct = new Map<number, CatalogVariantRow[]>();
  for (const variant of variantRows) {
    if (!variant.product_id) continue;
    const existing = variantsByProduct.get(variant.product_id) ?? [];
    existing.push(variant);
    variantsByProduct.set(variant.product_id, existing);
  }

  const matchedProductIds = new Set<string>();

  const catalog = editorialProducts.flatMap((editorialProduct) => {
    const matchedRow = productRows.find(
      (row) =>
        row.slug === editorialProduct.slug ||
        row.id === editorialProduct.catalogId ||
        String(row.id) === editorialProduct.productId ||
        row.title.toLowerCase().trim() === editorialProduct.productName.toLowerCase().trim()
    );

    if (productRows.length > 0 && !matchedRow) {
      return [];
    }
    if (matchedRow && !matchedRow.is_active) {
      return [];
    }

    if (matchedRow) {
      matchedProductIds.add(String(matchedRow.id));
    }

    const availableVariants = matchedRow
      ? variantsByProduct.get(matchedRow.id) ?? []
      : [];

    if (matchedRow && availableVariants.length === 0) {
      return [];
    }

    const productName = matchedRow?.title?.trim() || editorialProduct.productName;
    const slug = matchedRow?.slug?.trim() || editorialProduct.slug;
    const category = matchedRow?.category?.trim() || editorialProduct.category;

    const variants =
      availableVariants.length > 0
        ? availableVariants
            .filter((variant) => variant.price > 0 && (variant.stock === null || variant.stock === undefined || variant.stock > 0))
            .map((variant) => {
              const comparePrice =
                variant.compare_price && variant.compare_price > variant.price
                  ? variant.compare_price
                  : undefined;
              return {
                catalogId: variant.id,
                ...(variant.sku ? { sku: variant.sku } : {}),
                id: String(variant.id),
                label: variantLabel(productName, variant.title),
                price: variant.price,
                ...(comparePrice ? { comparePrice } : {}),
              };
            })
        : editorialProduct.variants;

    if (variants.length === 0) return [];

    const firstVariant = variants[0];
    const image = matchedRow?.image_url || editorialProduct.image || editorialProduct.heroImage;

    const baseDir = image.endsWith("/1.webp") ? image.slice(0, -7) : null;
    const galleryImages = baseDir
      ? [1, 2, 3, 4, 5, 6, 7].map((num) => `${baseDir}/${num}.webp`)
      : editorialProduct.images || [image];

    return [
      {
        ...editorialProduct,
        ...(matchedRow ? { catalogId: matchedRow.id, productId: String(matchedRow.id) } : {}),
        productName,
        slug,
        category,
        price: firstVariant.price,
        ...(firstVariant.comparePrice ? { comparePrice: firstVariant.comparePrice } : {}),
        image,
        heroImage: image,
        images: galleryImages,
        variants,
      },
    ];
  });

  for (const product of productRows) {
    const productId = String(product.id);
    if (!product.is_active || matchedProductIds.has(productId)) continue;

    const productName = product.title.trim() || `Produk #${product.id}`;
    const variants = (variantsByProduct.get(product.id) ?? [])
      .filter((variant) => variant.price > 0 && (variant.stock === null || variant.stock === undefined || variant.stock > 0))
      .map((variant) => {
        // Compare price is merchant data or nothing. Never synthesised.
        const comparePrice =
          variant.compare_price && variant.compare_price > variant.price
            ? variant.compare_price
            : undefined;
        return {
          catalogId: variant.id,
          ...(variant.sku ? { sku: variant.sku } : {}),
          id: String(variant.id),
          label: variantLabel(productName, variant.title),
          price: variant.price,
          ...(comparePrice ? { comparePrice } : {}),
        };
      });

    if (variants.length === 0) continue;

    const firstVariant = variants[0];
    const image = product.image_url || "/images/adsbook-mark.webp";

    const categoryLabel = product.category?.trim() || "Produk";
    const details = getCatalogProductDetails(productName, categoryLabel);

    catalog.push({
      catalogId: product.id,
      productId,
      slug: product.slug,
      productName,
      contentName: productName,
      headline: productName,
      subheadline: details.subheadline,
      seoTitle: productName,
      seoDescription: `Lihat pilihan varian, harga, dan ketersediaan ${productName}. Detail mengikuti informasi katalog toko.`,
      price: firstVariant.price,
      ...(firstVariant.comparePrice ? { comparePrice: firstVariant.comparePrice } : {}),
      image,
      heroImage: image,
      images: [image],
      tag: categoryLabel,
      category: categoryLabel,
      relatedCategories: [categoryLabel],
      description: details.description,
      benefits: details.benefits,
      keyPoints: details.keyPoints,
      idealFor: details.idealFor,
      offerText: "Harga mengikuti varian terpilih.",
      ctaText: "Lanjutkan Pesanan",
      // Ratings, sold counts and reviews are merchant-owned evidence. They are
      // published through /admin/content or they do not exist. Downstream
      // consumers already omit the rating block, the review section and the
      // JSON-LD aggregateRating when these are absent.
      reviews: [],
      variants,
    });
  }

  return catalog;
}