export const CHECKOUT_REDIRECT_MESSAGE = "adsbook:checkout-redirect";

function getParentOrigin() {
  try {
    return document.referrer ? new URL(document.referrer).origin : "";
  } catch {
    return "";
  }
}


export function navigateAfterCheckout(destination: string) {
  const targetUrl = new URL(destination, window.location.href);
  const isCheckoutCompletion =
    targetUrl.pathname === "/thanks" || targetUrl.pathname === "/payment";

  if (isCheckoutCompletion) {
    targetUrl.search = "";
  }

  // Completion state stays in same-origin sessionStorage. No order identifiers,
  // status tokens, customer data, or attribution values belong in completion URLs.
  if (!isCheckoutCompletion) {
    try {
      const trackingRaw = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("adsbook_click_ids") : null;
      const tracking = trackingRaw ? JSON.parse(trackingRaw) : {};
      const currentParams = new URLSearchParams(window.location.search);
      const trackingKeys = [
        "gclid", "gbraid", "wbraid", "_fbp", "_fbc", "fbclid", "ttclid",
        "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"
      ];
      for (const key of trackingKeys) {
        const val = currentParams.get(key) || tracking[key];
        if (val && !targetUrl.searchParams.has(key)) {
          targetUrl.searchParams.set(key, val);
        }
      }
    } catch {}
  }

  const target = targetUrl.toString();

  if (typeof window !== "undefined" && window.parent !== window) {
    const parentOrigin = getParentOrigin();
    if (parentOrigin) {
      window.parent.postMessage(
        {
          type: CHECKOUT_REDIRECT_MESSAGE,
          url: target,
        },
        parentOrigin,
      );
    }

    try {
      if (window.top) {
        window.top.location.assign(target);
        return;
      }
    } catch {
      // A sandboxed or cross-origin iframe must fall back to frame navigation if top window navigation is blocked.
    }
    window.location.assign(target);
    return;
  }

  if (typeof window !== "undefined") {
    window.location.assign(target);
  }
}
