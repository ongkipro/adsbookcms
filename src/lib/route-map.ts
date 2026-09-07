/**
 * The route surface, derived from `src/pages/` rather than described by hand.
 *
 * ARCHITECTURE.md §3 summarises this surface in prose ("`/admin/*` — 27 pages").
 * Prose drifts: there are 28 admin pages today, and the section still describes
 * a 41-file migration chain that is now 52. A map you have to remember to
 * update is a map that lies, so this one is generated and drift-tested instead
 * (`npm run route-map`, `src/lib/route-map.test.ts`).
 *
 * It answers the questions an audit actually asks, in the order it asks them:
 * which file serves this URL, which `src/lib` modules it leans on, which D1
 * tables that surface touches, and which test would catch a regression. The
 * table list is read from `CREATE TABLE` in the migrations, so a table name
 * that appears in SQL but was never created is not silently invented here.
 *
 * Table attribution is one level deep — a route's own SQL plus the SQL of the
 * modules it imports directly. Deeper chains exist (a lib importing a lib) and
 * are deliberately not followed: the map names where to look, it does not
 * replace reading the code.
 *
 * Nothing in the Worker imports this module. It is tooling: the generator
 * script and its test are the only consumers, so it never reaches the bundle.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  /** `src/lib` modules the route file imports directly, by name. */
  libs: string[];
  /** D1 tables named in the route's SQL and in its direct lib imports' SQL. */
  tables: string[];
  /** Sibling `*.test.ts` files of those libs — where a regression would show. */
  tests: string[];
};

export type ModuleEntry = {
  name: string;
  file: string;
  exports: string[];
  tables: string[];
  /** Path of the sibling test, or null when the module has none. */
  test: string | null;
  /** Route paths that import this module directly. */
  usedBy: string[];
};

export const LIB_DIR = "src/lib";
export const MIGRATIONS_DIR = "src/db/migrations";

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

const LIB_IMPORT = /from\s+["'](?:\.\.\/)+lib\/([a-z0-9-]+)(?:\.ts)?["']/g;
const SQL_TABLE = /\b(?:FROM|INTO|UPDATE|JOIN)\s+`?([a-z_]+)`?/g;
const CREATE_TABLE = /CREATE TABLE (?:IF NOT EXISTS )?`?([a-z_]+)`?/g;
const EXPORTED = /^\s*export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+([A-Za-z0-9_]+)/gm;

/** Tables the migrations actually create. `*_next` is a rebuild scratch name. */
export function knownTables(dir: string = MIGRATIONS_DIR): Set<string> {
  const names = new Set<string>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".sql")) continue;
    for (const m of readFileSync(join(dir, file), "utf8").matchAll(CREATE_TABLE)) {
      if (!m[1].endsWith("_next")) names.add(m[1]);
    }
  }
  return names;
}

export function libImportsOf(source: string): string[] {
  return [...new Set([...source.matchAll(LIB_IMPORT)].map((m) => m[1]))].sort();
}

export function tablesOf(source: string, known: Set<string>): string[] {
  return [...new Set([...source.matchAll(SQL_TABLE)].map((m) => m[1]).filter((t) => known.has(t)))].sort();
}

export function exportsOf(source: string): string[] {
  return [...new Set([...source.matchAll(EXPORTED)].map((m) => m[1]))].sort();
}

/** Every non-test module under `src/lib`, keyed by its import name. */
export function listLibModules(dir: string = LIB_DIR): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file.endsWith(".d.ts")) continue;
    out.set(file.replace(/\.ts$/, ""), `${dir}/${file}`);
  }
  return out;
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
  const known = knownTables();
  const modules = listLibModules();
  const libSource = new Map<string, string>();
  const readLib = (name: string) => {
    if (!libSource.has(name)) libSource.set(name, readFileSync(modules.get(name)!, "utf8"));
    return libSource.get(name)!;
  };
  return listPageFiles(dir)
    .map((relative) => {
      const path = toRoutePath(relative);
      const family = classify(path);
      const source = readFileSync(join(dir, relative), "utf8");
      // Only libs that exist on disk: a stale import would otherwise be listed
      // as a dependency and, worse, be looked up for its SQL.
      const libs = libImportsOf(source).filter((name) => modules.has(name));
      const tables = new Set(tablesOf(source, known));
      for (const name of libs) for (const t of tablesOf(readLib(name), known)) tables.add(t);
      const tests = libs
        .map((name) => `${LIB_DIR}/${name}.test.ts`)
        .filter((file) => existsSync(file));
      return {
        path,
        file: `${dir}/${relative}`,
        family,
        methods: methodsOf(source, relative),
        auth: authFor(path, family),
        roles: rolesFor(path, family),
        libs,
        tables: [...tables].sort(),
        tests,
      };
    })
    .sort((a, b) => {
      const byFamily = FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family);
      return byFamily !== 0 ? byFamily : a.path.localeCompare(b.path);
    });
}

