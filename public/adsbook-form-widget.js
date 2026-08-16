(() => {
  const tagName = "adsbook-form-widget";
  if (window.customElements.get(tagName)) return;

  const scriptOrigin = (() => {
    try {
      return new URL(document.currentScript?.src || "", document.baseURI).origin;
    } catch {
      return "";
    }
  })();
  // Keep in sync with EMBED_SNIPPET_VERSION in src/lib/embed-markup.ts; a test
  // fails if they drift. This file is served by the store, so it always reports
  // the current generation even when the merchant pasted an older snippet.
  const snippetVersion = "2";
  const modes = new Set(["middle", "full", "hybrid"]);
  const trackingKeys = [
    "gclid",
    "gbraid",
    "wbraid",
    "_fbp",
    "_fbc",
    "fbclid",
    "ttclid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ];

  function getTrackingParams() {
    const params = {};
    try {
      const searchParams = new URLSearchParams(window.location.search);
      for (const k of trackingKeys) {
        const v = searchParams.get(k);
        if (v) params[k] = v;
      }
      if (!params._fbp) {
        const mFbp = document.cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
        if (mFbp) params._fbp = decodeURIComponent(mFbp[1]);
      }
      if (!params._fbc) {
        const mFbc = document.cookie.match(/(?:^|;\s*)_fbc=([^;]+)/);
        if (mFbc) params._fbc = decodeURIComponent(mFbc[1]);
      }
    } catch {}
    return params;
  }
  class AdsBookFormWidget extends HTMLElement {
    static observedAttributes = [
      "base-url",
      "mode",
      "product-id",
      "variant-id",
      "title",
    ];

    #frame = null;
    #initializeTimer = 0;
    #onMessage = (event) => {
      if (
        !this.#frame ||
        event.origin !== this.#baseOrigin() ||
        event.source !== this.#frame.contentWindow ||
        !event.data
      ) {
        return;
      }

      if (
        event.data.type === "adsbook:add-to-cart" ||
        event.data.type === "adsbook:initiate-checkout"
      ) {
        try {
          const payload = event.data;
          const eventName = payload.type === "adsbook:add-to-cart" ? "AddToCart" : "InitiateCheckout";
          // The frame already fired this event on the store pixel and posted it to
          // CAPI under `eventId`. Relaying it onto the merchant page is only safe
          // while it carries that same id: an event with no eventID can never
          // deduplicate, so a merchant page sharing the store's pixel would count
          // one AddToCart twice. No id means no relay.
          const eventId = typeof payload.eventId === "string" ? payload.eventId.trim() : "";
          if (eventId && typeof window.fbq === "function") {
            window.fbq(
              "track",
              eventName,
              {
                content_name: payload.content_name,
                content_ids: payload.content_ids,
                content_type: payload.content_type || "product",
                value: Number(payload.value || 0),
                currency: payload.currency || "IDR",
              },
              { eventID: eventId },
            );
          }
          if (typeof window.gtag === "function") {
            window.gtag("event", eventName === "AddToCart" ? "add_to_cart" : "begin_checkout", {
              currency: payload.currency || "IDR",
              value: Number(payload.value || 0),
              items: payload.content_name ? [{ item_name: payload.content_name }] : [],
            });
          }
        } catch {}
        return;
      }

      if (event.data.type === "adsbook:checkout-redirect") {
        try {
          const target = this.#checkoutTarget(event.data.url);
          if (target) window.location.assign(target);
        } catch {}
        return;
      }

      if (event.data.type !== "adsbook:embed-resize") return;

      const height = Number(event.data.height);
      if (!Number.isFinite(height)) return;
      this.#frame.style.height = `${Math.max(480, Math.min(12000, height))}px`;
      this.#frame.height = String(Math.max(480, Math.min(12000, height)));
    };

    connectedCallback() {
      this.style.display = "block";
      this.style.width = "100%";
      this.style.maxWidth = "100%";
      window.clearTimeout(this.#initializeTimer);
      this.#initializeTimer = window.setTimeout(() => {
        if (this.isConnected) this.#initialize();
      }, 0);
    }

    disconnectedCallback() {
      window.clearTimeout(this.#initializeTimer);
      window.removeEventListener("message", this.#onMessage);
    }

    attributeChangedCallback() {
      if (this.isConnected) this.#syncFrame();
    }

    #initialize() {
      const frames = [...this.querySelectorAll("iframe[data-adsbook-form]")];
      this.#frame = frames.find((frame) => frame.id) || frames[0] || null;

      if (!this.#frame) {
        this.#frame = document.createElement("iframe");
        this.#frame.dataset.adsbookForm = "";
        this.append(this.#frame);
      }
      for (const frame of frames) {
        if (frame !== this.#frame) frame.remove();
      }

      this.#frame.style.display = "block";
      this.#frame.style.width = "100%";
      this.#frame.style.maxWidth = "100%";
      this.#frame.style.minHeight = "720px";
      this.#frame.style.border = "0";
      this.#frame.width = "100%";
      this.#frame.height ||= "1000";
      this.#frame.loading = "eager";
      this.#frame.referrerPolicy = "strict-origin-when-cross-origin";
      this.#frame.addEventListener("load", () => this.removeAttribute("aria-busy"), {
        once: true,
      });
      this.setAttribute("aria-busy", "true");
      this.#syncFrame();
      window.addEventListener("message", this.#onMessage);
    }

    #baseOrigin() {
      const configured = this.getAttribute("base-url")?.trim();
      try {
        return new URL(configured || scriptOrigin, document.baseURI).origin;
      } catch {
        return "";
      }
    }

    #checkoutTarget(value) {
      try {
        const target = new URL(String(value || ""), this.#baseOrigin());
        return target.origin === this.#baseOrigin() &&
          (target.pathname === "/payment" || target.pathname === "/thanks")
          ? target.toString()
          : "";
      } catch {
        return "";
      }
    }

    #syncFrame() {
      if (!this.#frame) return;
      const origin = this.#baseOrigin();
      const productId = this.getAttribute("product-id")?.trim();
      const mode = this.getAttribute("mode")?.trim().toLowerCase() || "hybrid";
      const variantId = this.getAttribute("variant-id")?.trim();

      if (!origin || !productId || !modes.has(mode)) {
        this.#frame.removeAttribute("src");
        this.#frame.title = "Form pemesanan belum dikonfigurasi";
        this.removeAttribute("aria-busy");
        this.setAttribute("data-error", "invalid-configuration");
        return;
      }

      const url = new URL("/embed/form", origin);
      url.searchParams.set("mode", mode);
      url.searchParams.set("product_id", productId);
      if (variantId) url.searchParams.set("variant_id", variantId);
      url.searchParams.set("v", snippetVersion);
      const trackingParams = getTrackingParams();
      for (const [k, v] of Object.entries(trackingParams)) {
        if (!url.searchParams.has(k)) url.searchParams.set(k, v);
      }
      const nextSrc = url.toString();

      this.removeAttribute("data-error");
      this.#frame.title =
        this.getAttribute("title")?.trim() || "Form pemesanan produk";
      if (this.#frame.src !== nextSrc) this.#frame.src = nextSrc;
    }
  }

  window.customElements.define(tagName, AdsBookFormWidget);
})();
