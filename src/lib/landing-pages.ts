import { getRuntimeEnv } from "./env.ts";
import { formatIdr } from "./format-idr.ts";
import { solutionEntries } from "../data/content.ts";

type D1Statement = ReturnType<D1Database["prepare"]>;
export type LandingSectionType = "html" | "form";

export type LandingFormConfig = {
  mode?: "hybrid" | "middle" | "full";
  selected_variant_id?: string;
  section_title?: string;
  button_text?: string;
};

export type LandingSection = {
  id: string;
  landing_page_id: string;
  sort_order: number;
  type: LandingSectionType;
  content_html: string | null;
  form_config: LandingFormConfig | null;
  created_at: string;
  updated_at: string;
};

export type LandingPage = {
  id: string;
  slug: string;
  title: string;
  product_id: string;
  product_title?: string | null;
  product_slug?: string | null;
  is_active: number;
  /** 1 when this page has taken over `/produk/<product-slug>` (A21). */
  is_product_page: number;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
  sections: LandingSection[];
};

const staticLandingPages: LandingPage[] = solutionEntries.map((entry) => ({
  id: `static:${entry.slug}`,
  slug: entry.slug,
  title: entry.title,
  product_id: "",
  product_title: null,
  is_active: entry.isAvailable === false ? 0 : 1,
  // A hand-authored static page has no product to take over.
  is_product_page: 0,
  meta_title: entry.title,
  meta_description: entry.excerpt,
  created_at: "",
  updated_at: "",
  sections: [],
}));

export type LandingSectionInput = {
  id?: string;
  sort_order?: number;
  type: LandingSectionType;
  content_html?: string | null;
  form_config?: LandingFormConfig | null;
};

export type CreateLandingPageInput = {
  slug: string;
  title: string;
  product_id: string;
  is_active?: boolean | number;
  meta_title?: string | null;
  meta_description?: string | null;
  sections?: LandingSectionInput[];
};

export type UpdateLandingPageInput = Partial<CreateLandingPageInput>;

export type LandingPageDuplicatePayload = {
  action: "duplicate";
  id: string;
};

type LandingPageDuplicateParseResult =
  | { value: LandingPageDuplicatePayload }
  | { error: string };

export function parseLandingPageDuplicatePayload(
  input: unknown,
): LandingPageDuplicateParseResult | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const record = input as Record<string, unknown>;
  if (record.action !== "duplicate") return null;
  if (typeof record.id !== "string" || !record.id.trim()) {
    return { error: "Landing page ID is required" };
  }
  if (record.id.startsWith("static:")) {
    return { error: "Static landing pages cannot be duplicated" };
  }

  return {
    value: {
      action: "duplicate",
      id: record.id.trim(),
    },
  };
}

export function buildLandingPageDuplicateInput(
  source: LandingPage,
): CreateLandingPageInput {
  return {
    slug: `${source.slug}-copy`,
    title: `${source.title} (Copy)`,
    product_id: source.product_id,
    is_active: source.is_active,
    meta_title: source.meta_title,
    meta_description: source.meta_description,
    sections: source.sections.map((section) => ({
      sort_order: section.sort_order,
      type: section.type,
      content_html: section.content_html,
      form_config: section.form_config
        ? { ...section.form_config }
        : null,
    })),
  };
}

type LandingPageRow = Omit<LandingPage, "sections">;
type LandingSectionRow = Omit<LandingSection, "form_config"> & {
  form_config: string | null;
};

type LocalsWithDatabase = {
  OMS_DB?: D1Database;
};

const PAGE_COLUMNS = `
  id, slug, title, product_id, is_active, is_product_page,
  meta_title, meta_description, created_at, updated_at
`;

const SECTION_COLUMNS = `
  id, landing_page_id, sort_order, type, content_html,
  form_config, created_at, updated_at
`;

function getDatabase(locals: App.Locals): D1Database {
  const localBindings = locals as unknown as LocalsWithDatabase;
  const database =
    localBindings.OMS_DB ??
    (getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined);

  if (!database || typeof database.prepare !== "function") {
    throw new Error("OMS_DB binding is unavailable");
  }

  return database;
}

function parseFormConfig(value: string | null): LandingFormConfig | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object"
      ? (parsed as LandingFormConfig)
      : null;
  } catch {
    return null;
  }
}

