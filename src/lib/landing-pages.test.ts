import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import {
  createLandingPage,
  deleteLandingPage,
  getLandingPageById,
  getLandingPageBySlug,
  listLandingPages,
  parseShortcodes,
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
    const migration = readFileSync(
      new URL("../db/migrations/0027_landing_page_builder.sql", import.meta.url),
      "utf8",
    );
    this.#database.exec(migration);
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
