import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EMBED_SNIPPET_VERSION,
  buildEmbedMarkup,
  detectStaleEmbedSnippet,
} from "./embed-markup.ts";

const markup = buildEmbedMarkup({
  origin: "https://forms.example",
  embedUrl:
    "https://forms.example/embed/form?mode=hybrid&product_id=10001&variant_id=20002",
  elementId: "adsbook-order-form-10001",
  title: 'Form pemesanan Alpha "Sample"',
  productId: "10001",
  variantId: "20002",
  mode: "hybrid",
});

test("widget keeps a usable iframe fallback and canonical form identity", () => {
  assert.match(markup.widget, /^<adsbook-form-widget /);
  assert.match(markup.widget, /product-id="10001"/);
  assert.match(markup.widget, /variant-id="20002"/);
  assert.match(markup.widget, /mode="hybrid"/);
  assert.match(markup.widget, /<iframe [^>]*loading="eager"/);
  assert.match(markup.widget, /src="https:\/\/forms\.example\/embed\/form\?/);
  assert.match(markup.widget, /Form pemesanan Alpha &quot;Sample&quot;/);
  assert.match(markup.widget, /<script async src="https:\/\/forms\.example\/adsbook-form-widget\.js\?v=\d+"><\/script>$/);
});

// The `autoHeightIframe` variant was deleted: its auto-height, click-ID
// forwarding and origin-checked redirect all exist in the widget, which is
// served by the store and therefore heals on deploy, while that variant froze
// the same logic onto a merchant page permanently. Only two shapes ship now.
test("the generated contract offers exactly the two reachable snippets", () => {
  assert.deepEqual(Object.keys(markup).sort(), ["plainIframe", "widget"]);
  assert.match(markup.plainIframe, /loading="lazy"/);
  assert.match(markup.plainIframe, /height="1000"/);
  assert.doesNotMatch(markup.plainIframe, /<script/);
  assert.doesNotMatch(markup.plainIframe, /addEventListener|postMessage/);
});

// A pasted snippet never updates, so the only way to tell a current paste from
// one frozen in an older generation is a marker the frame can see server-side.
test("every generated snippet stamps the current version into the frame URL", () => {
  const version = `v=${EMBED_SNIPPET_VERSION}`;
  assert.ok(markup.plainIframe.includes(version), "plain iframe must be versioned");
  assert.ok(markup.widget.includes(version), "widget fallback frame must be versioned");
  assert.match(
    markup.widget,
    new RegExp(`adsbook-form-widget\\.js\\?v=${EMBED_SNIPPET_VERSION}`),
  );

  // Re-stamping must replace, never append a second marker.
  const restamped = buildEmbedMarkup({
    origin: "https://forms.example",
    embedUrl: "https://forms.example/embed/form?mode=hybrid&product_id=10001&v=1",
    elementId: "adsbook-order-form-10001",
    title: "Form",
    productId: "10001",
    mode: "hybrid",
  });
  assert.equal(restamped.plainIframe.match(/v=/g)?.length, 1);
  assert.ok(restamped.plainIframe.includes(version));
});

test("a stale paste is detectable, and nothing else is mistaken for one", () => {
  const stale = detectStaleEmbedSnippet({
    versionParam: null,
    referer: "https://merchant.example/lp/promo?utm_source=meta",
    selfOrigin: "https://forms.example",
  });
  // Unversioned means pre-marker, which includes the snippets that still fire an
  // unqualified Purchase. Only the parent origin is reported — never the path.
  assert.deepEqual(stale, {
    parent: "https://merchant.example",
    snippetVersion: 1,
    currentVersion: EMBED_SNIPPET_VERSION,
  });

  const base = { referer: "https://merchant.example/lp", selfOrigin: "https://forms.example" };
  assert.equal(detectStaleEmbedSnippet({ ...base, versionParam: "1" })?.snippetVersion, 1);
  assert.equal(detectStaleEmbedSnippet({ ...base, versionParam: "not-a-number" })?.snippetVersion, 1);
  assert.equal(detectStaleEmbedSnippet({ ...base, versionParam: String(EMBED_SNIPPET_VERSION) }), null);
  assert.equal(detectStaleEmbedSnippet({ ...base, versionParam: "99" }), null);

  // A direct visit and the admin's own preview are not pasted snippets.
  assert.equal(
    detectStaleEmbedSnippet({ versionParam: null, referer: null, selfOrigin: "https://forms.example" }),
    null,
  );
  assert.equal(
    detectStaleEmbedSnippet({
      versionParam: null,
      referer: "https://forms.example/admin/products",
      selfOrigin: "https://forms.example",
    }),
    null,
  );
  assert.equal(
    detectStaleEmbedSnippet({ versionParam: null, referer: "not a url", selfOrigin: "https://forms.example" }),
    null,
  );
});

// The snippet is copy-pasted onto a third-party page and never updated again, so
// whatever conversion tracking it carries is frozen at the moment the merchant
// copied it. It also cannot see the database, so it can never qualify a Purchase.
// Every pasted snippet must therefore be navigation-only: the store's own
// /payment and /thanks pages, which do read the order back from D1, own reporting.
test("no pasted snippet carries conversion tracking of its own", () => {
  for (const [name, snippet] of Object.entries(markup)) {
    for (const forbidden of [
      /\bfbq\b/,
      /\bttq\b/,
      /\bgtag\b/,
      /\bdataLayer\b/,
      /Purchase/,
      /CompletePayment/,
      /AddToCart/,
      /InitiateCheckout/,
    ]) {
      assert.doesNotMatch(snippet, forbidden, `${name} must not fire ${forbidden}`);
    }
  }
});

// The widget snippet loads this file from the store origin, so unlike the pasted
// snippets it is upgraded by deploying. Drive the real source in a stubbed browser.
const WIDGET_SOURCE = readFileSync(
  new URL("../../public/adsbook-form-widget.js", import.meta.url),
  "utf8",
);

// The widget builds the frame URL itself, so it carries its own copy of the
// version. Drift would make a self-healing embed report a stale generation.
test("the widget reports the same snippet version the generator stamps", async () => {
  assert.ok(
    WIDGET_SOURCE.includes(`const snippetVersion = "${EMBED_SNIPPET_VERSION}";`),
    "public/adsbook-form-widget.js must declare the current EMBED_SNIPPET_VERSION",
  );

  // It builds the frame URL itself, so a merchant who pasted an older widget
  // snippet still reports the current generation — that snippet self-heals.
  const run = await mountWidget();
  const src = new URL(run.frameSrc());
  assert.equal(src.searchParams.get("v"), String(EMBED_SNIPPET_VERSION));
  // The same URL still carries the click IDs; versioning must not displace them.
  assert.equal(src.searchParams.get("utm_source"), "meta");
});

type FrameStub = { contentWindow: object; [key: string]: unknown };

type WidgetRun = {
  post: (data: Record<string, unknown>, override?: { origin?: string; source?: object }) => void;
  fbqCalls: unknown[][];
  gtagCalls: unknown[][];
  navigations: string[];
  frameSrc: () => string;
};

function makeFrame(): FrameStub {
  return {
    contentWindow: { frame: true },
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    addEventListener() {},
  };
}

async function mountWidget(): Promise<WidgetRun> {
  const fbqCalls: unknown[][] = [];
  const gtagCalls: unknown[][] = [];
  const navigations: string[] = [];
  let messageHandler: ((event: Record<string, unknown>) => void) | null = null;
  let ElementClass: (new () => Record<string, any>) | null = null;

  class HTMLElementStub {
    isConnected = true;
    style: Record<string, string> = {};
    children: FrameStub[] = [];
    attrs = new Map<string, string>();
    getAttribute(name: string) {
      return this.attrs.get(name) ?? null;
    }
    setAttribute(name: string, value: string) {
      this.attrs.set(name, String(value));
    }
    removeAttribute(name: string) {
      this.attrs.delete(name);
    }
    querySelectorAll() {
      return [] as FrameStub[];
    }
    append(child: FrameStub) {
      this.children.push(child);
    }
  }

  const windowStub = {
    customElements: {
      get: () => undefined,
      define: (_name: string, ctor: new () => Record<string, any>) => {
        ElementClass = ctor;
      },
    },
    location: {
      search: "?utm_source=meta",
      assign: (url: string) => navigations.push(String(url)),
    },
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: unknown) => clearTimeout(id as never),
    addEventListener: (type: string, handler: (event: Record<string, unknown>) => void) => {
      if (type === "message") messageHandler = handler;
    },
    removeEventListener: () => {},
    fbq: (...args: unknown[]) => fbqCalls.push(args),
    gtag: (...args: unknown[]) => gtagCalls.push(args),
  };

  const documentStub = {
    currentScript: { src: "https://forms.example/adsbook-form-widget.js" },
    baseURI: "https://merchant.example/product",
    cookie: "",
    createElement: () => makeFrame(),
  };

  new Function("window", "document", "HTMLElement", WIDGET_SOURCE)(
    windowStub,
    documentStub,
    HTMLElementStub,
  );

  assert.ok(ElementClass, "the widget must register a custom element");
  const element = new (ElementClass as new () => Record<string, any>)();
  element.setAttribute("base-url", "https://forms.example");
  element.setAttribute("product-id", "10001");
  element.setAttribute("mode", "hybrid");
  element.connectedCallback();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.ok(messageHandler, "the widget must listen for frame messages");
  const frame = element.children[0] as FrameStub;
  assert.ok(frame, "the widget must own an iframe");

  return {
    post: (data, override) =>
      (messageHandler as (event: Record<string, unknown>) => void)({
        origin: override?.origin ?? "https://forms.example",
        source: override?.source ?? frame.contentWindow,
        data,
      }),
    fbqCalls,
    gtagCalls,
    navigations,
    frameSrc: () => String(frame.src ?? ""),
  };
}