function mapSection(row: LandingSectionRow): LandingSection {
  return {
    ...row,
    form_config: parseFormConfig(row.form_config),
  };
}

function attachSections(
  pages: LandingPageRow[],
  sectionRows: LandingSectionRow[],
): LandingPage[] {
  const sectionsByPage = new Map<string, LandingSection[]>();

  for (const row of sectionRows) {
    const sections = sectionsByPage.get(row.landing_page_id) ?? [];
    sections.push(mapSection(row));
    sectionsByPage.set(row.landing_page_id, sections);
  }

  return pages.map((page) => ({
    ...page,
    sections: sectionsByPage.get(page.id) ?? [],
  }));
}

function serializeFormConfig(config: LandingFormConfig | null | undefined) {
  return config ? JSON.stringify(config) : null;
}

function normalizeActive(value: boolean | number | undefined, fallback = 1) {
  if (value === undefined) return fallback;
  return value === true || value === 1 ? 1 : 0;
}

function validateSection(section: LandingSectionInput) {
  if (section.type !== "html" && section.type !== "form") {
    throw new Error("Landing page section type must be 'html' or 'form'");
  }
}

async function findPageBySlug(
  database: D1Database,
  slug: string,
): Promise<LandingPageRow | null> {
  return database
    .prepare(`SELECT ${PAGE_COLUMNS} FROM landing_pages WHERE slug = ? LIMIT 1`)
    .bind(slug)
    .first<LandingPageRow>();
}

