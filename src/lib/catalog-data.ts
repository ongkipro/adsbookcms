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

type PublicationProduct = {
  title?: string | null;
  slug?: string | null;
  image_url?: string | null;
};

type PublicationVariant = {
  title?: string | null;
  price?: number | null;
  stock?: number | null;
};

export function getPublicProductValidationError(
  product: PublicationProduct,
  variants: readonly PublicationVariant[],
): string | null {
  if (!product.title?.trim()) {
    return "Produk aktif wajib memiliki judul.";
  }
  if (!product.slug?.trim()) {
    return "Produk aktif wajib memiliki slug.";
  }
  if (!product.image_url?.trim()) {
    return "Produk aktif wajib memiliki gambar.";
  }
  if (
    !variants.some(
      (variant) =>
        Boolean(variant.title?.trim()) &&
        Number.isSafeInteger(variant.price) &&
        Number(variant.price) > 0 &&
        Number.isSafeInteger(variant.stock) &&
        Number(variant.stock) > 0,
    )
  ) {
    return "Produk aktif wajib memiliki minimal 1 varian valid dan tersedia.";
  }
  return null;
}

export function mergeStorefrontCatalog(
  productRows: CatalogProductRow[],
  variantRows: CatalogVariantRow[],
  runtimePresentations: Product[] = [],
): Product[] {
  const variantsByProduct = new Map<number, CatalogVariantRow[]>();
  for (const variant of variantRows) {
    if (!Number.isSafeInteger(variant.product_id) || variant.product_id <= 0) {
      continue;
    }
    const existing = variantsByProduct.get(variant.product_id) ?? [];
    existing.push(variant);
    variantsByProduct.set(variant.product_id, existing);
  }

  const presentationsByProductId = new Map<string, Product>();
  for (const presentation of runtimePresentations) {
    presentationsByProductId.set(String(presentation.productId), presentation);
  }

  const catalog: Product[] = [];
  for (const product of productRows) {
    if (
      !product.is_active ||
      !Number.isSafeInteger(product.id) ||
      product.id <= 0
    ) {
      continue;
    }

    const availableVariants = (variantsByProduct.get(product.id) ?? []).filter(
      (variant) =>
        Number.isSafeInteger(variant.id) &&
        variant.id > 0 &&
        Boolean(variant.title?.trim()) &&
        Number.isSafeInteger(variant.price) &&
        variant.price > 0 &&
        Number.isSafeInteger(variant.stock) &&
        Number(variant.stock) > 0,
    );
    const publicationError = getPublicProductValidationError(
      product,
      availableVariants,
    );
    if (publicationError) continue;

    const productId = String(product.id);
    const productName = product.title.trim();
    const slug = product.slug.trim();
    const image = product.image_url!.trim();
    const categoryLabel = product.category?.trim() || "Produk";
    const presentation = presentationsByProductId.get(productId);
    const details = {
      subheadline: `Pilih varian ${productName} berdasarkan opsi dan harga yang tersedia.`,
      description: `${productName} tercantum dalam kategori ${categoryLabel}. Detail yang ditampilkan mengikuti data katalog toko.`,
      benefits: [],
      keyPoints: [],
      idealFor: [],
    };

    const variants = availableVariants.map((variant) => {
      const comparePrice =
        Number.isSafeInteger(variant.compare_price) &&
        Number(variant.compare_price) > variant.price
          ? Number(variant.compare_price)
          : undefined;
      return {
        catalogId: variant.id,
        ...(variant.sku?.trim() ? { sku: variant.sku.trim() } : {}),
        id: String(variant.id),
        label: variant.title.trim(),
        price: variant.price,
        ...(comparePrice ? { comparePrice } : {}),
      };
    });
    const firstVariant = variants[0];

    catalog.push({
        catalogId: product.id,
        productId,
        slug,
        productName,
        contentName: presentation?.contentName || productName,
        headline: presentation?.headline || productName,
        subheadline: presentation?.subheadline || details.subheadline,
        seoTitle: presentation?.seoTitle || productName,
        seoDescription:
          presentation?.seoDescription ||
          `Lihat pilihan varian, harga, dan ketersediaan ${productName}. Detail mengikuti informasi katalog toko.`,
        price: firstVariant.price,
        ...(firstVariant.comparePrice
          ? { comparePrice: firstVariant.comparePrice }
          : {}),
        image,
        heroImage: image,
        images: [image],
        tag: presentation?.tag || categoryLabel,
        category: categoryLabel,
        relatedCategories:
          presentation?.relatedCategories?.length
            ? presentation.relatedCategories
            : [categoryLabel],
        ...(presentation?.relatedTags
          ? { relatedTags: presentation.relatedTags }
          : {}),
        description: presentation?.description || details.description,
        benefits: presentation?.benefits || details.benefits,
        keyPoints: presentation?.keyPoints || details.keyPoints,
        idealFor: presentation?.idealFor || details.idealFor,
        offerText:
          presentation?.offerText || "Harga mengikuti varian terpilih.",
        ctaText: presentation?.ctaText || "Lanjutkan Pesanan",
        ...(presentation?.ratingValue !== undefined
          ? { ratingValue: presentation.ratingValue }
          : {}),
        ...(presentation?.reviewCount !== undefined
          ? { reviewCount: presentation.reviewCount }
          : {}),
        ...(presentation?.soldCount !== undefined
          ? { soldCount: presentation.soldCount }
          : {}),
        reviews: presentation?.reviews || [],
        variants,
    });
  }
  return catalog;
}