export function buildModuleMap(routes: RouteEntry[]): ModuleEntry[] {
  const known = knownTables();
  return [...listLibModules()].map(([name, file]) => {
    const source = readFileSync(file, "utf8");
    const test = `${LIB_DIR}/${name}.test.ts`;
    return {
      name,
      file,
      exports: exportsOf(source),
      tables: tablesOf(source, known),
      test: existsSync(test) ? test : null,
      usedBy: routes.filter((r) => r.libs.includes(name)).map((r) => r.path),
    };
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
      const opt = (k: string, v: string[]) => (v.length > 0 ? ` ${k}="${escape(v.join(","))}"` : "");
      lines.push(
        `    <route path="${escape(route.path)}" methods="${route.methods.join(",")}"` +
          ` auth="${escape(route.auth)}"${roles} file="${escape(route.file)}"` +
          `${opt("libs", route.libs)}${opt("tables", route.tables)}${opt("tests", route.tests)}/>`,
      );
    }
    lines.push("  </family>");
  }
  const modules = buildModuleMap(routes);
  lines.push(`  <modules count="${modules.length}" source="${LIB_DIR}">`);
  for (const m of modules) {
    const opt = (k: string, v: string[]) => (v.length > 0 ? ` ${k}="${escape(v.join(","))}"` : "");
    lines.push(
      `    <module name="${escape(m.name)}" file="${escape(m.file)}"` +
        ` test="${m.test ? escape(m.test) : "none"}"` +
        `${opt("exports", m.exports)}${opt("tables", m.tables)}${opt("used-by", m.usedBy)}/>`,
    );
  }
  lines.push("  </modules>");
  lines.push("</route-map>", "");
  return lines.join("\n");
}

export function toMarkdown(routes: RouteEntry[], version: string): string {
  const list = (v: string[]) => (v.length > 0 ? v.map((x) => `\`${x}\``).join(" ") : "—");
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
    "Read it as a dictionary, left to right: **URL → file → libs → tables → tests**.",
    "`libs` are the `src/lib` modules the file imports directly; `tables` are the D1",
    "tables named in that file's SQL and in those libs' SQL (one level, not deeper);",
    "`tests` are the libs' sibling test files — the first place a regression shows.",
    "A route with no `tests` is a route whose behaviour only a browser can prove.",
    "The [Modules](#modules) section is the same book read from the other side.",
    "",
  ];
  for (const family of FAMILY_ORDER) {
    const inFamily = routes.filter((route) => route.family === family);
    if (inFamily.length === 0) continue;
    lines.push(`## ${family} (${inFamily.length})`, "");
    lines.push("| Route | Methods | Auth | Roles | File | Libs | Tables | Tests |");
    lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const route of inFamily) {
      lines.push(
        `| \`${route.path}\` | ${route.methods.join(", ") || "—"} | ${route.auth} | ${
          route.roles.length > 0 ? route.roles.join(", ") : "—"
        } | \`${route.file}\` | ${list(route.libs)} | ${list(route.tables)} | ${list(
          route.tests.map((t) => t.replace(`${LIB_DIR}/`, "")),
        )} |`,
      );
    }
    lines.push("");
  }
  const modules = buildModuleMap(routes);
  const untested = modules.filter((m) => !m.test);
  lines.push(
    "## Modules",
    "",
    `${modules.length} modules under \`${LIB_DIR}\`; ${untested.length} without a sibling test.`,
    "`used by` lists routes importing the module directly — a module used by nothing",
    "is either transitive (imported by another lib) or dead, and only reading tells which.",
    "",
    "| Module | Exports | Tables | Test | Used by |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const m of modules) {
    lines.push(
      `| \`${m.name}\` | ${m.exports.length} | ${list(m.tables)} | ${
        m.test ? "✓" : "**none**"
      } | ${m.usedBy.length > 0 ? m.usedBy.map((p) => `\`${p}\``).join(" ") : "—"} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}