async function loadSections(
  database: D1Database,
  landingPageId: string,
): Promise<LandingSection[]> {
  const result = await database
    .prepare(
      `SELECT ${SECTION_COLUMNS}
       FROM landing_sections
       WHERE landing_page_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .bind(landingPageId)
    .all<LandingSectionRow>();

  return (result.results ?? []).map(mapSection);
}

export async function listLandingPages(
  locals: App.Locals,
): Promise<LandingPage[]> {
  const database = getDatabase(locals);
  const [pageResult, sectionResult] = await database.batch<LandingPageRow | LandingSectionRow>([
    database.prepare(
      `SELECT ${PAGE_COLUMNS}
       FROM landing_pages
       ORDER BY updated_at DESC, created_at DESC`,
    ),
    database.prepare(
      `SELECT ${SECTION_COLUMNS}
       FROM landing_sections
       ORDER BY landing_page_id ASC, sort_order ASC, created_at ASC`,
    ),
  ]);
  const productMap = new Map<string, string>();
  // The slug is what a claimed page's real URL is built from, so the admin can
  // show and copy `/produk/<slug>` rather than an address that only redirects.
  const productSlugMap = new Map<string, string>();

  try {
    const productResult = await database
      .prepare(`SELECT id, title, slug FROM products`)
      .all<{ id: number | string; title: string; slug: string }>();
    for (const prod of productResult.results ?? []) {
      if (prod?.id && prod?.title) {
        productMap.set(String(prod.id), prod.title);
      }
      if (prod?.id && prod?.slug) {
        productSlugMap.set(String(prod.id), prod.slug);
      }
    }
  } catch {
    // Products table may be absent in isolated landing_page migration tests
  }

  const pages = attachSections(
    (pageResult?.results ?? []) as LandingPageRow[],
    (sectionResult?.results ?? []) as LandingSectionRow[],
  );

  return [
    ...pages.map((page) => ({
      ...page,
      product_title: productMap.get(String(page.product_id)) || null,
      product_slug: productSlugMap.get(String(page.product_id)) || null,
    })),
    ...staticLandingPages.map((page) => ({ ...page, sections: [] })),
  ];
}

export async function getLandingPageBySlug(
  locals: App.Locals,
  slug: string,
): Promise<LandingPage | null> {
  const database = getDatabase(locals);
  const page = await findPageBySlug(database, slug);
  if (!page) return null;

  return {
    ...page,
    sections: await loadSections(database, page.id),
  };
}

export async function getLandingPageById(
  locals: App.Locals,
  id: string,
): Promise<LandingPage | null> {
  const database = getDatabase(locals);
  const page = await database
    .prepare(`SELECT ${PAGE_COLUMNS} FROM landing_pages WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<LandingPageRow>();
  if (!page) return null;

  return {
    ...page,
    sections: await loadSections(database, page.id),
  };
}

export async function createLandingPage(
  locals: App.Locals,
  input: CreateLandingPageInput,
): Promise<LandingPage> {
  const slugValidation = validateLandingPageSlug(input.slug);
  if (!slugValidation.valid) throw new Error(slugValidation.error);
  if (!input.title?.trim()) throw new Error("Landing page title is required");
  if (!input.product_id?.trim()) throw new Error("Landing page product_id is required");

  const database = getDatabase(locals);
  if (await findPageBySlug(database, input.slug)) {
    throw new Error("Landing page slug is already in use");
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1Statement[] = [
    database
      .prepare(
        `INSERT INTO landing_pages (
           id, slug, title, product_id, is_active,
           meta_title, meta_description, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.slug,
        input.title.trim(),
        input.product_id.trim(),
        normalizeActive(input.is_active),
        input.meta_title ?? null,
        input.meta_description ?? null,
        now,
        now,
      ),
  ];

  for (const [index, section] of (input.sections ?? []).entries()) {
    validateSection(section);
    statements.push(
      database
        .prepare(
          `INSERT INTO landing_sections (
             id, landing_page_id, sort_order, type, content_html,
             form_config, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          section.id ?? crypto.randomUUID(),
          id,
          section.sort_order ?? index,
          section.type,
          section.content_html ?? null,
          serializeFormConfig(section.form_config),
          now,
          now,
        ),
    );
  }

  await database.batch(statements);
  const created = await getLandingPageById(locals, id);
  if (!created) throw new Error("Landing page could not be loaded after creation");
  return created;
}

export async function updateLandingPage(
  locals: App.Locals,
  id: string,
  input: UpdateLandingPageInput,
): Promise<LandingPage | null> {
  const database = getDatabase(locals);
  const existing = await getLandingPageById(locals, id);
  if (!existing) return null;

  const slug = input.slug ?? existing.slug;
  const slugValidation = validateLandingPageSlug(slug);
  if (!slugValidation.valid) throw new Error(slugValidation.error);

  if (slug !== existing.slug) {
    const duplicate = await findPageBySlug(database, slug);
    if (duplicate && duplicate.id !== id) {
      throw new Error("Landing page slug is already in use");
    }
  }

  const title = input.title === undefined ? existing.title : input.title.trim();
  const productId =
    input.product_id === undefined
      ? existing.product_id
      : input.product_id.trim();
  if (!title) throw new Error("Landing page title is required");
  if (!productId) throw new Error("Landing page product_id is required");

  const now = new Date().toISOString();
  const statements: D1Statement[] = [
    database
      .prepare(
        `UPDATE landing_pages
         SET slug = ?, title = ?, product_id = ?, is_active = ?,
             meta_title = ?, meta_description = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        slug,
        title,
        productId,
        normalizeActive(input.is_active, existing.is_active),
        input.meta_title === undefined ? existing.meta_title : input.meta_title,
        input.meta_description === undefined
          ? existing.meta_description
          : input.meta_description,
        now,
        id,
      ),
  ];

  if (input.sections !== undefined) {
    statements.push(
      database
        .prepare("DELETE FROM landing_sections WHERE landing_page_id = ?")
        .bind(id),
    );

    for (const [index, section] of input.sections.entries()) {
      validateSection(section);
      statements.push(
        database
          .prepare(
            `INSERT INTO landing_sections (
               id, landing_page_id, sort_order, type, content_html,
               form_config, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            section.id ?? crypto.randomUUID(),
            id,
            section.sort_order ?? index,
            section.type,
            section.content_html ?? null,
            serializeFormConfig(section.form_config),
            now,
            now,
          ),
      );
    }
  }

  await database.batch(statements);
  return getLandingPageById(locals, id);
}

export async function deleteLandingPage(
  locals: App.Locals,
  id: string,
): Promise<boolean> {
  const result = await getDatabase(locals)
    .prepare("DELETE FROM landing_pages WHERE id = ?")
    .bind(id)
    .run();

  return Number(result.meta?.changes ?? 0) > 0;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function firstDefinedNumber(...values: unknown[]) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
  }
  return 0;
}

