/**
 * Automatic Google & Meta Product Taxonomy Engine
 *
 * Automatically maps product category, title, and description to official:
 * 1. Google Product Category (GPC) Numeric ID (e.g. 2863)
 * 2. Google Product Category Full Path String (e.g. "Home & Garden > Lawn & Garden > Gardening > Fertilizer")
 * 3. Meta Commerce Product Category Path (e.g. "Home & Garden > Lawn & Garden > Gardening > Fertilizer")
 * 4. Structured Product Type Path (e.g. "Pertanian > Pupuk & Nutrisi")
 *
 * Zero manual effort required by merchant — fully derived from catalog metadata.
 */

export interface AdTaxonomy {
  /**
   * Absent when no rule was confident enough. A feed omits the category rather
   * than asserting one — see DEFAULT_TAXONOMY.
   */
  googleCategoryId?: number;
  googleCategoryName?: string;
  metaCategoryName?: string;
  productType: string;
}

interface TaxonomyRule {
  id: number;
  googlePath: string;
  metaPath: string;
  productType: string;
  keywords: string[];
}

const TAXONOMY_RULES: TaxonomyRule[] = [
  {
    id: 6551,
    googlePath: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags",
    metaPath: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags",
    productType: "Fashion Wanita > Tas & Aksesori",
    keywords: [
      "tas", "tote", "bag", "dompet", "selempang", "shoulder", "handbag",
      "clutch", "ransel", "pouch", "sling", "canvas", "tote bag", "sling bag"
    ],
  },
  {
    id: 2863,
    googlePath: "Home & Garden > Lawn & Garden > Gardening > Fertilizer",
    metaPath: "Home & Garden > Lawn & Garden > Gardening > Fertilizer",
    productType: "Pertanian > Pupuk & Nutrisi",
    keywords: [
      "pupuk", "fertilizer", "sawit", "padi", "cabai", "jagung", "tanaman", "ganoderma",
      "pertanian", "hama", "buah", "daun", "akar", "nutrisi tanaman", "organik", "nPK"
    ],
  },
  {
    id: 2849,
    googlePath: "Home & Garden > Lawn & Garden > Gardening",
    metaPath: "Home & Garden > Lawn & Garden > Gardening",
    productType: "Pertanian > Perkebunan & Benih",
    keywords: ["benih", "biji", "bibit", "kebun", "taman", "media tanam", "pot"],
  },
  {
    id: 2547,
    googlePath: "Health & Beauty > Personal Care > Cosmetics > Skin Care",
    metaPath: "Health & Beauty > Personal Care > Cosmetics > Skin Care",
    productType: "Kecantikan & Perawatan > Skincare",
    keywords: [
      "skincare", "skin care", "serum", "lotion", "cream", "krim", "pemutih", "kojic",
      "kojien", "wajah", "kulit", "glowing", "acne", "jerawat", "toner", "sunscreen"
    ],
  },
  {
    id: 567,
    googlePath: "Health & Beauty > Personal Care > Soap",
    metaPath: "Health & Beauty > Personal Care > Soap",
    productType: "Kecantikan & Perawatan > Sabun & Mandi",
    keywords: ["sabun", "soap", "body wash", "mandi", "cleanser"],
  },
  {
    id: 642,
    googlePath: "Health & Beauty > Health Care > Biotherapy & Alternative Medicine > Herbal Supplements",
    metaPath: "Health & Beauty > Health Care > Fitness & Nutrition > Vitamins & Supplements",
    productType: "Kesehatan > Suplemen Herbal",
    keywords: [
      "herbal", "madu", "stamina", "vitalitas", "jamu", "pinang", "teh herbal",
      "suplemen", "kesehatan", "obat herbal", "kapsul"
    ],
  },
  {
    id: 1604,
    googlePath: "Apparel & Accessories > Clothing",
    metaPath: "Apparel & Accessories > Clothing",
    productType: "Fashion & Pakaian > Pakaian",
    keywords: ["baju", "kaos", "shirt", "celana", "jaket", "hoodie", "pakaian", "dress", "gamis", "fashion"],
  },
  {
    id: 1630,
    googlePath: "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils",
    metaPath: "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils",
    productType: "Perkakas & Rumah Tangga > Alat Dapur",
    keywords: ["pisau", "asahan", "alat dapur", "dapur", "pengasah", "potong", "perkakas", "rumah tangga"],
  },
  {
    id: 222,
    googlePath: "Electronics",
    metaPath: "Electronics",
    productType: "Elektronik & Gadget",
    keywords: ["elektronik", "gadget", "hp", "charger", "kabel", "headset", "lampu", "led"],
  },
];

