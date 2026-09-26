import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildMetaAdvancedMatching,
  metaNameParts,
  normalizeMetaText,
  resolveMetaCountry,
  sha256Hex,
  toE164Digits,
} from "./meta-identity.ts";

const THANKS_TRACKER = readFileSync(
  "src/components/storefront/tracking/MetaThanksTracker.astro",
  "utf8",
);
const PIXEL_BASE = readFileSync(
  "src/components/storefront/tracking/MetaPixelBase.astro",
  "utf8",
);
const GOOGLE_ADS_BASE = readFileSync(
  "src/components/storefront/tracking/GoogleAdsBase.astro",
  "utf8",
);

test("a phone reaches Meta as E.164 digits whichever way the buyer typed it", () => {
  // Every one of these is a real Indonesian checkout input. Before this module
  // the browser leg converted only the leading zero, so `8...` and `+62...`
  // hashed to something the server leg never produced.
  assert.equal(toE164Digits("081234567890"), "6281234567890");
  assert.equal(toE164Digits("81234567890"), "6281234567890");
  assert.equal(toE164Digits("+62 812-3456-7890"), "6281234567890");
  assert.equal(toE164Digits("006281234567890"), "6281234567890");
  assert.equal(toE164Digits("62081234567890"), "6281234567890");
  assert.equal(toE164Digits("0812"), undefined);
  assert.equal(toE164Digits(""), undefined);
});

test("Meta name parts are lowercased and stripped of punctuation", () => {
  assert.deepEqual(metaNameParts("Budi Santoso"), {
    firstName: "budi",
    lastName: "santoso",
  });
  assert.deepEqual(metaNameParts("  Siti   Nur Aisyah "), {
    firstName: "siti",
    lastName: "nuraisyah",
  });
  assert.deepEqual(metaNameParts("Andi"), {
    firstName: "andi",
    lastName: undefined,
  });
  assert.deepEqual(metaNameParts("O'Brien Jr."), {
    firstName: "obrien",
    lastName: "jr",
  });
  assert.equal(normalizeMetaText("  Jakarta Selatan  "), "jakartaselatan");
  assert.equal(normalizeMetaText("   "), undefined);
});

test("the inline thanks tracker normalises identically to this module", () => {
  // `define:vars` forces `is:inline`, which Astro never bundles, so the tracker
  // carries a copy of these rules. A copy that drifts sends Meta two different
  // people for one purchase, and no type or runtime error would ever say so.
  for (const branch of [
    "digits.startsWith('00')",
    "digits.startsWith('620')",
    "digits.startsWith('0')",
    "digits.startsWith('8')",
    "digits.length >= 8 && digits.length <= 15",
    "replace(/[^a-z0-9]/g, '')",
  ]) {
    assert.ok(
      THANKS_TRACKER.includes(branch),
      `MetaThanksTracker.astro lost the normalisation branch ${branch}`,
    );
  }
});

test("sha256Hex hashes to lower-hex and never returns the input verbatim", async () => {
  const hash = await sha256Hex("6281234567890");
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, "6281234567890");
});

test("the Pixel bootstrap mints and hashes one stable first-party external ID", async () => {
  const match = PIXEL_BASE.match(
    /<script\b[^>]*\bis:inline\b[^>]*>([\s\S]*)<\/script>/,
  );
  assert.ok(match, "MetaPixelBase must keep its inline bootstrap");

  let cookie = "";
  const documentStub = {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value.split(";")[0];
    },
    createElement: () => ({}),
    head: { appendChild: () => undefined },
  };
  const calls: unknown[][] = [];
  const tracked = Promise.withResolvers<void>();
  const windowStub: Record<string, any> = {
    location: { protocol: "https:" },
    addEventListener: () => undefined,
    setTimeout: () => 1,
    fbq: (...args: unknown[]) => {
      calls.push(args);
      if (args[0] === "track") tracked.resolve();
    },
  };
  const bootstrap = new Function(
    "pixelId",
    "metaExternalIdCookie",
    "window",
    "document",
    "crypto",
    "TextEncoder",
    "Uint8Array",
    match[1],
  );

  bootstrap(
    "1234567890",
    "adsbook_meta_external_id",
    windowStub,
    documentStub,
    globalThis.crypto,
    TextEncoder,
    Uint8Array,
  );
  await tracked.promise;

  const externalId = cookie.split("=")[1];
  assert.match(externalId, /^[a-f0-9]{32}$/);
  const init = calls.find((args: unknown[]) => args[0] === "init");
  const pageView = calls.find((args: unknown[]) => args[0] === "track");
  const initData = init?.[2] as Record<string, unknown> | undefined;
  const pageViewOptions = pageView?.[3] as Record<string, unknown> | undefined;
  assert.match(String(initData?.external_id ?? ""), /^[a-f0-9]{64}$/);
  assert.equal(initData?.external_id, await sha256Hex(externalId));
  assert.equal(pageViewOptions?.eventID, windowStub.__META_PAGEVIEW_EVENT_ID__);
});

