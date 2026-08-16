export type ProductVariant = {
  catalogId?: number;
  sku?: string;
  id: string;
  label: string;
  price: number;
  comparePrice?: number;
};

export type ProductReview = {
  name: string;
  location: string;
  avatar: string;
  verified: boolean;
  date: string;
  comment: string;
  rating: number;
};

export type Product = {
  catalogId?: number;
  slug: string;
  productId: string;
  productName: string;
  contentName: string;
  headline: string;
  subheadline: string;
  seoTitle: string;
  seoDescription: string;
  price: number;
  /** Merchant-set strike-through price. Absent when the merchant has not set one. */
  comparePrice?: number;
  image: string;
  heroImage: string;
  images?: string[];
  tag?: string;
  category: string;
  relatedCategories: string[];
  relatedTags?: string[];
  description: string;
  benefits: string[];
  keyPoints: string[];
  idealFor: string[];
  offerText: string;
  ctaText: string;
  ratingValue?: number;
  reviewCount?: number;
  soldCount?: number;
  reviews: ProductReview[];
  variants: ProductVariant[];
};

const baseProducts: Product[] = [];

export const editorialProducts: Product[] = baseProducts;

export const products: Product[] = baseProducts;

export function getProductSelectionByVariantId(variantId: string) {
  for (const product of products) {
    const variant = product.variants.find((candidate) => candidate.id === variantId);
    if (variant) return { product, variant };
  }
  return null;
}

export function formatRp(value: number) {
  return `Rp${Math.round(value).toLocaleString('id-ID').replace(/,/g, '.')}`;
}

export function getProductBySlug(slug: string) {
  return products.find((product) => product.slug === slug);
}
