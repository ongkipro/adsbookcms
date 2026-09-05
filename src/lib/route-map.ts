/**
 * The route surface, derived from `src/pages/` rather than described by hand.
 *
 * ARCHITECTURE.md §3 summarises this surface in prose ("`/admin/*` — 27 pages").
 * Prose drifts: there are 28 admin pages today, and the section still describes
 * a 41-file migration chain that is now 52. A map you have to remember to
 * update is a map that lies, so this one is generated and drift-tested instead
 * (`npm run route-map`, `src/lib/route-map.test.ts`).
 *
 * Nothing in the Worker imports this module. It is tooling: the generator
 * script and its test are the only consumers, so it never reaches the bundle.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ADMIN_ROLES, canAccessAdminRoute, type AdminRole } from "./auth.ts";

export const PAGES_DIR = "src/pages";

export type RouteFamily =
  | "Storefront"
  | "Content page"
  | "Landing page"
  | "Checkout form"
  | "Install & auth"
  | "Feed"
  | "Media"
  | "Admin page"
  | "Admin API"
  | "Public API"
  | "Headless API"
  | "Webhook";

export type RouteAuth =
  | "public"
  | "admin session"
  | "api key"
  | "install token"
  | "provider signature";

export type RouteEntry = {
  path: string;
  file: string;
  family: RouteFamily;
  methods: string[];
  auth: RouteAuth;
  /** Empty unless the route is role-gated. */
  roles: AdminRole[];
};

/** The order families are presented in — public surface first, operator last. */
export const FAMILY_ORDER: readonly RouteFamily[] = [
  "Storefront",
  "Content page",
  "Landing page",
  "Checkout form",
  "Feed",
  "Media",
  "Install & auth",
  "Public API",
  "Headless API",
  "Webhook",
  "Admin page",
  "Admin API",
] as const;

const CONTENT_PAGES = new Set([
  "/tentang",
  "/kontak",
  "/testimoni",
  "/sitemap",
  "/disclaimer",
  "/kebijakan-privasi",
  "/kebijakan-cookie",
  "/syarat-ketentuan",
  "/pengiriman",
]);

const CHECKOUT_FORMS = new Set([
  "/hybrid-form",
  "/middle-form",
  "/full-form",
  "/geoipform",
  "/embed/form",
  // Query-preserving 308s to the three above. They exist as files, so they
  // belong on the map — their absence is what made someone add them twice.
  "/form-hybrid",
  "/form-middle",
  "/form-full",
]);

const LANDING_PAGES = new Set(["/[slug]", "/contoh-landing", "/solusi-terbaru", "/landing-page"]);

/**
 * `src/pages/admin/orders/[invoice].astro` → `/admin/orders/[invoice]`.
 *
 * Astro's own bracket syntax is kept rather than translated to `:param`,
 * because the point of this map is to get from a URL back to a file.
 */
export function toRoutePath(relativeFile: string): string {
  const withoutExtension = relativeFile.replace(/\.(astro|ts)$/, "");
  // `robots.txt.ts` → `robots.txt`, `feed/x.xml.ts` → `feed/x.xml`: only the
  // final extension is a file extension, the rest is part of the URL.
  const trimmed = withoutExtension.replace(/\/index$/, "");
  if (trimmed === "index" || trimmed === "") return "/";
  return `/${trimmed}`;
}

export function classify(path: string): RouteFamily {
  if (path.startsWith("/api/admin")) return "Admin API";
  if (path.startsWith("/api/v1")) return "Headless API";
  if (path.startsWith("/api/webhooks")) return "Webhook";
  if (path.startsWith("/api/")) return "Public API";
  if (path.startsWith("/admin")) return "Admin page";
  if (path.startsWith("/assets/") || path.startsWith("/media/")) return "Media";
  if (path.startsWith("/feed/") || path === "/sitemap.xml" || path === "/robots.txt") return "Feed";
  if (path === "/install" || path === "/hello") return "Install & auth";
  if (CHECKOUT_FORMS.has(path)) return "Checkout form";
  if (CONTENT_PAGES.has(path)) return "Content page";
  if (LANDING_PAGES.has(path)) return "Landing page";
  return "Storefront";
}

