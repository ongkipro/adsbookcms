import type { FormMode } from "./form-mode";

/**
 * Bumped whenever the behaviour of a *pasted* snippet changes. A snippet lives on
 * a page this repository will never deploy to, so the marker has to travel in the
 * frame URL: `/embed/form` is served by the store on every embed load and is the
 * only place that can observe which generation a merchant page is still running.
 *
 * Treat an absent marker as version 1 — every snippet generated before this
 * existed, including the pre-`c967faa` ones that fire an unqualified Purchase,
 * a Google conversion and a TikTok CompletePayment at redirect time, forever.
 */
export const EMBED_SNIPPET_VERSION = 2;

const VERSION_PARAM = "v";

export type EmbedMarkupInput = {
  origin: string;
  embedUrl: string;
  elementId: string;
  title: string;
  productId: string;
  variantId?: string;
  mode: FormMode;
};

function escapeHtmlAttribute(value: string) {
  return value.replace(
    /[&"'<>]/g,
    (character) =>
      ({
        "&": "&amp;",
        '"': "&quot;",
        "'": "&#39;",
        "<": "&lt;",
        ">": "&gt;",
      })[character] || character,
  );
}

function buildIframe(id: string, url: string, title: string, loading: "eager" | "lazy") {
  return `<iframe id="${id}" data-adsbook-form src="${url}" title="${title}" width="100%" height="1000" loading="${loading}" referrerpolicy="strict-origin-when-cross-origin" style="display:block;width:100%;max-width:100%;min-height:720px;border:0"></iframe>`;
}

function withSnippetVersion(url: string) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set(VERSION_PARAM, String(EMBED_SNIPPET_VERSION));
    return parsed.toString();
  } catch {
    return url;
  }
}

export type StaleEmbedSnippet = {
  parent: string;
  snippetVersion: number;
  currentVersion: number;
};

/**
 * Decides whether an `/embed/form` request came from a merchant page running an
 * outdated paste. Deliberately narrow: the only facts it reads are the version
 * marker and the *origin* of the referrer — never its path, never a query string,
 * never anything about the visitor. This is a diagnostic, not telemetry.
 */
export function detectStaleEmbedSnippet(input: {
  versionParam: string | null;
  referer: string | null;
  selfOrigin: string;
}): StaleEmbedSnippet | null {
  let parent = "";
  try {
    parent = input.referer ? new URL(input.referer).origin : "";
  } catch {
    parent = "";
  }
  // A direct visit and the admin's own preview carry no third-party parent, so
  // neither is evidence of a pasted snippet, stale or otherwise.
  if (!parent || parent === input.selfOrigin) return null;

  const parsed = Number(input.versionParam);
  const snippetVersion = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  if (snippetVersion >= EMBED_SNIPPET_VERSION) return null;

  return { parent, snippetVersion, currentVersion: EMBED_SNIPPET_VERSION };
}

export function buildEmbedMarkup(input: EmbedMarkupInput) {
  const id = escapeHtmlAttribute(input.elementId);
  const origin = escapeHtmlAttribute(input.origin);
  const embedUrl = escapeHtmlAttribute(withSnippetVersion(input.embedUrl));
  const title = escapeHtmlAttribute(input.title);
  const productId = escapeHtmlAttribute(input.productId);
  const variantAttribute = input.variantId
    ? ` variant-id="${escapeHtmlAttribute(input.variantId)}"`
    : "";
  const plainIframe = buildIframe(id, embedUrl, title, "lazy");
  const eagerIframe = buildIframe(id, embedUrl, title, "eager");

  return {
    plainIframe,
    widget: `<adsbook-form-widget product-id="${productId}"${variantAttribute} mode="${input.mode}" base-url="${origin}">\n${eagerIframe}\n</adsbook-form-widget>\n<script async src="${origin}/adsbook-form-widget.js?${VERSION_PARAM}=${EMBED_SNIPPET_VERSION}"></script>`,
  };
}