const ADD_TO_CART = {
  type: "adsbook:add-to-cart",
  content_name: "Asahan Portable",
  content_ids: ["10001"],
  value: 150_000,
  currency: "IDR",
};

test("the widget relays a funnel event only while it carries the frame's event id", async () => {
  const run = await mountWidget();

  run.post({ ...ADD_TO_CART, eventId: "addtocart_asahan_1754400000000_ab12cd" });
  assert.equal(run.fbqCalls.length, 1);
  assert.deepEqual(run.fbqCalls[0][3], { eventID: "addtocart_asahan_1754400000000_ab12cd" });

  // No id, blank id, or non-string id means the merchant pixel could never
  // deduplicate this against the store pixel's copy of the same event.
  run.post({ ...ADD_TO_CART, type: "adsbook:initiate-checkout" });
  run.post({ ...ADD_TO_CART, eventId: "   " });
  run.post({ ...ADD_TO_CART, eventId: 42 });
  assert.equal(run.fbqCalls.length, 1, "an un-deduplicatable event must not be relayed");
});

test("the widget never reports a Purchase, however the frame asks", async () => {
  const run = await mountWidget();

  run.post({ type: "adsbook:order-complete", value: 189_000, currency: "IDR" });
  run.post({ type: "adsbook:purchase", value: 189_000, eventId: "INV-10042" });
  run.post({ type: "adsbook:checkout-redirect", url: "https://forms.example/thanks" });

  assert.deepEqual(run.fbqCalls, [], "only the verified /thanks page may emit Purchase");
  assert.deepEqual(run.gtagCalls, []);
  assert.deepEqual(run.navigations, ["https://forms.example/thanks"]);
});

test("the widget navigates only to a store-origin completion page", async () => {
  const run = await mountWidget();

  run.post({ type: "adsbook:checkout-redirect", url: "https://evil.example/thanks" });
  run.post({ type: "adsbook:checkout-redirect", url: "https://forms.example/admin/orders" });
  run.post({ type: "adsbook:checkout-redirect", url: "javascript:alert(1)" });
  assert.deepEqual(run.navigations, []);

  run.post(
    { type: "adsbook:checkout-redirect", url: "https://forms.example/payment" },
    { origin: "https://evil.example" },
  );
  run.post(
    { type: "adsbook:checkout-redirect", url: "https://forms.example/payment" },
    { source: { spoofed: true } },
  );
  assert.deepEqual(run.navigations, [], "only the widget's own frame may drive navigation");

  run.post({ type: "adsbook:checkout-redirect", url: "/payment" });
  assert.deepEqual(run.navigations, ["https://forms.example/payment"]);
});