test("the browser Pixel's advanced-matching object hashes every field CAPI also hashes for the same event", async () => {
  // This is the gap that motivated the shared builder: AddToCart and
  // InitiateCheckout already send city/province/postal_code/country to the
  // server CAPI leg on the same event (meta-event.ts -> sendMetaCapiEvent),
  // but the browser Pixel's `fbq('init', pixelId, advancedMatching)` object
  // read only phone and name. A field CAPI hashes and the Pixel drops means
  // the two legs describe the same person with different keys.
  const am = await buildMetaAdvancedMatching({
    customer_name: "Siti Nur Aisyah",
    customer_phone: "081234567890",
    city: "Jakarta Selatan",
    province: "DKI Jakarta",
    postal_code: "12430",
    country: "id",
    external_id: "0123456789abcdef0123456789abcdef",
  });
  for (const key of ["ph", "fn", "ln", "ct", "st", "zp", "country", "external_id"] as const) {
    assert.match(am[key] ?? "", /^[a-f0-9]{64}$/, `${key} must be a SHA-256 hex hash`);
  }
  assert.notEqual(am.ph, am.external_id);
  assert.equal(
    am.external_id,
    await sha256Hex("0123456789abcdef0123456789abcdef"),
  );
});

test("advanced matching omits a field entirely rather than hashing an empty string", async () => {
  // AddToCart fires before an address is known; InitiateCheckout re-inits with
  // the fuller object. A hash of "" is a match key for nobody and would still
  // count toward Meta's parameter-coverage metric as if it mattered.
  const am = await buildMetaAdvancedMatching({
    customer_name: "Andi",
    customer_phone: "081234567890",
  });
  assert.equal(am.ct, undefined);
  assert.equal(am.st, undefined);
  assert.equal(am.zp, undefined);
  assert.equal(am.country, undefined);
  assert.match(am.ph ?? "", /^[a-f0-9]{64}$/);
  // Upgrading sessions without the first-party visitor cookie retain the
  // historical phone-derived external_id until the next Pixel bootstrap.
  assert.equal(am.external_id, am.ph);
});

