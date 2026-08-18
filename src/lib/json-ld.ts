export type OrganizationJsonLdInput = {
  name: string;
  url?: string;
  logo: string;
  description?: string;
  sameAs?: readonly string[];
};

export type WebsiteJsonLdInput = {
  name: string;
  url?: string;
  description?: string;
  inLanguage?: string;
};

export type ProductOfferJsonLdInput = {
  price: number | string;
  priceCurrency?: string;
  priceValidUntil?: string;
  availability: string;
  url?: string;
  name?: string;
  sku?: string;
  itemCondition?: string;
};

export type ProductJsonLdInput = {
  name: string;
  description: string;
  image: string | readonly string[];
  url: string;
  sku?: string;
  category?: string;
  brand?: string;
  ratingValue?: number;
  reviewCount?: number;
  offers: readonly ProductOfferJsonLdInput[];
};

export type BreadcrumbJsonLdInput = {
  name: string;
  url: string;
};

export type FaqJsonLdInput = {
  question: string;
  answer: string;
};

export type StorefrontJsonLdInput = {
  siteUrl: string;
  organization: OrganizationJsonLdInput;
  website: WebsiteJsonLdInput;
};

export type ProductSchemaJsonLdInput = {
  siteUrl: string;
  organization: OrganizationJsonLdInput;
  product: ProductJsonLdInput;
};

function absoluteUrl(value: string, siteUrl: string): string {
  return new URL(value, siteUrl).toString();
}

function schemaUrl(value: string): string {
  return /^https?:\/\//i.test(value)
    ? value
    : `https://schema.org/${value.replace(/^schema:/i, "")}`;
}

export function buildStorefrontJsonLd({
  siteUrl,
  organization,
  website,
}: StorefrontJsonLdInput) {
  const organizationUrl = absoluteUrl(organization.url ?? siteUrl, siteUrl);
  const websiteUrl = absoluteUrl(website.url ?? siteUrl, siteUrl);
  const organizationId = `${organizationUrl.replace(/\/$/, "")}#organization`;
  const websiteId = `${websiteUrl.replace(/\/$/, "")}#website`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: organization.name,
        url: organizationUrl,
        logo: absoluteUrl(organization.logo, siteUrl),
        ...(organization.description
          ? { description: organization.description }
          : {}),
        ...(organization.sameAs?.length
          ? { sameAs: organization.sameAs.map((url) => absoluteUrl(url, siteUrl)) }
          : {}),
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: website.name,
        url: websiteUrl,
        publisher: { "@id": organizationId },
        potentialAction: {
          "@type": "SearchAction",
          target: `${websiteUrl.replace(/\/$/, "")}/produk?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
        ...(website.description ? { description: website.description } : {}),
        ...(website.inLanguage ? { inLanguage: website.inLanguage } : {}),
      },
    ],
  };
}

export function buildProductJsonLd({
  siteUrl,
  organization,
  product,
}: ProductSchemaJsonLdInput) {
  const images = (Array.isArray(product.image)
    ? product.image
    : [product.image]
  ).map((image) => absoluteUrl(image, siteUrl));

  const offers = product.offers.map((offer) => ({
    "@type": "Offer",
    price: offer.price,
    priceCurrency: offer.priceCurrency ?? "IDR",
    ...(offer.priceValidUntil ? { priceValidUntil: offer.priceValidUntil } : {}),
    availability: schemaUrl(offer.availability),
    itemCondition: schemaUrl(offer.itemCondition ?? "NewCondition"),
    url: absoluteUrl(offer.url ?? product.url, siteUrl),
    seller: {
      "@type": "Organization",
      name: organization.name,
    },
    ...(offer.name ? { name: offer.name } : {}),
    ...(offer.sku ? { sku: offer.sku } : {}),
  }));

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: images,
    url: absoluteUrl(product.url, siteUrl),
    brand: {
      "@type": "Brand",
      name: product.brand ?? organization.name,
    },
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(typeof product.ratingValue === 'number' && typeof product.reviewCount === 'number' && product.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingValue,
            reviewCount: product.reviewCount,
          },
        }
      : {}),
    offers: offers.length === 1 ? offers[0] : offers,
  };
}
export function buildBreadcrumbJsonLd({
  siteUrl,
  breadcrumbs,
}: {
  siteUrl: string;
  breadcrumbs: readonly BreadcrumbJsonLdInput[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((breadcrumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: breadcrumb.name,
      item: absoluteUrl(breadcrumb.url, siteUrl),
    })),
  };
}

export function buildFaqJsonLd({ faqs }: { faqs: readonly FaqJsonLdInput[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
export type ItemListItemInput = {
  name: string;
  url: string;
  image?: string;
  price?: number;
  description?: string;
};

export function buildItemListJsonLd({
  siteUrl,
  name,
  items,
}: {
  siteUrl: string;
  name: string;
  items: readonly ItemListItemInput[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.url, siteUrl),
      ...(item.image ? { image: absoluteUrl(item.image, siteUrl) } : {}),
      ...(typeof item.price === "number"
        ? {
            offers: {
              "@type": "Offer",
              price: item.price,
              priceCurrency: "IDR",
              availability: "https://schema.org/InStock",
            },
          }
        : {}),
    })),
  };
}
