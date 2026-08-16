import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmbedFrameAncestors,
  MAX_EMBED_ALLOWED_ORIGINS,
  parseEmbedAllowedOrigins,
  resolveEmbedAllowedOrigins,
} from "./embed-security.ts";

test("normalizes and deduplicates exact HTTPS origins", () => {
  assert.deepEqual(
    parseEmbedAllowedOrigins([
      "https://SHOP.example:443",
      "https://shop.example",
      "https://partner.example:8443",
    ]),
    {
      origins: ["https://shop.example", "https://partner.example:8443"],
      valid: true,
    },
  );
});

test("fails closed for non-HTTPS, non-origin, wildcard, or malformed entries", () => {
  for (const value of [
    "http://shop.example",
    "http://localhost:4321",
    "https://shop.example/",
    "https://shop.example/path",
    "https://shop.example?campaign=1",
    "https://shop.example#checkout",
    "https://*.example.com",
    "https://user:pass@shop.example",
    "https://shop.example,",
    "not-an-origin",
  ]) {
    assert.deepEqual(parseEmbedAllowedOrigins(value), {
      origins: [],
      valid: false,
    });
    assert.equal(buildEmbedFrameAncestors(value), "frame-ancestors 'self'");
  }
});

test("enforces a bounded tenant allowlist", () => {
  const tooMany = Array.from(
    { length: MAX_EMBED_ALLOWED_ORIGINS + 1 },
    (_, index) => `https://shop-${index}.example`,
  );
  assert.deepEqual(parseEmbedAllowedOrigins(tooMany), {
    origins: [],
    valid: false,
  });
});

test("stored values override the tenant environment, including an empty list", () => {
  assert.deepEqual(
    resolveEmbedAllowedOrigins(
      "https://latest.example",
      "https://fallback.example",
    ),
    { origins: ["https://latest.example"], valid: true },
  );
  assert.deepEqual(
    resolveEmbedAllowedOrigins("", "https://fallback.example"),
    { origins: [], valid: true },
  );
  assert.deepEqual(
    resolveEmbedAllowedOrigins(
      "https://latest.example/path",
      "https://fallback.example",
    ),
    { origins: [], valid: false },
  );
  assert.deepEqual(
    resolveEmbedAllowedOrigins(null, "https://fallback.example"),
    { origins: ["https://fallback.example"], valid: true },
  );
});

test("builds a self plus explicit-origin frame policy", () => {
  assert.equal(
    buildEmbedFrameAncestors([
      "https://shop.example",
      "https://partner.example",
    ]),
    "frame-ancestors 'self' https://shop.example https://partner.example",
  );
});
