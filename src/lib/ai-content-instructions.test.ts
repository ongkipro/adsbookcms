import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContentSystemInstruction,
  REPOSITORY_CONTENT_SYSTEM_INSTRUCTION,
} from "./ai-content-instructions.ts";

test("repository guardrails remain active without tenant instructions", () => {
  assert.equal(
    buildContentSystemInstruction(""),
    REPOSITORY_CONTENT_SYSTEM_INSTRUCTION,
  );
  assert.match(REPOSITORY_CONTENT_SYSTEM_INSTRUCTION, /Never invent/);
  assert.match(REPOSITORY_CONTENT_SYSTEM_INSTRUCTION, /operational facts as authoritative/);
  assert.match(REPOSITORY_CONTENT_SYSTEM_INSTRUCTION, /testimonial\/review arrays to empty/);
  assert.match(REPOSITORY_CONTENT_SYSTEM_INSTRUCTION, /manual operator entry/);
});

test("tenant instructions extend rather than replace repository guardrails", () => {
  const result = buildContentSystemInstruction("Use a calm agronomy tone.");
  assert.match(result, /Never invent/);
  assert.match(result, /Tenant-specific instruction:/);
  assert.match(result, /Use a calm agronomy tone\./);
});
