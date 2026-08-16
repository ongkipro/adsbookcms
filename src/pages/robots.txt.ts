import type { APIRoute } from "astro";

export const prerender = false;

/**
 * Served from the store's own identity rather than from `public/robots.txt`,
 * for two reasons the static file got wrong.
 *
 * Its `Sitemap:` line named the reference store's own domain, and shipped that
 * way to every install — pointing every merchant's crawler at someone else's
 * site.
 *
 * And it did not disallow anything for the crawlers that matter. Per RFC 9309 a
 * crawler obeys **only its most specific matching group**: once a file contains
 * a `User-agent: Googlebot` group, Googlebot ignores `User-agent: *` entirely.
 * Each named group held nothing but `Allow: /`, so Google, Bing, Perplexity,
 * GPTBot and ClaudeBot were all told the admin and the login screen were fair
 * game, while the file looked as though it protected them.
 */

const DISALLOWED = ["/admin/", "/api/", "/embed/", "/hello", "/install"];

// Named so their crawl behaviour is explicit rather than inherited. Every one
// of them needs its own copy of the disallow list.
const NAMED_AGENTS = [
  "Googlebot",
  "Googlebot-Image",
  "Bingbot",
  "PerplexityBot",
  "GPTBot",
  "ClaudeBot",
];

function group(agent: string) {
  return [
    `User-agent: ${agent}`,
    "Allow: /",
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
  ].join("\n");
}

export const GET: APIRoute = ({ locals }) => {
  const origin = locals.tenant.siteUrl.replace(/\/$/, "");
  const body = [
    group("*"),
    ...NAMED_AGENTS.map(group),
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
};
