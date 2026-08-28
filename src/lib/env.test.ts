import assert from "node:assert/strict";
import test from "node:test";
import {
  SECRET_MASK,
  getEnvValue,
  getRuntimeEnv,
  maskSecretValue,
} from "./env.ts";

/**
 * `AGENTS.md`: never echo a stored credential back through a browser API. This
 * function is what stands between three of them — `meta_capi_token`, and the
 * Mengantar and AutoLaris API keys — and the admin screen, and it had no test.
 */
test("a masked secret never gives away a meaningful fraction of itself", () => {
  // Absent stays absent rather than becoming a mask that implies a stored value.
  assert.equal(maskSecretValue(""), "");
  assert.equal(maskSecretValue("   "), "");

  // Short values are shown as mask alone. The old branch answered `ab••••de`
  // here, which for a five-character secret is four of its five characters.
  for (const short of ["a", "abcd", "abcde", "abcdefgh", "short-token-23chars-xx"]) {
    assert.equal(
      maskSecretValue(short),
      SECRET_MASK,
      `${short.length} characters must reveal nothing`,
    );
    assert.doesNotMatch(maskSecretValue(short), /[a-z0-9]/i);
  }

  // A real provider token keeps four either side so an operator can tell two
  // keys apart — and nothing more.
  const token = "EAAGm0PX4ZCpsBO1234567890abcdefghijklmnop";
  const masked = maskSecretValue(token);
  assert.equal(masked, `EAAG${SECRET_MASK}mnop`);
  assert.equal(masked.replace(SECRET_MASK, "").length, 8);
  assert.ok(!masked.includes(token.slice(4, -4)), "the body is never shown");

  // The dot run is fixed width, so the length of the secret is not disclosed.
  assert.equal(
    maskSecretValue("A".repeat(40)).length,
    maskSecretValue("A".repeat(400)).length,
  );

  // Whitespace an operator pasted is trimmed before masking, not masked.
  assert.equal(maskSecretValue(`  ${token}  `), masked);
});

/**
 * The resolution order every credential and binding read goes through. A
 * provider key is D1-first and env-fallback (`AGENTS.md`), and this is the
 * env half of that.
 */
test("an env value resolves from the runtime first and treats blank as absent", () => {
  const runtime = { PRESENT: "runtime-value", BLANK: "   ", NULLISH: null };
  assert.equal(getEnvValue("PRESENT", runtime), "runtime-value");
  // A binding set to whitespace is not a configured value; it must fall
  // through rather than making the caller think a provider is configured.
  assert.equal(getEnvValue("BLANK", runtime), "");
  assert.equal(getEnvValue("NULLISH", runtime), "");
  assert.equal(getEnvValue("MISSING", runtime), "");
  assert.equal(getEnvValue("PRESENT", undefined), "");
  // Values arrive from a Worker binding as unknown; non-strings are coerced
  // and trimmed rather than thrown on.
  assert.equal(getEnvValue("NUM", { NUM: 42 }), "42");
});

test("the runtime env comes from locals when present and never throws without it", () => {
  const runtimeEnv = { OMS_DB: {} };
  assert.equal(getRuntimeEnv({ runtimeEnv } as never), runtimeEnv);
  assert.doesNotThrow(() => getRuntimeEnv(undefined));
  assert.doesNotThrow(() => getRuntimeEnv({} as never));
});
