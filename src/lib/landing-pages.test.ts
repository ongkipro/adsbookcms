import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import {
  createLandingPage,
  deleteLandingPage,
  getLandingPageById,
  getLandingPageBySlug,
  getProductPageLanding,
  LandingProductPageConflictError,
  listLandingPages,
  listPublicLandingPages,
  parseShortcodes,
  NativeLandingReadOnlyError,
  reconcileNativeLandingPages,
  setLandingPageAsProductPage,
  updateLandingPage,
  validateLandingPageSlug,
} from "./landing-pages.ts";

type QueryValue = null | number | string | Uint8Array;

type MockD1Result = {
  success: true;
  results: Record<string, unknown>[];
  meta: { changes: number };
};

class SqliteD1Statement {
  readonly sql: string;
  readonly values: QueryValue[];
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync, sql: string, values: QueryValue[] = []) {
    this.#database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: QueryValue[]) {
    return new SqliteD1Statement(this.#database, this.sql, values);
  }

  async first<T>() {
    const row = this.#prepare().get(...this.values) as T | undefined;
    return row ?? null;
  }

  async all<T>() {
    return {
      success: true,
      results: this.#prepare().all(...this.values) as T[],
      meta: { changes: 0 },
    };
  }

  async run() {
    return this.execute();
  }

  execute(): MockD1Result {
    if (/^\s*SELECT\b/i.test(this.sql)) {
      return {
        success: true,
        results: this.#prepare().all(...this.values) as Record<string, unknown>[],
        meta: { changes: 0 },
      };
    }

    const result = this.#prepare().run(...this.values);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes) },
    };
  }

  #prepare(): StatementSync {
    return this.#database.prepare(this.sql);
  }
}

class SqliteD1Database {
  readonly #database = new DatabaseSync(":memory:");

