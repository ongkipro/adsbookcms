import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RAIL_WIDTH_CLASS,
  SHELL_WIDTH_CLASS,
  resolveContentWidth,
} from "./storefront-width.ts";

test("the store template decides when a page states nothing", () => {
  assert.equal(resolveContentWidth("wide-catalog"), "wide");
  assert.equal(resolveContentWidth("compact-market"), "compact");
});

test("an unknown, absent or empty template degrades to compact", () => {
  assert.equal(resolveContentWidth("does-not-exist"), "compact");
  assert.equal(resolveContentWidth(undefined), "compact");
  assert.equal(resolveContentWidth(null), "compact");
  assert.equal(resolveContentWidth(""), "compact");
});

test("a page override wins over the template", () => {
  // This is the case that used to diverge: the product pages force compact on
  // a wide-catalog store, and the breadcrumb has to follow the page.
  assert.equal(resolveContentWidth("wide-catalog", "compact"), "compact");
  assert.equal(resolveContentWidth("compact-market", "wide"), "wide");
});

test("a malformed override is ignored rather than trusted", () => {
  assert.equal(resolveContentWidth("wide-catalog", "COMPACT" as never), "wide");
  assert.equal(resolveContentWidth("compact-market", "" as never), "compact");
});

test("the shell is unconstrained when wide; the rails carry the limit", () => {
  assert.equal(SHELL_WIDTH_CLASS.compact, "max-w-[480px]");
  assert.equal(SHELL_WIDTH_CLASS.wide, "max-w-none");
  assert.equal(RAIL_WIDTH_CLASS.compact, "max-w-[480px]");
  assert.equal(RAIL_WIDTH_CLASS.wide, "max-w-6xl lg:px-6");
});
