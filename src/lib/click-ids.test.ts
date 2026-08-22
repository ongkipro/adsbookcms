import assert from "node:assert/strict";
import test from "node:test";
import {
  hasClickId,
  parseClickIds,
  parseClickIdsFromUrl,
  readClickIdCookie,
  readMetaBrowserIds,
} from "./click-ids.ts";

test("captures the click id Google attached to the landing URL", () => {
  assert.deepEqual(
    parseClickIdsFromUrl(new URL("https://permatamall.shop/produk?gclid=Cj0KCQ_abc-123")),
    { gclid: "Cj0KCQ_abc-123" },
  );
  // iOS / app surfaces send gbraid or wbraid instead of gclid.
  assert.deepEqual(
    parseClickIdsFromUrl(new URL("https://permatamall.shop/?gbraid=0AAAAA_xyz")),
    { gbraid: "0AAAAA_xyz" },
  );
  assert.deepEqual(parseClickIdsFromUrl(new URL("https://permatamall.shop/produk")), {});
});

test("captures Meta, TikTok, and UTM tracking parameters from landing URL", () => {
  const url = new URL(
    "https://permatamall.shop/embed/form?product_id=50559&fbclid=IwAR123&ttclid=E_123&utm_source=facebook&utm_campaign=promo",
  );
  const clickIds = parseClickIdsFromUrl(url);
  assert.equal(clickIds.fbclid, "IwAR123");
  assert.equal(clickIds.ttclid, "E_123");
  assert.equal(clickIds.utm_source, "facebook");
  assert.equal(clickIds.utm_campaign, "promo");
  assert.ok(clickIds._fbc?.startsWith("fb.1."));
});

test("rejects values that are not shaped like a Google click id", () => {
  assert.deepEqual(parseClickIdsFromUrl(new URL("https://permatamall.shop/?gclid=%3Cscript%3E")), {});
  assert.deepEqual(
    parseClickIdsFromUrl(new URL(`https://permatamall.shop/?gclid=${"x".repeat(300)}`)),
    {},
  );
});

test("a corrupt cookie degrades to no attribution, never an order-path throw", () => {
  assert.deepEqual(parseClickIds("{not json"), {});
  assert.deepEqual(parseClickIds(null), {});
  assert.deepEqual(parseClickIds('{"gclid":123}'), {});
});

test("reads the click id back off the checkout request", () => {
  const request = new Request("https://permatamall.shop/api/submit-order", {
    headers: {
      cookie: `a=1; adsbook_click_ids=${encodeURIComponent('{"gclid":"Cj0abc"}')}; b=2`,
    },
  });
  assert.deepEqual(readClickIdCookie(request), { gclid: "Cj0abc" });
  assert.equal(hasClickId(readClickIdCookie(request)), true);
});

test("an install upgraded mid-campaign still reads the pre-rename cookie", () => {
  const legacyOnly = new Request("https://permatamall.shop/api/submit-order", {
    headers: {
      cookie: `a=1; zanoby_click_ids=${encodeURIComponent('{"gclid":"Cj0legacy"}')}; b=2`,
    },
  });
  assert.deepEqual(readClickIdCookie(legacyOnly), { gclid: "Cj0legacy" });

  // Once the current cookie exists it wins; the legacy value is never preferred.
  const both = new Request("https://permatamall.shop/api/submit-order", {
    headers: {
      cookie:
        `adsbook_click_ids=${encodeURIComponent('{"gclid":"Cj0current"}')}; ` +
        `zanoby_click_ids=${encodeURIComponent('{"gclid":"Cj0legacy"}')}`,
    },
  });
  assert.deepEqual(readClickIdCookie(both), { gclid: "Cj0current" });
});

test("no cookie means no click id, not a crash", () => {
  assert.deepEqual(readClickIdCookie(new Request("https://permatamall.shop/api/submit-order")), {});
  assert.equal(hasClickId({}), false);
});

test("Meta's browser ids are read from the request, so a CAPI event is never anonymous", () => {
  const fbp = "fb.1.1787423478702.1234567890";
  const fbc = "fb.1.1787423478702.IwAR0abcDEF";

  // The ordinary case: the pixel has run and both cookies are on the origin.
  const both = new Request("https://permatamall.shop/api/meta-event", {
    headers: { cookie: `_ga=x; _fbp=${fbp}; _fbc=${fbc}; other=1` },
  });
  assert.deepEqual(readMetaBrowserIds(both), { fbp, fbc });

  // An ad click that has not waited for the pixel: the middleware wrote `_fbc`
  // into the click-id cookie at landing, and that is the copy Meta needs most.
  const beforePixel = new Request("https://permatamall.shop/api/meta-event", {
    headers: {
      cookie: `adsbook_click_ids=${encodeURIComponent(JSON.stringify({ fbclid: "IwAR0abcDEF", _fbc: fbc }))}`,
    },
  });
  assert.deepEqual(readMetaBrowserIds(beforePixel), { fbp: undefined, fbc });

  // A raw `_fbc` cookie outranks the click-id copy — the pixel's own value is
  // the one Meta minted.
  const pixelWins = new Request("https://permatamall.shop/api/meta-event", {
    headers: {
      cookie:
        `_fbc=${fbc}; ` +
        `adsbook_click_ids=${encodeURIComponent(JSON.stringify({ _fbc: "fb.1.1700000000000.stale" }))}`,
    },
  });
  assert.equal(readMetaBrowserIds(pixelWins).fbc, fbc);

  // Anything that is not Meta's documented shape is dropped rather than
  // forwarded: a malformed match key costs event quality, it does not add to it.
  const junk = new Request("https://permatamall.shop/api/meta-event", {
    headers: { cookie: "_fbp=not-a-real-fbp; _fbc=<script>" },
  });
  assert.deepEqual(readMetaBrowserIds(junk), { fbp: undefined, fbc: undefined });

  // No cookies at all is an empty result, never a throw inside the event path.
  assert.deepEqual(readMetaBrowserIds(new Request("https://permatamall.shop/api/meta-event")), {});
});