/**
 * No category at all, deliberately.
 *
 * This used to default to Handbags (`6551`), justified in the note below as "at
 * least a category this catalog sells" — true while the product shipped a
 * bundled handbag catalogue. That catalogue is gone: an install starts empty and
 * sells whatever its merchant sells. Keeping the default would have submitted
 * every unclassified product in every store to Merchant Center as a handbag,
 * which is precisely the misrepresentation the note warns about.
 *
 * `google_product_category` and `fb_product_category` are optional on both
 * platforms, and Google auto-classifies what a feed omits. Saying nothing is
 * strictly safer than saying something wrong.
 */
const DEFAULT_TAXONOMY: AdTaxonomy = {
  productType: "Umum",
};

/**
 * Scoring — deliberately conservative.
 *
 * A wrong category in a Merchant Center feed is grounds for a misrepresentation
 * suspension, and there is no catalogue to make a default safe. So a rule has to
 * earn the win, and an unconfident match emits no category at all:
 *
 * 1. Keywords match whole words, never substrings. "sebuah" used to count as a
 *    fertilizer hit ("buah"), "kertas" and "bagus" as handbag hits ("tas", "bag").
 * 2. Category and title decide. A hit there is worth NAME_HIT_WEIGHT.
 * 3. The description only breaks ties: its distinct hits are capped below the
 *    weight of a single name hit, so a long description mentioning foreign words
 *    can never outvote the words that actually name the product.
 * 4. A rule must reach MIN_SCORE — one name hit — and be the sole top scorer.
 *    Ties and under-confidence both fall through to the default.
 */
const NAME_HIT_WEIGHT = 3;
const DESCRIPTION_HIT_CAP = 2;
const MIN_SCORE = NAME_HIT_WEIGHT;

const keywordPatterns = new Map<string, RegExp>();

function matchesKeyword(text: string, keyword: string): boolean {
  if (!text) return false;
  let pattern = keywordPatterns.get(keyword);
  if (!pattern) {
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`);
    keywordPatterns.set(keyword, pattern);
  }
  return pattern.test(text);
}

function scoreRule(rule: TaxonomyRule, name: string, description: string): number {
  let nameHits = 0;
  let descriptionHits = 0;
  for (const keyword of rule.keywords) {
    // A keyword counts once, in the strongest field it appears in.
    if (matchesKeyword(name, keyword)) nameHits += 1;
    else if (matchesKeyword(description, keyword)) descriptionHits += 1;
  }
  return nameHits * NAME_HIT_WEIGHT + Math.min(descriptionHits, DESCRIPTION_HIT_CAP);
}

/**
 * Derives Google & Meta Product Taxonomy automatically from product metadata.
 */
export function getAdTaxonomy(
  category?: string | null,
  title?: string | null,
  description?: string | null
): AdTaxonomy {
  const name = [category, title].filter(Boolean).join(" ").toLowerCase().trim();
  const body = (description || "").toLowerCase().trim();

  if (!name && !body) {
    return DEFAULT_TAXONOMY;
  }

  let bestRule: TaxonomyRule | null = null;
  let bestScore = 0;
  let tied = false;

  for (const rule of TAXONOMY_RULES) {
    const score = scoreRule(rule, name, body);
    if (score < MIN_SCORE) continue;
    if (score > bestScore) {
      bestScore = score;
      bestRule = rule;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  if (bestRule && !tied) {
    return {
      googleCategoryId: bestRule.id,
      googleCategoryName: bestRule.googlePath,
      metaCategoryName: bestRule.metaPath,
      productType: bestRule.productType,
    };
  }

  // Under-confident or ambiguous: fall back cleanly, keeping the merchant's own
  // category label as the product type when there is one.
  const cleanCategory = (category || "").trim();
  return {
    ...DEFAULT_TAXONOMY,
    productType: cleanCategory ? `Umum > ${cleanCategory}` : DEFAULT_TAXONOMY.productType,
  };
}
