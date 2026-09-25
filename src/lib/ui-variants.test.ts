import assert from "node:assert/strict";
import test from "node:test";
import { buttonVariants, badgeVariants } from "./ui-variants.ts";

test("buttonVariants falls back to its declared defaults (primary/md) when no options are given", () => {
  const withDefaults = buttonVariants();
  assert.match(withDefaults, /bg-\[#111111\]/);
  assert.match(withDefaults, /h-11/);
});

test("buttonVariants switches classes per the requested variant and size", () => {
  const ghostSmall = buttonVariants({ variant: "ghost", size: "sm" });
  assert.match(ghostSmall, /bg-transparent/);
  assert.match(ghostSmall, /h-10/);
  assert.doesNotMatch(ghostSmall, /bg-\[#111111\]/);
});

test("badgeVariants defaults to green/md and switches on request", () => {
  assert.match(badgeVariants(), /bg-\[#F5F5F5\]/);
  assert.match(badgeVariants({ variant: "yellow", size: "pill" }), /bg-amber-50/);
  assert.match(badgeVariants({ variant: "yellow", size: "pill" }), /rounded-full/);
});
