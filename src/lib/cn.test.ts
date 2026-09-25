import assert from "node:assert/strict";
import test from "node:test";
import { cn } from "./cn.ts";

test("cn resolves conflicting Tailwind utilities to the later one, not both", () => {
  // twMerge's whole job: without it, clsx alone would emit both "px-2 px-4".
  assert.equal(cn("px-2", "px-4"), "px-4");
});

test("cn drops falsy/conditional inputs and keeps class order for non-conflicting utilities", () => {
  assert.equal(cn("base", false && "hidden", undefined, "text-sm"), "base text-sm");
});
