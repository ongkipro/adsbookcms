import assert from "node:assert/strict";
import test from "node:test";

import {
  isStorefrontTemplateId,
  STOREFRONT_TEMPLATE_IDS,
} from "./tenant-contract.ts";

test("the built-in template id is itself a valid slug", () => {
  for (const id of STOREFRONT_TEMPLATE_IDS) {
    assert.equal(isStorefrontTemplateId(id), true);
  }
});

test("isStorefrontTemplateId accepts lowercase-alphanumeric-with-hyphens slugs", () => {
  assert.equal(isStorefrontTemplateId("compact-market-2"), true);
  assert.equal(isStorefrontTemplateId("a"), true);
});

test("isStorefrontTemplateId rejects uppercase, underscores, leading/trailing hyphens, and empty input", () => {
  assert.equal(isStorefrontTemplateId("Compact-Market"), false);
  assert.equal(isStorefrontTemplateId("compact_market"), false);
  assert.equal(isStorefrontTemplateId("-compact"), false);
  assert.equal(isStorefrontTemplateId("compact-"), false);
  assert.equal(isStorefrontTemplateId(""), false);
});

test("isStorefrontTemplateId rejects a slug over the 40-character ceiling", () => {
  assert.equal(isStorefrontTemplateId("a".repeat(40)), true);
  assert.equal(isStorefrontTemplateId("a".repeat(41)), false);
});
