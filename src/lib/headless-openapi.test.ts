import assert from "node:assert/strict";
import test from "node:test";
import { HEADLESS_OPERATIONS } from "./headless-api.ts";
import { headlessOpenApiDocument } from "./headless-openapi.ts";

function resolveLocalRef(document: unknown, ref: string): unknown {
  assert.match(ref, /^#\//);
  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>((current, token) => {
      assert.ok(current && typeof current === "object" && token in current);
      return (current as Record<string, unknown>)[token];
    }, document);
}

function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "$ref" && typeof item === "string") refs.push(item);
      else collectRefs(item, refs);
    }
  }
  return refs;
}

test("OpenAPI 3.1 document covers every authenticated route operation with resolvable schemas", () => {
  assert.equal(headlessOpenApiDocument.openapi, "3.1.0");
  assert.deepEqual(headlessOpenApiDocument.security, [{ appKeyAuth: [] }, { bearerAuth: [] }]);
  assert.deepEqual(
    Object.keys(headlessOpenApiDocument.paths).sort(),
    [
      "/checkout",
      "/geo/districts",
      "/geo/shipping-rates",
      "/openapi.json",
      "/orders/status",
      "/products",
      "/products/{slug}",
      "/storefront",
      "/tracking/events",
    ],
  );

  const documentedOperations = new Set<string>();
  for (const pathItem of Object.values(headlessOpenApiDocument.paths)) {
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== "object" || !("operationId" in operation)) continue;
      const requiredScope = operation["x-required-scope"];
      const apiOperation = operation["x-api-operation"];
      assert.equal(typeof requiredScope, "string");
      assert.equal(typeof apiOperation, "string");
      assert.equal(
        requiredScope,
        HEADLESS_OPERATIONS[apiOperation as keyof typeof HEADLESS_OPERATIONS]?.scope,
      );
      assert.ok("401" in operation.responses);
      assert.ok("403" in operation.responses);
      assert.ok("429" in operation.responses);
      assert.ok("503" in operation.responses);
      documentedOperations.add(String(apiOperation));
    }
  }
  assert.deepEqual(
    [...documentedOperations].sort(),
    Object.keys(HEADLESS_OPERATIONS).sort(),
  );
  for (const ref of collectRefs(headlessOpenApiDocument)) {
    assert.notEqual(resolveLocalRef(headlessOpenApiDocument, ref), undefined, `Unresolved OpenAPI ref: ${ref}`);
  }
});

test("documented journey schemas expose the canonical producer and consumer identities", () => {
  const schemas = headlessOpenApiDocument.components.schemas;
  assert.ok("products" in schemas.CatalogEnvelope.properties);
  assert.ok("rates" in schemas.ShippingQuoteEnvelope.properties);
  assert.ok("order_number" in schemas.CheckoutOrder.properties);
  assert.ok("public_status_token" in schemas.CheckoutOrder.properties);
  assert.deepEqual(schemas.OrderStatusRequest.required, ["order_number", "status_token"]);
  assert.ok("order" in schemas.OrderStatusEnvelope.properties);
  assert.ok("error" in schemas.ErrorEnvelope.properties);
  assert.deepEqual(
    headlessOpenApiDocument.paths["/products/{slug}"].get.responses["200"].content["application/json"].schema,
    { $ref: "#/components/schemas/ProductDetailEnvelope" },
  );
  assert.deepEqual(
    headlessOpenApiDocument.paths["/geo/districts"].get.responses["200"].content["application/json"].schema,
    { $ref: "#/components/schemas/DistrictSearchEnvelope" },
  );
  assert.deepEqual(
    headlessOpenApiDocument.paths["/tracking/events"].post.requestBody.content["application/json"].schema,
    { $ref: "#/components/schemas/TrackingEventRequest" },
  );
  assert.deepEqual(
    schemas.TrackingEventRequest.required,
    ["event_name", "event_id", "event_source_url"],
  );
  assert.ok("skipped" in schemas.TrackingEventEnvelope.properties);
  assert.ok("deduplicated" in schemas.TrackingEventEnvelope.properties);
});
