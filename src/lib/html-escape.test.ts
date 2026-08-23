import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtmlText } from "./html-escape.ts";

test("escapeHtmlText closes the </title> breakout that executed on a live install", () => {
  // Reproduced 2026-08-23: a product title carrying this payload reached
  // `<title set:html>` inside astro-seo and the script ran.
  const payload = "Pwn</title><script>globalThis.__xss=1</script>";
  const escaped = escapeHtmlText(payload);

  assert.equal(escaped.includes("</title>"), false);
  assert.equal(escaped.includes("<script>"), false);
  assert.equal(
    escaped,
    "Pwn&lt;/title&gt;&lt;script&gt;globalThis.__xss=1&lt;/script&gt;",
  );
});

test("ampersands are escaped first, so nothing is double-encoded", () => {
  // "&lt;" written by a merchant must survive as visible text, not become "<".
  assert.equal(escapeHtmlText("Tas & Dompet"), "Tas &amp; Dompet");
  assert.equal(escapeHtmlText("&lt;b&gt;"), "&amp;lt;b&amp;gt;");
});

test("quotes are left alone, because attribute values are escaped by Astro", () => {
  // Escaping them here too would double-encode every og:title.
  assert.equal(escapeHtmlText(`Sepatu "Pro" 'Max'`), `Sepatu "Pro" 'Max'`);
});

test("a title with nothing to escape is returned unchanged", () => {
  assert.equal(escapeHtmlText("Qa Form Product"), "Qa Form Product");
});
