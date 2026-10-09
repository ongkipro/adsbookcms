import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * T248's reliability clause, expressed as a property rather than a promise.
 *
 * By the time the completion state is written the order already exists in D1.
 * Anything that throws between that point and the navigation strands a buyer on
 * the submitting spinner with a real order behind them — and because the server
 * Purchase is only ever triggered from `/thanks`, neither the Pixel leg nor the
 * Conversions API leg fires either. `sessionStorage.setItem` is exactly such a
 * throw: Safari's private mode has historically raised on any write, and a
 * browser set to block site data does the same.
 *
 * The task's own acceptance text asks for `/payment?order=...`. That is
 * superseded and deliberately so: `payment.astro` 303-redirects away every
 * query parameter but `preview`, and `checkout-navigation.ts` clears `search`
 * on both completion paths, because no order identifier or status token belongs
 * in a URL a server or a referrer can read. The locator rides in the fragment
 * instead, which browsers never transmit.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const FORMS = [
  ["form-hybrid", "../scripts/form-hybrid.ts"],
  ["form-middle", "../scripts/form-middle.ts"],
] as const;

test("a failed completion-state write can never block the redirect", () => {
  for (const [label, path] of FORMS) {
    const source = read(path);
    const index = source.indexOf('sessionStorage.setItem("thanks_state"');
    assert.ok(index > 0, `${label} must write the completion state`);
    // The write is guarded: the nearest preceding statement opens a try block.
    const before = source.slice(Math.max(0, index - 400), index);
    assert.match(
      before,
      /try \{\s*$/,
      `${label} writes thanks_state unguarded — a storage failure would strand a real order`,
    );
  }
});

test("both completion paths carry the locator in the fragment", () => {
  for (const [label, path] of FORMS) {
    const source = read(path);
    assert.match(
      source,
      /navigateAfterCheckout\(/,
      `${label} must navigate through the shared helper`,
    );
    assert.match(
      source,
      /#o=\$\{encodeURIComponent/,
      `${label} must carry the order locator in the fragment`,
    );
  }
});

test("no completion path puts an identifier in the query string", () => {
  const navigation = read("../lib/checkout-navigation.ts");
  // A server and a referrer both see `search`; neither ever sees the fragment.
  assert.match(navigation, /targetUrl\.search = ""/);
  const payment = read("../pages/payment.astro");
  assert.match(
    payment,
    /Astro\.redirect\(/,
    "payment.astro must keep refusing query parameters",
  );
});

test("/thanks recovers its order from the fragment, as /payment already does", () => {
  const thanks = read("../pages/thanks.astro");
  assert.match(thanks, /fragment\.get\('o'\)/, "/thanks must read the fragment locator");
  assert.match(thanks, /fragment\.get\('t'\)/);
  // Removed from the address bar so it is neither on screen nor in history.
  assert.match(thanks, /history\.replaceState\(null, '', window\.location\.pathname\)/);
});


test("a buyer arriving on the locator alone is shown the real figures", () => {
  const thanks = read("../pages/thanks.astro");
  // The server response already carries these; the page used to render `Rp0`
  // beside a real order when the local state was missing, and a wrong number is
  // worse than none.
  assert.match(thanks, /const serverTotal = Number\(data\?\.total_amount \|\| 0\)/);
  assert.match(thanks, /const serverProduct = Number\(data\?\.product_value \|\| 0\)/);
  // Only fills what the local state could not: the normal path is untouched.
  assert.match(thanks, /if \(!Number\(totalPayment\) && serverTotal > 0\)/);
  assert.match(thanks, /if \(!Number\(productPrice\) && serverProduct > 0\)/);
});

test("an incomplete form never natively disables the submit button", () => {
  // A real `disabled` swallowed the tap whenever mobile autofill filled a field
  // without an `input` event: the form looked complete and the button was dead
  // until the buyer tapped elsewhere. Only an order in flight disables it; an
  // incomplete form is aria-disabled and the submit handler names the field.
  for (const [name, path] of FORMS) {
    const source = read(path);
    const assignments = [...source.matchAll(/submitButton\.disabled\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.ok(assignments.length > 0, `${name}: submit button state not found`);
    for (const value of assignments) {
      assert.match(value, /^(state\.)?submitting$/, `${name} disables the submit button on ${value}`);
    }
    assert.match(source, /setAttribute\("aria-disabled"/, `${name} no longer marks an incomplete form aria-disabled`);
    assert.match(source, /form\.addEventListener\("change", syncSubmit(State|Button)\)/, `${name} ignores autofill that fires only change`);

    // An autofilled 08… number never passed through the input handler that
    // rewrites it to 62…, so field validation refused a correct number.
    const submit = source.slice(source.indexOf('form.addEventListener("submit"'));
    const normalised = submit.indexOf("phoneInput.value = normalizePhone(phoneInput.value)");
    const validated = submit.indexOf("validateField(field)");
    assert.ok(normalised > 0 && normalised < validated, `${name} validates the phone before normalising it`);
  }

  // A tappable button means the submit handler is the only gate. The full form
  // also waits on its payment choices; without a guard an order could leave on
  // the default "cod" before they loaded.
  const hybridSubmit = read("../scripts/form-hybrid.ts").split('form.addEventListener("submit"')[1];
  assert.match(hybridSubmit, /if \(!state\.visiblePaymentOptions\?\.length\)/, "form-hybrid submits before its payment choices load");
});
