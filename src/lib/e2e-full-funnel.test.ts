import assert from "node:assert/strict";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import { enqueueCapiEvent } from "./capi-outbox.ts";
import {
  CLICK_ID_COOKIE,
  parseClickIdsFromUrl,
  readClickIdCookie,
  serializeClickIds,
  type ClickIds,
} from "./click-ids.ts";
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildProductJsonLd,
  buildStorefrontJsonLd,
} from "./json-ld.ts";
import { resolveMetaEventId } from "./meta-capi.ts";
import {
  persistOrder,
  recordAbandonedOrder,
  type PersistedOrder,
} from "./order-persistence.ts";

type QueryValue = null | number | string | Uint8Array;

type D1Result = {
  success: true;
  results: Record<string, unknown>[];
  meta: {
    changes: number;
    last_row_id: number;
  };
};

class SqliteD1Statement {
  readonly #database: DatabaseSync;
  readonly #sql: string;
  readonly #values: QueryValue[];

  constructor(
    database: DatabaseSync,
    sql: string,
    values: QueryValue[] = [],
  ) {
    this.#database = database;
    this.#sql = sql;
    this.#values = values;
  }

  bind(...values: QueryValue[]): SqliteD1Statement {
    return new SqliteD1Statement(this.#database, this.#sql, values);
  }

  async first<T>(): Promise<T | null> {
    const row = this.#prepare().get(...this.#values) as T | undefined;
    return row ?? null;
  }

  async all<T>(): Promise<{
    success: true;
    results: T[];
    meta: { changes: number; last_row_id: number };
  }> {
    return {
      success: true,
      results: this.#prepare().all(...this.#values) as T[],
      meta: { changes: 0, last_row_id: 0 },
    };
  }

  async run(): Promise<D1Result> {
    return this.execute();
  }

  execute(): D1Result {
    if (/^\s*SELECT\b/i.test(this.#sql)) {
      return {
        success: true,
        results: this.#prepare().all(...this.#values) as Record<
          string,
          unknown
        >[],
        meta: { changes: 0, last_row_id: 0 },
      };
    }

    const result = this.#prepare().run(...this.#values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  #prepare(): StatementSync {
    return this.#database.prepare(this.#sql);
  }
}

class SqliteD1Database {
  readonly #database = new DatabaseSync(":memory:");

  constructor() {
    this.#database.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE stores (
        id INTEGER PRIMARY KEY,
        cod_fee_bearer TEXT
      );

      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        is_active INTEGER NOT NULL
      );

      CREATE TABLE product_variants (
        id INTEGER PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        sku TEXT,
        price INTEGER NOT NULL,
        stock INTEGER
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT NOT NULL UNIQUE,
        submit_token TEXT UNIQUE,
        public_status_token TEXT UNIQUE,
        store_id INTEGER NOT NULL REFERENCES stores(id),
        warehouse_id INTEGER,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        address TEXT NOT NULL,
        province TEXT NOT NULL,
        city TEXT NOT NULL,
        district TEXT NOT NULL,
        postal_code TEXT,
        total_amount INTEGER NOT NULL,
        shipping_cost INTEGER NOT NULL DEFAULT 0,
        discount_amount INTEGER NOT NULL DEFAULT 0,
        cod_service_fee INTEGER NOT NULL DEFAULT 0,
        cod_service_fee_vat INTEGER NOT NULL DEFAULT 0,
        cod_fee_bearer TEXT NOT NULL DEFAULT 'buyer',
        payment_method TEXT NOT NULL DEFAULT 'cod',
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        shipping_status TEXT NOT NULL DEFAULT 'pending',
        destination_area_id TEXT,
        courier_code TEXT,
        courier_service TEXT,
        ad_click_ids TEXT,
        seller_bank_account_id INTEGER,
        seller_bank_code TEXT,
        seller_bank_name TEXT,
        seller_account_holder TEXT,
        seller_account_number TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        variant_id INTEGER NOT NULL REFERENCES product_variants(id),
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL
      );

      CREATE TABLE capi_event_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_name TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        last_error TEXT,
        next_retry_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO stores (id, cod_fee_bearer) VALUES (1, 'buyer');
      INSERT INTO products (id, is_active) VALUES (10001, 1);
      INSERT INTO product_variants (id, product_id, sku, price, stock)
      VALUES (20001, 10001, 'AUS-500', 150000, 12);
    `);
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.#database, sql);
  }

  async batch(statements: SqliteD1Statement[]): Promise<D1Result[]> {
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

async function readRow<T>(
  database: SqliteD1Database,
  sql: string,
  ...values: QueryValue[]
): Promise<T> {
  const row = await database.prepare(sql).bind(...values).first<T>();
  assert.ok(row, `Expected a row for query: ${sql}`);
  return row;
}

function asD1(database: SqliteD1Database): D1Database {
  return database as unknown as D1Database;
}

test("checkout promotes one abandoned lead and queues one attributable Purchase", async (t) => {
  const database = new SqliteD1Database();
  const d1 = asD1(database);
  const customerPhone = "6281234567890";
  let abandonedId = 0;
  let clickIds: ClickIds = {};
  let order: PersistedOrder | undefined;

  await t.test(
    "1. /api/record-abandoned-order logic records an abandoned order",
    async () => {
      const abandoned = await recordAbandonedOrder(d1, {
        customerName: "Siti Rahayu",
        customerPhone,
        address: "Jl. Melati 10",
        province: "ID-JI",
        totalAmount: 150000,
        variantId: 20001,
      });
      abandonedId = abandoned.id;

      assert.equal(abandoned.action, "created");
      assert.match(abandoned.orderNumber, /^ABN-\d{5}$/);
      const storedAbandoned = await readRow<{
        id: number;
        shipping_status: string;
        payment_status: string;
        customer_phone: string;
      }>(
        database,
        `SELECT id, shipping_status, payment_status, customer_phone
         FROM orders WHERE id = ?`,
        abandoned.id,
      );
      assert.equal(storedAbandoned.id, abandoned.id);
      assert.equal(storedAbandoned.shipping_status, "abandoned");
      assert.equal(storedAbandoned.payment_status, "unpaid");
      assert.equal(storedAbandoned.customer_phone, customerPhone);

      const refreshed = await recordAbandonedOrder(d1, {
        customerName: "Siti Rahayu Updated",
        customerPhone,
        totalAmount: 150000,
      });
      assert.equal(refreshed.action, "updated");
      assert.equal(refreshed.id, abandoned.id);
      assert.equal(
        (
          await readRow<{ total: number }>(
            database,
            "SELECT COUNT(*) AS total FROM orders",
          )
        ).total,
        1,
      );
    },
  );

  await t.test(
    "2. submission promotes the abandoned row to pending without duplication",
    async () => {
      const landingClickIds = parseClickIdsFromUrl(
        new URL(
          "https://shop.example/produk/aussie?gclid=google-click_123&_fbp=fb.1.1700000000.111&_fbc=fb.1.1700000000.click-222&ttclid=tiktok-click_333",
        ),
      );
      const submitRequest = new Request("https://shop.example/api/submit-order", {
        headers: {
          cookie: `${CLICK_ID_COOKIE}=${encodeURIComponent(
            serializeClickIds(landingClickIds),
          )}`,
        },
      });
      clickIds = readClickIdCookie(submitRequest);
      order = await persistOrder(d1, {
        submitToken: "submit-full-funnel-001",
        customerName: "Siti Rahayu",
        customerPhone,
        customerEmail: "siti@example.test",
        address: "Jl. Melati 10",
        province: "ID-JI",
        city: "Surabaya",
        district: "Wonokromo",
        postalCode: "60243",
        variantKey: "20001",
        quantity: 1,
        shippingCost: 18000,
        paymentMethod: "cod",
        destinationAreaId: "area-surabaya",
        courierCode: "jne",
        courierService: "REG",
        adClickIds: serializeClickIds(clickIds),
      });

      assert.equal(order.id, abandonedId);
      assert.equal(order.orderNumber, `INV-${10000 + abandonedId}`);
      const stored = await readRow<{
        id: number;
        shipping_status: string;
        submit_token: string;
        ad_click_ids: string;
      }>(
        database,
        `SELECT id, shipping_status, submit_token, ad_click_ids
         FROM orders WHERE id = ?`,
        abandonedId,
      );
      assert.equal(stored.shipping_status, "pending");
      assert.equal(stored.submit_token, "submit-full-funnel-001");
      assert.equal(
        (
          await readRow<{ total: number }>(
            database,
            "SELECT COUNT(*) AS total FROM orders",
          )
        ).total,
        1,
      );
    },
  );

  await t.test(
    "3. Google, Meta, and TikTok click identifiers survive D1 persistence",
    async () => {
      const stored = await readRow<{ ad_click_ids: string }>(
        database,
        "SELECT ad_click_ids FROM orders WHERE id = ?",
        abandonedId,
      );
      assert.deepEqual(JSON.parse(stored.ad_click_ids), {
        gclid: "google-click_123",
        _fbp: "fb.1.1700000000.111",
        _fbc: "fb.1.1700000000.click-222",
        ttclid: "tiktok-click_333",
      });
      assert.deepEqual(JSON.parse(stored.ad_click_ids), clickIds);
    },
  );

  await t.test(
    "4. Meta CAPI outbox uses the authoritative order number as event_id",
    async () => {
      assert.ok(order);
      const eventId = resolveMetaEventId(
        "Purchase",
        "browser-generated-event-id",
        order.orderNumber,
      );
      assert.equal(eventId, order.orderNumber);
      assert.ok(eventId);
      const queued = await enqueueCapiEvent(d1, {
        eventName: "Purchase",
        eventId,
        eventSourceUrl: "https://shop.example/thanks",
        userData: {
          phone: customerPhone,
          fbp: clickIds._fbp,
          fbc: clickIds._fbc,
          clientIp: "203.0.113.10",
          userAgent: "full-funnel-test",
        },
        customData: {
          contentName: "Aussie Sample",
          contentIds: ["10001"],
          contentType: "product",
          value: order.totalAmount,
          currency: "IDR",
          orderNumber: order.orderNumber,
        },
      });
      assert.equal(queued, true);

      const row = await readRow<{
        event_id: string;
        event_name: string;
        status: string;
        payload: string;
      }>(
        database,
        `SELECT event_id, event_name, status, payload
         FROM capi_event_outbox`,
      );
      const payload = JSON.parse(row.payload) as {
        eventId: string;
        userData: { fbp?: string; fbc?: string };
        customData: { orderNumber?: string };
      };
      assert.equal(row.event_id, order.orderNumber);
      assert.equal(row.event_name, "Purchase");
      assert.equal(row.status, "pending");
      assert.equal(payload.eventId, order.orderNumber);
      assert.equal(payload.customData.orderNumber, order.orderNumber);
      assert.equal(payload.userData.fbp, clickIds._fbp);
      assert.equal(payload.userData.fbc, clickIds._fbc);

      assert.equal(
        await enqueueCapiEvent(d1, {
          eventName: "Purchase",
          eventId,
          eventSourceUrl: "https://shop.example/thanks",
          userData: {},
          customData: { orderNumber: order.orderNumber },
        }),
        false,
      );
      assert.equal(
        (
          await readRow<{ total: number }>(
            database,
            "SELECT COUNT(*) AS total FROM capi_event_outbox",
          )
        ).total,
        1,
      );
    },
  );
});

test("5. product and storefront JSON-LD builders generate complete schema", () => {
  const siteUrl = "https://shop.example/";
  const organization = {
    name: "Permata Mall",
    logo: "/logo.webp",
    description: "Toko produk rumah tangga.",
  };
  const storefront = buildStorefrontJsonLd({
    siteUrl,
    organization,
    website: {
      name: "Permata Mall",
      description: "Belanja produk pilihan.",
      inLanguage: "id-ID",
    },
  });
  const organizationSchema = storefront["@graph"].find(
    (entry) => entry["@type"] === "Organization",
  ) as Record<string, any> | undefined;
  const websiteSchema = storefront["@graph"].find(
    (entry) => entry["@type"] === "WebSite",
  ) as Record<string, any> | undefined;
  assert.equal(storefront["@context"], "https://schema.org");
  assert.equal(organizationSchema?.url, siteUrl);
  assert.equal(organizationSchema?.logo, "https://shop.example/logo.webp");
  assert.equal(websiteSchema?.url, siteUrl);
  assert.deepEqual(websiteSchema?.publisher, {
    "@id": "https://shop.example#organization",
  });

  const product = buildProductJsonLd({
    siteUrl,
    organization,
    product: {
      name: "Aussie Sample",
      description: "Produk sampel resmi Permata Mall.",
      image: ["/products/aussie.webp"],
      url: "/produk/aussie",
      sku: "AUS-500",
      category: "Home & Garden",
      offers: [
        {
          name: "500ml",
          sku: "AUS-500",
          price: 150000,
          availability: "InStock",
          itemCondition: "NewCondition",
        },
      ],
    },
  });
  const offer = product.offers as {
    "@type": string;
    price: number | string;
    priceCurrency: string;
    availability: string;
    itemCondition?: string;
    url: string;
  };
  assert.equal(product["@type"], "Product");
  assert.equal(product.url, "https://shop.example/produk/aussie");
  assert.deepEqual(product.image, ["https://shop.example/products/aussie.webp"]);
  assert.equal(product.sku, "AUS-500");
  assert.equal(offer["@type"], "Offer");
  assert.equal(offer.price, 150000);
  assert.equal(offer.priceCurrency, "IDR");
  assert.equal(offer.availability, "https://schema.org/InStock");
  assert.equal(offer.itemCondition, "https://schema.org/NewCondition");
  assert.equal(offer.url, "https://shop.example/produk/aussie");

  const breadcrumbs = buildBreadcrumbJsonLd({
    siteUrl,
    breadcrumbs: [
      { name: "Beranda", url: "/" },
      { name: "Aussie Sample", url: "/produk/aussie" },
    ],
  });
  assert.equal(breadcrumbs["@type"], "BreadcrumbList");
  assert.deepEqual(
    breadcrumbs.itemListElement.map(({ position, item }) => ({ position, item })),
    [
      { position: 1, item: "https://shop.example/" },
      { position: 2, item: "https://shop.example/produk/aussie" },
    ],
  );

  const faq = buildFaqJsonLd({
    faqs: [
      {
        question: "Apakah bisa COD?",
        answer: "Ya, COD tersedia di wilayah yang didukung.",
      },
    ],
  });
  assert.equal(faq["@type"], "FAQPage");
  assert.equal(faq.mainEntity[0]?.["@type"], "Question");
  assert.equal(
    faq.mainEntity[0]?.acceptedAnswer.text,
    "Ya, COD tersedia di wilayah yang didukung.",
  );
});