test("the inline thanks tracker's browser Pixel leg hashes city, state, zip and country like the server CAPI leg does", () => {
  // The CAPI leg (postMeta's user_data, further down this same file) has
  // always sent ct/st/zp/country for Purchase. The browser Pixel's advanced
  // matching used to stop at ph/fn/ln, so the two legs of one Purchase
  // described the same person with different keys.
  //
  // The keys must also reach `MetaPixelBase`'s single init rather than a
  // second `fbq('init')`, which fbevents discards without a word. The
  // behavioural half of that is in `meta-purchase-dedup.test.ts`; the source
  // scan below is what stops one from being reintroduced here.
  // Comments in this file discuss `fbq('init')` at length — deliberately, it
  // is the trap being guarded — so the scan is of code with comment bodies
  // removed, not of prose.
  const trackerCode = THANKS_TRACKER.replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(
    trackerCode,
    /fbq\(\s*['"]init['"]/,
    "the thanks tracker must hand matching to __PS_META_INIT__, never re-init the Pixel",
  );
  assert.match(
    trackerCode,
    /__PS_META_INIT__\(advancedMatching\)/,
    "the hashed matching object must reach MetaPixelBase's single init",
  );
  assert.doesNotMatch(
    trackerCode,
    /client_user_agent/,
    "client_user_agent is a Conversions API field, not a Pixel advanced-matching key",
  );
  const initCall = THANKS_TRACKER.slice(
    THANKS_TRACKER.indexOf("const advancedMatching = {"),
    THANKS_TRACKER.indexOf("window.fbq('track', eventName, data"),
  );
  for (const key of ["ct:", "st:", "zp:", "country:"]) {
    assert.ok(
      initCall.includes(key),
      `MetaThanksTracker.astro's browser Pixel init call is missing ${key}`,
    );
  }
});

test("Google enhanced conversions call `set` before `event`, not a nested user_data param", () => {
  // Verified 2026-08-24 against support.google.com/google-ads/answer/13258081:
  // the documented shape is a standalone `gtag('set', 'user_data', {...})`
  // ahead of the conversion event, not a `user_data` key folded into the
  // event's own payload. The previous code did the latter, which is not the
  // shape Google's own docs describe.
  const setCallIndex = GOOGLE_ADS_BASE.indexOf("gtag('set', 'user_data', userData)");
  const eventCallIndex = GOOGLE_ADS_BASE.indexOf("gtag('event', 'conversion', payload)");
  assert.ok(setCallIndex >= 0, "GoogleAdsBase.astro must call gtag('set', 'user_data', ...)");
  assert.ok(eventCallIndex >= 0, "GoogleAdsBase.astro must still fire the conversion event");
  assert.ok(setCallIndex < eventCallIndex, "user_data must be set before the conversion event fires");
  assert.doesNotMatch(
    GOOGLE_ADS_BASE,
    /payload\.user_data/,
    "user_data must not be nested inside the conversion event payload any more",
  );
});

test("Google enhanced-conversion names are nested where gtag reads them", () => {
  // Sent at the top level of `user_data`, gtag ignores them: the hashing cost is
  // paid and nobody is matched. They belong inside `address`, beside the
  // unhashed postal code and country.
  assert.match(
    THANKS_TRACKER,
    /address:\s*\{[\s\S]{0,400}?sha256_first_name/,
    "Google first name must sit inside user_data.address",
  );
  assert.match(
    THANKS_TRACKER,
    /address:\s*\{[\s\S]{0,900}?country:\s*'ID'/,
    "Google address match key needs an uppercase ISO country code beside the hashed name",
  );
  // Google trims and lowercases; it does not strip punctuation, so a multi-word
  // family name must keep its space here even though Meta removes it.
  assert.ok(
    THANKS_TRACKER.includes("nameParts.slice(1).join(' ')"),
    "Google last name must keep the space Meta strips",
  );
});


// `country` was validated by the contract, hashed by `meta-capi`, sent by the
// `/thanks` browser leg and forwarded by the headless route — and dropped by
// `/api/meta-event`, which carries every first-party PageView, ViewContent and
// `/thanks` Purchase. The two legs of one order therefore described the buyer
// with different key sets, and Meta scored match quality on the shorter one.

test("country is an order's own key, the edge country otherwise, and never a guess", () => {
  assert.equal(resolveMetaCountry(undefined, "SG", true), "id", "a resolved order is domestic");
  assert.equal(resolveMetaCountry("us", "SG", true), "id", "the order outranks a caller claim");
  assert.equal(resolveMetaCountry(undefined, "SG", false), "sg", "the edge country is truthful");
  assert.equal(resolveMetaCountry("id", null, false), "id", "a validated claim is honoured");
  // A hash of a non-country matches nobody, and Meta scores match quality on
  // the keys it was given — an absent key is strictly better than a wrong one.
  assert.equal(resolveMetaCountry(undefined, "XX", false), undefined, "Cloudflare's unknown");
  assert.equal(resolveMetaCountry(undefined, "T1", false), undefined, "Cloudflare's Tor");
  assert.equal(resolveMetaCountry(undefined, "indonesia", false), undefined, "not alpha-2");
  assert.equal(resolveMetaCountry(undefined, null, false), undefined, "nothing to say");
});

test("both CAPI ingestion routes forward country to the outbox", () => {
  for (const [label, path] of [
    ["src/pages/api/meta-event.ts", "../pages/api/meta-event.ts"],
    ["src/pages/api/v1/tracking/events.ts", "../pages/api/v1/tracking/events.ts"],
  ] as const) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const userData = source.slice(source.indexOf("userData: {"), source.indexOf("customData: {"));
    assert.match(
      userData,
      /country: resolveMetaCountry\(/,
      `${label} builds user_data without country — the Pixel leg sends it and this leg would not`,
    );
  }
});

test("buildMetaAdvancedMatching omits keys instead of throwing when Web Crypto is unavailable", async () => {
  // Plain-http origins have no crypto.subtle; the checkout AddToCart used to
  // die here on every leg. Omit the hashes, never substitute raw values.
  const subtle = Object.getOwnPropertyDescriptor(globalThis.crypto, "subtle");
  Object.defineProperty(globalThis.crypto, "subtle", { value: undefined, configurable: true });
  try {
    const am = await buildMetaAdvancedMatching({ customer_name: "Budi Santoso", customer_phone: "081234567890", city: "Jakarta" });
    assert.equal(am.ph, undefined);
    assert.equal(am.fn, undefined);
    assert.equal(am.ct, undefined);
    assert.ok(!JSON.stringify(am).includes("81234567890"), "raw phone must never stand in for its hash");
    assert.ok(!JSON.stringify(am).toLowerCase().includes("budi"), "raw name must never stand in for its hash");
  } finally {
    if (subtle) Object.defineProperty(globalThis.crypto, "subtle", subtle);
  }
});

test("the thanks tracker's hash returns undefined, never '', when it cannot hash", () => {
  // '' reached Google as sha256_phone_number: "" and the Pixel as ph: "" —
  // present-but-blank match keys — on any origin without Web Crypto.
  const source = readFileSync("src/components/storefront/tracking/MetaThanksTracker.astro", "utf8");
  const body = source.slice(source.indexOf("const hashSha256Hex"), source.indexOf("};", source.indexOf("const hashSha256Hex")));
  assert.ok(body.length > 0, "hashSha256Hex not found");
  assert.doesNotMatch(body, /return\s+''|return\s+""/);
});