export type ShortcodeProduct = {
  title?: string;
  productName?: string;
  name?: string;
  price?: number | string;
  compare_price?: number | string | null;
  comparePrice?: number | string | null;
  variants?: Array<{
    price?: number | string;
    compare_price?: number | string | null;
    comparePrice?: number | string | null;
  }>;
};

export function parseShortcodes(
  html: string,
  product: ShortcodeProduct,
  csPhone = "",
): string {
  const firstVariant = Array.isArray(product?.variants)
    ? product.variants[0]
    : undefined;
  const price = firstDefinedNumber(product?.price, firstVariant?.price);
  const comparePrice = firstDefinedNumber(
    product?.compare_price,
    product?.comparePrice,
    firstVariant?.compare_price,
    firstVariant?.comparePrice,
  );
  const discountPercent =
    comparePrice > price && comparePrice > 0
      ? `${Math.round(((comparePrice - price) / comparePrice) * 100)}%`
      : "0%";
  const replacements: Record<string, string> = {
    product_name: escapeHtml(
      product?.title ?? product?.productName ?? product?.name ?? "",
    ),
    product_price: formatIdr(price),
    compare_price: formatIdr(comparePrice),
    discount_percent: discountPercent,
    cs_whatsapp: escapeHtml(csPhone),
  };

  return html.replace(
    /(?:\{\{|\[)\s*(product_name|product_price|compare_price|discount_percent|cs_whatsapp)\s*(?:\}\}|\])/g,
    (_match, shortcode: string) => replacements[shortcode] ?? _match,
  );
}

export function validateLandingPageSlug(
  slug: string,
): { valid: boolean; error?: string } {
  if (!slug) return { valid: false, error: "Slug is required" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return {
      valid: false,
      error:
        "Slug must contain only lowercase letters, numbers, and single hyphens",
    };
  }
  return { valid: true };
}

/**
 * The landing page that has taken over a product's page, if any.
 *
 * Only an active page counts: unpublishing a claimed landing page must return
 * `/produk/<slug>` to the normal product template rather than 404 the product.
 */
export async function getProductPageLanding(
  locals: App.Locals,
  productId: string,
): Promise<LandingPage | null> {
  const trimmed = String(productId || "").trim();
  if (!trimmed) return null;
  const database = getDatabase(locals);
  const page = await database
    .prepare(
      `SELECT ${PAGE_COLUMNS}
       FROM landing_pages
       WHERE product_id = ? AND is_product_page = 1 AND is_active = 1
       LIMIT 1`,
    )
    .bind(trimmed)
    .first<LandingPageRow>();
  if (!page) return null;

  return { ...page, sections: await loadSections(database, page.id) };
}

export class LandingProductPageConflictError extends Error {
  readonly conflictingSlug: string;
  constructor(conflictingSlug: string) {
    super(
      `Produk ini sudah dipakai oleh landing page /${conflictingSlug}. Lepaskan dulu dari sana.`,
    );
    this.conflictingSlug = conflictingSlug;
  }
}

/**
 * Claims or releases a product's page for one landing page.
 *
 * The partial unique index is the real guard; this reads the current holder
 * first only so the operator gets the offending slug instead of a constraint
 * error they cannot act on.
 */
export async function setLandingPageAsProductPage(
  locals: App.Locals,
  id: string,
  claim: boolean,
): Promise<LandingPage | null> {
  const database = getDatabase(locals);
  const page = await database
    .prepare(`SELECT ${PAGE_COLUMNS} FROM landing_pages WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<LandingPageRow>();
  if (!page) return null;

  if (claim) {
    const holder = await database
      .prepare(
        `SELECT slug FROM landing_pages
         WHERE product_id = ? AND is_product_page = 1 AND id <> ?
         LIMIT 1`,
      )
      .bind(page.product_id, id)
      .first<{ slug: string }>();
    if (holder) throw new LandingProductPageConflictError(holder.slug);
  }

  await database
    .prepare(
      `UPDATE landing_pages
       SET is_product_page = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(claim ? 1 : 0, new Date().toISOString(), id)
    .run();

  return {
    ...page,
    is_product_page: claim ? 1 : 0,
    sections: await loadSections(database, page.id),
  };
}
