import type { APIRoute } from 'astro';
import { handleOptions, headlessError, headlessOk, validateHeadlessRequest } from '../../../../lib/headless-api';
import { getStorefrontProduct, getStorefrontProducts } from '../../../../lib/catalog';
import { catalogItemGroupId, catalogItemId } from "../../../../lib/catalog-feed";

export const prerender = false;

export const OPTIONS = handleOptions;

export const GET: APIRoute = async ({ params, request, locals }) => {
  const validation = await validateHeadlessRequest(request, locals);
  if (!validation.allowed && validation.errorResponse) {
    return validation.errorResponse;
  }

  try {
    const slug = (params.slug || '').trim();
    if (!slug) {
      return headlessError('Slug atau ID produk wajib diisi.', 400, {
        code: 'SLUG_REQUIRED',
      }, validation.corsHeaders);
    }

    const product = await getStorefrontProduct(locals, slug);
    if (!product) {
      return headlessError(`Produk "${slug}" tidak ditemukan.`, 404, {
        code: 'PRODUCT_NOT_FOUND',
      }, validation.corsHeaders);
    }

    const allProducts = await getStorefrontProducts(locals);
    const relatedProducts = allProducts
      .filter((p) => p.slug !== product.slug && p.category === product.category)
      .slice(0, 4)
      .map((p) => ({
        id: p.catalogId,
        slug: p.slug,
        name: p.productName,
        price: p.price,
        compare_price: p.comparePrice,
        image: p.image,
      }));

    return headlessOk(
      {
        product: {
          id: product.catalogId,
          content_id: catalogItemGroupId(product.productId),
          slug: product.slug,
          name: product.productName,
          category: product.category,
          tag: product.tag,
          headline: product.headline,
          subheadline: product.subheadline,
          seo_title: product.seoTitle,
          seo_description: product.seoDescription,
          price: product.price,
          compare_price: product.comparePrice,
          image: product.image,
          hero_image: product.heroImage,
          description: product.description,
          benefits: product.benefits,
          key_points: product.keyPoints,
          ideal_for: product.idealFor,
          offer_text: product.offerText,
          cta_text: product.ctaText,
          rating_value: product.ratingValue,
          review_count: product.reviewCount,
          sold_count: product.soldCount,
          variants: product.variants.map((v) => ({
            id: v.catalogId,
            content_id: catalogItemId(product.productId, v.id),
            label: v.label,
            price: v.price,
            compare_price: v.comparePrice ?? v.price,
          })),
          reviews: product.reviews.map((r) => ({
            name: r.name,
            location: r.location,
            avatar: r.avatar,
            verified: r.verified,
            date: r.date,
            comment: r.comment,
            rating: r.rating,
          })),
          forms: {
            hybrid_url: `/hybrid-form?product_id=${product.catalogId}`,
            middle_url: `/middle-form?product_id=${product.catalogId}`,
            full_url: `/full-form?product_id=${product.catalogId}`,
          },
        },
        related_products: relatedProducts,
      },
      200,
      validation.corsHeaders
    );
  } catch (error) {
    return headlessError('Gagal memuat rincian produk.', 500, {
      code: 'PRODUCT_DETAIL_ERROR',
      details: error instanceof Error ? error.message : String(error),
    }, validation.corsHeaders);
  }
};