export function authFor(path: string, family: RouteFamily): RouteAuth {
  if (family === "Admin page" || family === "Admin API") return "admin session";
  if (family === "Headless API") return "api key";
  if (family === "Webhook") return "provider signature";
  if (path === "/install" || path === "/api/install") return "install token";
  return "public";
}

/**
 * Which roles reach a route, asked of `canAccessAdminRoute` itself rather than
 * copied out of it. A grant that moves in `src/lib/auth.ts` moves here on the
 * next generate, and the drift test fails until someone regenerates.
 */
export function rolesFor(path: string, family: RouteFamily): AdminRole[] {
  if (family !== "Admin page" && family !== "Admin API") return [];
  return ADMIN_ROLES.filter((role) => canAccessAdminRoute(role, path));
}

const METHOD_EXPORT = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|ALL)\b/g;

export function methodsOf(source: string, file: string): string[] {
  // An `.astro` page is a document: it answers GET and nothing else.
  if (file.endsWith(".astro")) return ["GET"];
  const found = new Set<string>();
  for (const match of source.matchAll(METHOD_EXPORT)) found.add(match[1]);
  return [...found].sort();
}

/** Every page file under `dir`, relative to it, sorted. */
export function listPageFiles(dir: string = PAGES_DIR): string[] {
  const walk = (current: string, prefix: string): string[] =>
    readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
      const next = join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return walk(next, relative);
      return /\.(astro|ts)$/.test(entry.name) ? [relative] : [];
    });
  return walk(dir, "").sort();
}

export function buildRouteMap(dir: string = PAGES_DIR): RouteEntry[] {
  return listPageFiles(dir)
    .map((relative) => {
      const path = toRoutePath(relative);
      const family = classify(path);
      return {
        path,
        file: `${dir}/${relative}`,
        family,
        methods: methodsOf(readFileSync(join(dir, relative), "utf8"), relative),
        auth: authFor(path, family),
        roles: rolesFor(path, family),
      };
    })
    .sort((a, b) => {
      const byFamily = FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family);
      return byFamily !== 0 ? byFamily : a.path.localeCompare(b.path);
    });
}

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function toXml(routes: RouteEntry[], version: string): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- Generated by `npm run route-map`. Do not edit by hand. -->",
    `<route-map version="${escape(version)}" routes="${routes.length}" source="${PAGES_DIR}">`,
  ];
  for (const family of FAMILY_ORDER) {
    const inFamily = routes.filter((route) => route.family === family);
    if (inFamily.length === 0) continue;
    lines.push(`  <family name="${escape(family)}" count="${inFamily.length}">`);
    for (const route of inFamily) {
      const roles = route.roles.length > 0 ? ` roles="${route.roles.join(",")}"` : "";
      lines.push(
        `    <route path="${escape(route.path)}" methods="${route.methods.join(",")}"` +
          ` auth="${escape(route.auth)}"${roles} file="${escape(route.file)}"/>`,
      );
    }
    lines.push("  </family>");
  }
  lines.push("</route-map>", "");
  return lines.join("\n");
}

export function toMarkdown(routes: RouteEntry[], version: string): string {
  const lines = [
    "# Route Map",
    "",
    "> Generated by `npm run route-map` from `src/pages/`. Do not edit by hand —",
    "> `src/lib/route-map.test.ts` fails when this file and the filesystem disagree.",
    "",
    `AdsBookCMS ${version} — **${routes.length} routes** across ${
      new Set(routes.map((route) => route.family)).size
    } families.`,
    "",
    "`auth` is the boundary a request crosses, not a promise that the route is safe:",
    "`admin session` means the middleware requires a signed session, and `roles` lists",
    "which of them `canAccessAdminRoute` actually admits.",
    "",
  ];
  for (const family of FAMILY_ORDER) {
    const inFamily = routes.filter((route) => route.family === family);
    if (inFamily.length === 0) continue;
    lines.push(`## ${family} (${inFamily.length})`, "");
    lines.push("| Route | Methods | Auth | Roles | File |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const route of inFamily) {
      lines.push(
        `| \`${route.path}\` | ${route.methods.join(", ") || "—"} | ${route.auth} | ${
          route.roles.length > 0 ? route.roles.join(", ") : "—"
        } | \`${route.file}\` |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}
