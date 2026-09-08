import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * A honeypot that names itself is not a honeypot.
 *
 * The three public checkout endpoints answered a filled decoy with
 * `code: "HONEYPOT_TRIGGERED"`, which tells an anonymous caller exactly which
 * control it tripped — so a bot filling every field learns to leave that one
 * empty and never trips it again. They now answer exactly like a generic
 * invalid payload, and the hit is recorded server-side where the attacker
 * cannot read it.
 *
 * `/api/v1/checkout` deliberately keeps the explicit code: its caller is
 * authenticated by API key and origin allowlist — a partner debugging their own
 * integration rather than a bot probing — and the code is a published contract
 * in `STOREFRONT_INTEGRATION.md`.
 */

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const PUBLIC_ENDPOINTS = [
  "../pages/api/submit-order.ts",
  "../pages/api/submit-middle-order.ts",
  "../pages/api/record-abandoned-order.ts",
] as const;

test("a public checkout endpoint never names the control that rejected it", () => {
  for (const path of PUBLIC_ENDPOINTS) {
    const text = source(path);
    // Matched on the emitted key, not the bare word: a comment may name the
    // retired code to explain why it is gone.
    assert.doesNotMatch(
      text,
      /code:\s*['"]HONEYPOT_TRIGGERED['"]/,
      `${path} tells the caller which control caught it`,
    );
    const branch = text.slice(text.indexOf("body.website"));
    assert.match(
      branch.slice(0, 700),
      /code:\s*['"]VALIDATION_ERROR['"]/,
      `${path} must answer like a generic invalid payload`,
    );
  }
});

test("every public checkout endpoint still has the honeypot and a rate limit", () => {
  for (const path of PUBLIC_ENDPOINTS) {
    const text = source(path);
    assert.match(text, /body\.website/, `${path} lost its honeypot`);
    assert.match(text, /checkRateLimit\(/, `${path} lost its rate limit`);
    // Countable by the operator, unreadable by the caller.
    assert.match(text, /checkout-honeypot-triggered/, `${path} must still record the hit`);
  }
});

test("the authenticated headless route keeps its documented code", () => {
  assert.match(
    source("../pages/api/v1/checkout.ts"),
    /HONEYPOT_TRIGGERED/,
    "STOREFRONT_INTEGRATION.md publishes this code for API-key callers",
  );
});
