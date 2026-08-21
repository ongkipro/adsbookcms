import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { createServer as createViteServer } from "vite";
import { hashApiKeySecret } from "./developer-api-keys.ts";
import {
  focusHeadlessConfirmation,
  HeadlessApiClient,
  runHeadlessCheckoutJourney,
} from "./headless-client.ts";

type FixtureStatement = {
  query: string;
  values: unknown[];
  bind: (...values: unknown[]) => FixtureStatement;
  first: () => Promise<unknown>;
  all: () => Promise<{ results: unknown[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function createJourneyDatabase(keyHash: string, providerBaseUrl: string) {
  let savedOrder: {
    orderNumber: string;
    statusToken: string;
    totalAmount: number;
  } | null = null;

  const database = {
    prepare(query: string): FixtureStatement {
      const statement: FixtureStatement = {
        query,
        values: [],
        bind(...values: unknown[]) {
          statement.values = values;
          return statement;
        },
        async first() {
          if (query.includes("SELECT headless_allowed_origins")) {
            return { headless_allowed_origins: null };
          }
          if (query.includes("FROM developer_api_keys")) {
            return {
              id: 8,
              key_hash: keyHash,
              scopes: "storefront:read,catalog:read,shipping:read,checkout:write,orders:read,tracking:write",
              rate_limit_per_minute: 120,
              daily_quota: 10_000,
            };
          }
          if (query.includes("INSERT INTO developer_api_key_usage")) return { request_count: 1 };
          if (query.includes("SELECT published_json FROM storefront_content")) return null;
          if (query.includes("SELECT cod_disabled_province_codes")) {
            return { cod_disabled_province_codes: "[]" };
          }
          if (query.includes("SELECT mengantar_api_key")) {
            return {
              mengantar_api_key: "fixture-provider-key",
              mengantar_base_url: providerBaseUrl,
              autolaris_api_key: null,
              autolaris_base_url: null,
            };
          }
          if (query.includes("SELECT id, origin_area_id, pickup_address_id")) {
            return { id: 3, origin_area_id: "origin-fixture", pickup_address_id: "pickup-fixture" };
          }
          if (query.includes("pv.weight_grams")) {
            return {
              weight_grams: 500,
              price: 100_000,
              variant_title: "500 ml",
              product_title: "Produk Fixture",
            };
          }
          if (query.includes("SELECT pv.id, pv.price, pv.stock")) {
            return { id: 11, price: 100_000, stock: 20 };
          }
          if (query.includes("SELECT id, cod_fee_bearer FROM stores")) {
            return { id: 1, cod_fee_bearer: "buyer" };
          }
          if (query.includes("shipping_status = 'abandoned'")) return null;
          if (query.includes("UPDATE order_number_counters")) return { last_value: 10001 };
          if (query.includes("FROM orders o")) {
            if (!savedOrder) return null;
            const [firstIdentity, secondIdentity, statusToken] = statement.values;
            if (
              firstIdentity !== savedOrder.orderNumber ||
              secondIdentity !== savedOrder.orderNumber ||
              statusToken !== savedOrder.statusToken
            ) return null;
            return {
              order_number: savedOrder.orderNumber,
              total_amount: savedOrder.totalAmount,
              payment_method: "cod",
              payment_status: "unpaid",
              shipping_status: "pending",
            };
          }
          return null;
        },
        async all() {
          if (query.includes("FROM storefront_content") && query.includes("content_type = 'product'")) {
            return { results: [] };
          }
          if (query.includes("FROM courier_rules")) {
            return { results: [{ courier_code: "jne", is_enabled: 1, is_cod_enabled: 1 }] };
          }
          return { results: [] };
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: FixtureStatement[]) {
      return statements.map((statement) => {
        if (statement.query.includes("FROM products") && !statement.query.includes("INNER JOIN")) {
          return {
            success: true,
            results: [{
              id: 10001,
              title: "Produk Fixture",
              slug: "produk-fixture",
              category: "Fixture",
              image_url: "https://cdn.example/product.jpg",
              is_active: 1,
              created_at: "2026-01-01T00:00:00.000Z",
            }],
            meta: { changes: 0 },
          };
        }
        if (statement.query.includes("FROM product_variants") && !statement.query.includes("INNER JOIN")) {
          return {
            success: true,
            results: [{
              id: 11,
              product_id: 10001,
              sku: "FIX-11",
              title: "500 ml",
              price: 100_000,
              compare_price: 120_000,
              stock: 20,
            }],
            meta: { changes: 0 },
          };
        }
        if (statement.query.includes("INSERT INTO orders")) {
          savedOrder = {
            orderNumber: String(statement.values[0]),
            statusToken: String(statement.values[2]),
            totalAmount: Number(statement.values[13]),
          };
        }
        if (statement.query.includes("SELECT id FROM orders")) {
          return { success: true, results: [{ id: 99 }], meta: { changes: 0 } };
        }
        return { success: true, results: [], meta: { changes: 1 } };
      });
    },
  } as unknown as D1Database;
  return database;
}

async function startProviderFixture() {
  const server = createHttpServer((request, response) => {
    if (!request.url?.includes("/api/public/fixture-provider-key/order/estimate")) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      data: {
        jne: {
          price: 15_000,
          codFee: 1_000,
          estimatedDate: "2-3",
          unsupported: false,
          unsupported_cod: false,
        },
      },
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Provider fixture gagal dijalankan.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("adapter covers bootstrap, attribution submission, and accessible confirmation focus", async () => {
  const requests: Request[] = [];
  const client = new HeadlessApiClient(
    "https://cms.example/api/v1/",
    "adsbook_live_adapter_fixture_secret",
    async (request) => {
      requests.push(request);
      if (new URL(request.url).pathname.endsWith("/storefront")) {
        return Response.json({
          success: true,
          storefront: { name: "Fixture Store" },
          content: { hero: { title: "Fixture" } },
          tracking: {
            meta_pixel_id: "1234567890",
            google_ads_conversion_id: null,
            google_ads_conversion_label: null,
            google_tag_manager_id: null,
          },
          payment: {
            cod_enabled: true,
            cod_disabled_provinces: ["ID-PA"],
            supported_methods: ["COD"],
          },
        });
      }
      return Response.json({
        success: true,
        event_id: "purchase.INV-10001",
        event_name: "Purchase",
        delivered: true,
        queued: false,
      });
    },
  );
  const storefront = await client.getStorefront();
  const tracking = await client.trackEvent({
    event_name: "Purchase",
    event_id: "purchase.INV-10001",
    event_source_url: "https://storefront.example/confirmation",
    user_data: { fbp: "fb.1.1720000000000.fixture" },
    custom_data: {
      content_ids: ["10001"],
      value: 116_000,
      currency: "IDR",
    },
  });

  assert.equal(storefront.storefront.name, "Fixture Store");
  assert.deepEqual(storefront.payment.cod_disabled_provinces, ["ID-PA"]);
  assert.equal(tracking.delivered, true);
  assert.equal(requests[0].headers.get("x-app-key"), "adsbook_live_adapter_fixture_secret");
  assert.deepEqual(await requests[1].json(), {
    event_name: "Purchase",
    event_id: "purchase.INV-10001",
    event_source_url: "https://storefront.example/confirmation",
    user_data: { fbp: "fb.1.1720000000000.fixture" },
    custom_data: {
      content_ids: ["10001"],
      value: 116_000,
      currency: "IDR",
    },
  });

  assert.equal(requests[1].headers.get("origin"), "https://storefront.example");
  let focused = false;
  const attributes = new Map<string, string>();
  const target = {
    hasAttribute: (name: string) => attributes.has(name),
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    focus: () => {
      focused = true;
    },
  } as unknown as HTMLElement;
  const root = {
    querySelector: () => target,
  } as unknown as ParentNode;

  assert.equal(focusHeadlessConfirmation(root), true);
  assert.equal(attributes.get("tabindex"), "-1");
  assert.equal(focused, true);
  assert.equal(
    focusHeadlessConfirmation({ querySelector: () => null } as unknown as ParentNode),
    false,
  );
});

test("documented client adapter executes catalog to quote to checkout to status through real handlers", async () => {
  const provider = await startProviderFixture();
  const vite = await createViteServer({
    root: path.resolve(import.meta.dirname, "..", ".."),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  try {
    const [
      { POST: checkoutHandler },
      { POST: shippingHandler },
      { POST: statusHandler },
      { GET: productsHandler },
    ] = await Promise.all([
      vite.ssrLoadModule("/src/pages/api/v1/checkout.ts"),
      vite.ssrLoadModule("/src/pages/api/v1/geo/shipping-rates.ts"),
      vite.ssrLoadModule("/src/pages/api/v1/orders/status.ts"),
      vite.ssrLoadModule("/src/pages/api/v1/products/index.ts"),
    ]);
    const secret = "adsbook_live_adapter_fixture_secret";
    const database = createJourneyDatabase(await hashApiKeySecret(secret), provider.baseUrl);
    const locals = { runtimeEnv: { OMS_DB: database } } as unknown as App.Locals;
    const transport = async (request: Request) => {
      const path = new URL(request.url).pathname;
      const context = { request, url: new URL(request.url), locals } as never;
      if (path === "/api/v1/products") return productsHandler(context);
      if (path === "/api/v1/geo/shipping-rates") return shippingHandler(context);
      if (path === "/api/v1/checkout") return checkoutHandler(context);
      if (path === "/api/v1/orders/status") return statusHandler(context);
      return new Response("Not found", { status: 404 });
    };
    const client = new HeadlessApiClient("https://fixture.example/api/v1", secret, transport);
    const result = await runHeadlessCheckoutJourney(client, {
      product_id: 10001,
      variant_id: 11,
      customer_name: "Pelanggan Fixture",
      customer_phone: "081234567890",
      address: "Jalan Fixture Nomor 10",
      city: "Jakarta",
      district: "Menteng",
      province: "ID-JK",
      postal_code: "10310",
      payment_method: "cod",
      quantity: 1,
      submit_token: "fixture-submit-token-0001",
      destination_id: "destination-fixture",
      preferred_courier_code: "jne",
    });

    assert.equal(result.product.id, 10001);
    assert.equal(result.variant.id, 11);
    assert.equal(result.rate.courier_code, "jne");
    assert.equal(result.checkout.order_number, "INV-10001");
    assert.equal(result.status.order_number, result.checkout.order_number);
    assert.equal(result.status.status, "pending");
  } finally {
    await Promise.all([provider.close(), vite.close()]);
  }
});
