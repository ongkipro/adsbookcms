import assert from "node:assert/strict";
import test from "node:test";
import {
  CARD_IMAGE_EDGE,
  LEAN_WEBP_BYTES,
  MAX_IMAGE_EDGE,
  WEBP_QUALITY,
  canConvertToWebP,
  shouldReuseWebP,
} from "./client-image.ts";

const dims = (edge: number) => ({ width: edge, height: edge });

test("a lean WebP within the edge budget is reused untouched", () => {
  assert.ok(
    shouldReuseWebP({ type: "image/webp", size: 90 * 1024 }, dims(1254)),
  );
});

test("a heavy WebP is re-encoded even when its dimensions fit", () => {
  // The exact hole that let a 132KB high-quality hero into R2: the old check
  // read "already small" as "under 2MB", so dimensions alone decided.
  assert.equal(
    shouldReuseWebP({ type: "image/webp", size: 132 * 1024 }, dims(1254)),
    false,
  );
});

test("an oversized WebP is re-encoded even when it is lean", () => {
  assert.equal(
    shouldReuseWebP({ type: "image/webp", size: 90 * 1024 }, dims(MAX_IMAGE_EDGE + 1)),
    false,
  );
});

test("non-WebP input is always re-encoded", () => {
  assert.equal(
    shouldReuseWebP({ type: "image/png", size: 10 * 1024 }, dims(400)),
    false,
  );
});

test("only formats a canvas re-encode cannot damage are convertible", () => {
  assert.ok(canConvertToWebP("image/jpeg"));
  assert.ok(canConvertToWebP("image/png"));
  assert.ok(canConvertToWebP("image/webp"));
  // GIF animation would be flattened, AVIF typically inflated.
  assert.equal(canConvertToWebP("image/gif"), false);
  assert.equal(canConvertToWebP("image/avif"), false);
});

test("the budget constants keep their intended relationships", () => {
  assert.ok(CARD_IMAGE_EDGE < MAX_IMAGE_EDGE);
  assert.ok(LEAN_WEBP_BYTES < 1024 * 1024, "lean must mean lean, not merely under the hard cap");
  assert.ok(WEBP_QUALITY > 0.6 && WEBP_QUALITY < 0.9);
});
