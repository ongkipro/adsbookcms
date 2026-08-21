import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ROLES,
  canAccessAdminRoute,
  getDefaultAdminRoute,
  isAdminRole,
} from "./auth.ts";
import type { AdminRole } from "./auth.ts";
import {
  generateApiKeySecret,
  hashApiKeySecret,
  isApiKeyActive,
  maskApiKeySecret,
  normalizeApiKeyName,
  verifyApiKeySecret,
} from "./developer-api-keys.ts";
import {
  buildLandingPageDuplicateInput,
  parseLandingPageDuplicatePayload,
} from "./landing-pages.ts";
import type { LandingPage } from "./landing-pages.ts";
import {
  parseProductStatusTogglePayload,
  updateProductActiveStatus,
} from "./product-mutation.ts";


function createProductStatusDatabase(state: Map<number, number>): D1Database {
  return {
    prepare(sql: string) {
      assert.match(sql, /UPDATE products/);
      return {
        bind(status: number, ...rawIds: unknown[]) {
          return {
            async run() {
              let changes = 0;
              for (const rawId of rawIds) {
                const id = Number(rawId);
                if (!state.has(id)) continue;
                state.set(id, status);
                changes += 1;
              }
              return { success: true, meta: { changes }, results: [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

test("product inline active toggle parses strict payloads and mutates status", async () => {
  const parsed = parseProductStatusTogglePayload({
    id: "42001",
    is_active: false,
  });
  assert.deepEqual(parsed, { value: { id: 42001, is_active: false } });
  assert.deepEqual(parseProductStatusTogglePayload({ id: 0, is_active: true }), {
    error: "ID produk tidak valid.",
  });
  assert.deepEqual(
    parseProductStatusTogglePayload({ id: 42001, is_active: "false" }),
    { error: "Status produk harus berupa boolean." },
  );
  assert.equal(
    parseProductStatusTogglePayload({
      id: 42001,
      is_active: false,
      title: "Unexpected full mutation",
    }),
    null,
  );

  assert.ok(parsed && "value" in parsed);
  const productState = new Map<number, number>([
    [42001, 1],
    [42002, 1],
  ]);
  const database = createProductStatusDatabase(productState);
  assert.equal(
    await updateProductActiveStatus(database, parsed.value),
    true,
  );
  assert.equal(productState.get(42001), 0);
  assert.equal(productState.get(42002), 1);
  assert.equal(
    await updateProductActiveStatus(database, { id: 99999, is_active: true }),
    false,
  );
});

test("landing duplication generates a copy slug and independently clones sections", () => {
  const source: LandingPage = {
    id: "landing-1",
    slug: "promo-asahan",
    title: "Promo Asahan",
    product_id: "10001",
    is_active: 0,
    meta_title: "Promo Asahan Hemat",
    meta_description: "Deskripsi promo",
    created_at: "2026-08-15T00:00:00.000Z",
    updated_at: "2026-08-15T00:00:00.000Z",
    sections: [
      {
        id: "section-html",
        landing_page_id: "landing-1",
        sort_order: 10,
        type: "html",
        content_html: "<h1>{{product_name}}</h1>",
        form_config: null,
        created_at: "2026-08-15T00:00:00.000Z",
        updated_at: "2026-08-15T00:00:00.000Z",
      },
      {
        id: "section-form",
        landing_page_id: "landing-1",
        sort_order: 20,
        type: "form",
        content_html: null,
        form_config: {
          mode: "hybrid",
          selected_variant_id: "20001",
          button_text: "Pesan",
        },
        created_at: "2026-08-15T00:00:00.000Z",
        updated_at: "2026-08-15T00:00:00.000Z",
      },
    ],
  };

  assert.deepEqual(
    parseLandingPageDuplicatePayload({
      action: "duplicate",
      id: ` ${source.id} `,
    }),
    { value: { action: "duplicate", id: source.id } },
  );
  assert.deepEqual(
    parseLandingPageDuplicatePayload({
      action: "duplicate",
      id: "static:promo-asahan",
    }),
    { error: "Static landing pages cannot be duplicated" },
  );

  const duplicateInput = buildLandingPageDuplicateInput(source);
  assert.equal(duplicateInput.slug, "promo-asahan-copy");
  assert.equal(duplicateInput.title, "Promo Asahan (Copy)");
  assert.equal(duplicateInput.product_id, source.product_id);
  assert.equal(duplicateInput.is_active, source.is_active);
  assert.equal(duplicateInput.meta_title, source.meta_title);
  assert.equal(duplicateInput.meta_description, source.meta_description);
  assert.deepEqual(
    duplicateInput.sections,
    source.sections.map((section) => ({
      sort_order: section.sort_order,
      type: section.type,
      content_html: section.content_html,
      form_config: section.form_config,
    })),
  );
  assert.notStrictEqual(duplicateInput.sections, source.sections);
  assert.notStrictEqual(
    duplicateInput.sections?.[1]?.form_config,
    source.sections[1]?.form_config,
  );
  assert.equal(Object.hasOwn(duplicateInput.sections?.[0] ?? {}, "id"), false);
  assert.equal(
    Object.hasOwn(duplicateInput.sections?.[0] ?? {}, "landing_page_id"),
    false,
  );
});


test("API keys are generated, hashed, verified, masked, and revoked safely", async () => {
  assert.equal(normalizeApiKeyName("  Storefront   Production  "), "Storefront Production");

  const secret = generateApiKeySecret();
  const secondSecret = generateApiKeySecret();
  assert.match(secret, /^adsbook_live_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(secret, secondSecret);

  const storedHash = await hashApiKeySecret(secret);
  assert.match(storedHash, /^[a-f0-9]{64}$/);
  assert.equal(await verifyApiKeySecret(secret, storedHash), true);
  assert.equal(await verifyApiKeySecret(`${secret}tampered`, storedHash), false);
  assert.equal(await verifyApiKeySecret(secret, "not-a-sha256-hash"), false);
  assert.equal(maskApiKeySecret(secret).includes(secret), false);

  let revokedAt: string | null = null;
  assert.equal(isApiKeyActive(revokedAt), true);
  revokedAt = new Date().toISOString();
  assert.equal(isApiKeyActive(revokedAt), false);
});

test("access roles and route policies enforce least privilege", () => {
  assert.deepEqual(ADMIN_ROLES, [
    "owner",
    "admin",
    "advertiser",
    "customer_service",
  ]);

  for (const role of ADMIN_ROLES) {
    assert.equal(isAdminRole(role), true);
    assert.equal(getDefaultAdminRoute(role), "/admin/dashboard");
    assert.equal(canAccessAdminRoute(role, "/admin"), true);
  }
  for (const value of ["collaborator", "", null, 1]) {
    assert.equal(isAdminRole(value), false);
  }

  const policy: Array<[AdminRole, string, boolean]> = [
    ["owner", "/admin/settings/access", true],
    ["owner", "/api/admin/access/credential-1", true],
    ["admin", "/admin/settings/store", true],
    ["admin", "/api/admin/settings/developer", true],
    ["admin", "/admin/settings/access", false],
    ["admin", "/api/admin/access", false],
    ["advertiser", "/admin/products/edit", true],
    ["advertiser", "/api/admin/media/upload", true],
    ["advertiser", "/admin/products-malicious", false],
    ["advertiser", "/api/admin/settings/developer", false],
    ["advertiser", "/admin/orders", false],
    ["advertiser", "/api/admin/orders", false],
    ["customer_service", "/admin/orders/42", true],
    ["customer_service", "/api/admin/orders/42", true],
    ["customer_service", "/admin/products", false],
    ["customer_service", "/api/admin/products", false],
    ["customer_service", "/api/admin/settings/developer", false],
  ];

  for (const [role, route, expected] of policy) {
    assert.equal(canAccessAdminRoute(role, route), expected, `${role}: ${route}`);
  }
});