  constructor() {
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL,
        title TEXT NOT NULL
      );
      INSERT INTO products (id, slug, title) VALUES (20001, 'pupuk-organik', 'Pupuk Organik');
      INSERT INTO products (id, slug, title) VALUES (20002, 'benih-jagung', 'Benih Jagung');
    `);
    for (const file of [
      "0027_landing_page_builder.sql",
      // A landing page may take over its product's page (A21); without this
      // the fixture would not carry the column the queries now read.
      "0046_landing_page_as_product_page.sql",
      // Native Astro pages are recorded in the same table (A-133).
      "0047_native_landing_pages.sql",
    ]) {
      this.#database.exec(
        readFileSync(
          new URL(`../db/migrations/${file}`, import.meta.url),
          "utf8",
        ).replaceAll("--> statement-breakpoint", ""),
      );
    }
  }

  prepare(sql: string) {
    return new SqliteD1Statement(this.#database, sql);
  }

  async batch(statements: SqliteD1Statement[]) {
    this.#database.exec("BEGIN");
    try {
      const results = statements.map((statement) => statement.execute());
      this.#database.exec("COMMIT");
      return results;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }
}

function createLocals() {
  const database = new SqliteD1Database();
  const locals = {
    OMS_DB: database as unknown as D1Database,
  } as unknown as App.Locals;
  return { database, locals };
}

test("landing page CRUD persists pages and ordered, parsed sections", async () => {
  const { locals } = createLocals();
  const created = await createLandingPage(locals, {
    slug: "promo-asahan",
    title: "Promo Asahan",
    product_id: "10001",
    meta_title: "Asahan Portable Terbaik",
    sections: [
      {
        type: "form",
        sort_order: 20,
        form_config: {
          mode: "hybrid",
          selected_variant_id: "20001",
          button_text: "Pesan Sekarang",
        },
      },
      {
        type: "html",
        sort_order: 10,
        content_html: "<h1>{{product_name}}</h1>",
      },
    ],
  });

  assert.equal(created.slug, "promo-asahan");
  assert.equal(created.is_active, 1);
  assert.deepEqual(
    created.sections.map((section) => section.type),
    ["html", "form"],
  );
  assert.deepEqual(created.sections[1]?.form_config, {
    mode: "hybrid",
    selected_variant_id: "20001",
    button_text: "Pesan Sekarang",
  });

  assert.equal((await getLandingPageBySlug(locals, created.slug))?.id, created.id);
  assert.equal((await getLandingPageById(locals, created.id))?.title, "Promo Asahan");
  const listedPages = await listLandingPages(locals);
  assert.equal(listedPages.length, 1);
  assert.equal(listedPages[0]?.id, created.id);
  const updated = await updateLandingPage(locals, created.id, {
    slug: "promo-asahan-baru",
    title: "Promo Asahan Baru",
    is_active: false,
    sections: [
      {
        type: "form",
        form_config: { mode: "full", section_title: "Form Pemesanan" },
      },
    ],
  });

  assert.equal(updated?.slug, "promo-asahan-baru");
  assert.equal(updated?.title, "Promo Asahan Baru");
  assert.equal(updated?.is_active, 0);
  assert.equal(updated?.sections.length, 1);
  assert.deepEqual(updated?.sections[0]?.form_config, {
    mode: "full",
    section_title: "Form Pemesanan",
  });
  assert.equal(await getLandingPageBySlug(locals, "promo-asahan"), null);

  await assert.rejects(
    createLandingPage(locals, {
      slug: "promo-asahan-baru",
      title: "Duplicate",
      product_id: "10001",
    }),
    /already in use/,
  );

  assert.equal(await deleteLandingPage(locals, created.id), true);
  assert.equal(await getLandingPageById(locals, created.id), null);
  assert.equal((await listLandingPages(locals)).length, 0);
  assert.equal(await deleteLandingPage(locals, created.id), false);
});

test("parseShortcodes binds product title and formatted IDR prices", () => {
  const html = [
    "<h1>{{product_name}}</h1>",
    "<strong>{{ product_price }}</strong>",
    "<del>{{compare_price}}</del>",
    "<span>{{discount_percent}}</span>",
    '<a href="https://wa.me/{{cs_whatsapp}}">Chat</a>',
  ].join("");

  assert.equal(
    parseShortcodes(
      html,
      { title: "Asahan Portable", price: 79000, compare_price: 135000 },
      "628123456789",
    ),
    '<h1>Asahan Portable</h1><strong>Rp79.000</strong><del>Rp135.000</del><span>41%</span><a href="https://wa.me/628123456789">Chat</a>',
  );
});

test("validateLandingPageSlug accepts URL-safe lowercase slugs only", () => {
  assert.deepEqual(validateLandingPageSlug("promo-asahan-2026"), { valid: true });

  for (const slug of ["", "Promo-Asahan", "promo_asahan", "promo--asahan", "-promo", "promo-"]) {
    const result = validateLandingPageSlug(slug);
    assert.equal(result.valid, false, slug);
    assert.equal(typeof result.error, "string", slug);
  }
});

test("a landing page can take over its product's page, and only one may", async () => {
  const { locals } = createLocals();
  const first = await createLandingPage(locals, {
    slug: "promo-satu",
    title: "Promo Satu",
    product_id: "10001",
  });
  const second = await createLandingPage(locals, {
    slug: "promo-dua",
    title: "Promo Dua",
    product_id: "10001",
  });

  // Nothing claims the product page until someone is told to.
  assert.equal(await getProductPageLanding(locals, "10001"), null);

  const claimed = await setLandingPageAsProductPage(locals, first.id, true);
  assert.equal(claimed?.is_product_page, 1);
  assert.equal((await getProductPageLanding(locals, "10001"))?.slug, "promo-satu");

  // The second page points at the same product, so it cannot also hold it.
  await assert.rejects(
    () => setLandingPageAsProductPage(locals, second.id, true),
    (error: unknown) => {
      assert.ok(error instanceof LandingProductPageConflictError);
      assert.equal(error.conflictingSlug, "promo-satu");
      return true;
    },
  );

  // Releasing the first frees the product page for the second.
  await setLandingPageAsProductPage(locals, first.id, false);
  assert.equal(await getProductPageLanding(locals, "10001"), null);
  await setLandingPageAsProductPage(locals, second.id, true);
  assert.equal((await getProductPageLanding(locals, "10001"))?.slug, "promo-dua");
});

test("an unpublished claim hands the product page back to the product template", async () => {
  const { locals } = createLocals();
  const page = await createLandingPage(locals, {
    slug: "promo-nonaktif",
    title: "Promo Nonaktif",
    product_id: "10002",
  });
  await setLandingPageAsProductPage(locals, page.id, true);
  assert.ok(await getProductPageLanding(locals, "10002"));

  // Unpublishing must not 404 the product; it must simply stop taking it over.
  await updateLandingPage(locals, page.id, { is_active: false });
  assert.equal(await getProductPageLanding(locals, "10002"), null);
});

test("claiming an unknown landing page reports not-found rather than throwing", async () => {
  const { locals } = createLocals();
  assert.equal(await setLandingPageAsProductPage(locals, "missing", true), null);
});

test("a claimed page is excluded from the addresses a sitemap may advertise", async () => {
  const { locals } = createLocals();
  const standalone = await createLandingPage(locals, {
    slug: "promo-berdiri-sendiri",
    title: "Berdiri Sendiri",
    product_id: "20001",
  });
  const claimed = await createLandingPage(locals, {
    slug: "promo-jadi-produk",
    title: "Jadi Produk",
    product_id: "20002",
  });
  await setLandingPageAsProductPage(locals, claimed.id, true);

  // This is the filter both sitemaps apply. A claimed page answers 308 on its
  // own slug and the product URL is listed separately, so advertising it here
  // would hand out exactly the duplicate pair the takeover prevents.
  const advertised = (await listLandingPages(locals))
    .filter((page) => page.is_active && !page.is_product_page)
    .map((page) => page.slug);

  assert.ok(advertised.includes(standalone.slug));
  assert.ok(!advertised.includes(claimed.slug));

  // Releasing it puts the slug back in circulation.
  await setLandingPageAsProductPage(locals, claimed.id, false);
  const afterRelease = (await listLandingPages(locals))
    .filter((page) => page.is_active && !page.is_product_page)
    .map((page) => page.slug);
  assert.ok(afterRelease.includes(claimed.slug));
});

const nativeEntry = {
  slug: "promo-native",
  title: "Promo Native",
  productSlug: "pupuk-organik",
  description: "Dibuat di Astro.",
};

test("the register is mirrored into the table, and a claim survives a re-sync", async () => {
  const { database, locals } = createLocals();
  const d1 = database as unknown as D1Database;

  await reconcileNativeLandingPages(d1, [nativeEntry]);
  // Read by id, not through `listLandingPages`: that reconciles against the
  // register the build actually ships, which would correctly delete a row this
  // test injected by hand.
  const native = await getLandingPageById(locals, "native:promo-native");
  assert.ok(native, "a registered native page must be recorded in the table");
  assert.equal(native?.source, "native");
  assert.equal(native?.slug, "promo-native");

  // A native page can hold a product page like any other.
  await setLandingPageAsProductPage(locals, native!.id, true);
  assert.equal((await getProductPageLanding(locals, "20001"))?.slug, "promo-native");

  // Re-syncing writes identity and metadata but must not undo the operator's
  // decision — the file does not own the claim.
  await reconcileNativeLandingPages(d1, [{ ...nativeEntry, title: "Judul Baru" }]);
  const stillClaimed = await getProductPageLanding(locals, "20001");
  assert.equal(stillClaimed?.slug, "promo-native");
  assert.equal(stillClaimed?.title, "Judul Baru");
});

test("removing the register entry removes the row, and with it any claim", async () => {
  const { database, locals } = createLocals();
  const d1 = database as unknown as D1Database;
  await reconcileNativeLandingPages(d1, [nativeEntry]);
  await setLandingPageAsProductPage(locals, "native:promo-native", true);
  assert.ok(await getProductPageLanding(locals, "20001"));

  // The file is gone, so the listing must go too; a claim held by a page that
  // no longer exists would leave /produk/<slug> pointing at nothing.
  await reconcileNativeLandingPages(d1, []);
  assert.equal(await getProductPageLanding(locals, "20001"), null);
  assert.equal(await getLandingPageById(locals, "native:promo-native"), null);
});

test("an entry naming a product this store does not carry is skipped, not faked", async () => {
  const { database, locals } = createLocals();
  await reconcileNativeLandingPages(database as unknown as D1Database, [
    { ...nativeEntry, productSlug: "produk-yang-tidak-ada" },
  ]);
  assert.equal(await getLandingPageById(locals, "native:promo-native"), null);
});

test("the CMS refuses to edit or delete a page whose content is a file", async () => {
  const { database, locals } = createLocals();
  await reconcileNativeLandingPages(database as unknown as D1Database, [nativeEntry]);

  await assert.rejects(
    () => updateLandingPage(locals, "native:promo-native", { title: "Diubah" }),
    NativeLandingReadOnlyError,
  );
  // Deleting the row would only make it reappear on the next reconcile.
  await assert.rejects(
    () => deleteLandingPage(locals, "native:promo-native"),
    NativeLandingReadOnlyError,
  );
});

test("the public listing links a claimed page to the product URL it answers on", async () => {
  const { locals } = createLocals();
  const standalone = await createLandingPage(locals, {
    slug: "promo-sendiri",
    title: "Promo Sendiri",
    product_id: "20001",
    meta_description: "Ringkasan promo sendiri",
  });
  const claimed = await createLandingPage(locals, {
    slug: "promo-diklaim",
    title: "Promo Diklaim",
    product_id: "20002",
  });
  await setLandingPageAsProductPage(locals, claimed.id, true);
  // An inactive page must not be listed publicly.
  const draft = await createLandingPage(locals, {
    slug: "promo-draft",
    title: "Draft",
    product_id: "20001",
    is_active: false,
  });

  const listed = await listPublicLandingPages(locals);
  const bySlug = new Map(listed.map((page) => [page.slug, page]));

  assert.equal(bySlug.get(standalone.slug)?.href, "/promo-sendiri");
  assert.equal(bySlug.get(standalone.slug)?.excerpt, "Ringkasan promo sendiri");
  // A claimed page's own slug only redirects; the public list must send the
  // visitor where the page actually answers.
  assert.equal(bySlug.get(claimed.slug)?.href, "/produk/benih-jagung");
  assert.equal(bySlug.has(draft.slug), false);
});
