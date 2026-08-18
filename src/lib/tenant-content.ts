import { getRuntimeEnv } from "./env";
import {
  loadPublishedHomeContent,
  type HomeContent,
} from "./storefront-content";
import { listLandingPages } from "./landing-pages";

export type TenantHomeContent = HomeContent;

export type TenantHomeContentResolution =
  | { state: "ready"; content: TenantHomeContent }
  | { state: "setup-required" }
  | { state: "unavailable" };

export async function getTenantHomeContent(
  locals?: App.Locals,
): Promise<TenantHomeContentResolution> {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== "object") {
    console.error("home-content-no-database-binding");
    return { state: "unavailable" };
  }

  const published = await loadPublishedHomeContent(database as D1Database);
  if (published.state === "unpublished") {
    console.error("home-content-unpublished");
    return { state: "setup-required" };
  }
  if (published.state === "unavailable") {
    return { state: "unavailable" };
  }

  if (!locals) {
    return { state: "ready", content: published.content };
  }

  try {
    const cmsSolutions = (await listLandingPages(locals))
      .filter((page) => !page.id.startsWith("static:") && Boolean(page.is_active))
      .map((page) => ({
        title: page.title,
        excerpt: page.meta_description || `Informasi ${page.title}`,
        image: "/images/adsbook-mark.webp",
        href: `/${page.slug}`,
        crop: "CMS Landing Page",
      }));

    return {
      state: "ready",
      content: {
        ...published.content,
        solutions:
          cmsSolutions.length > 0
            ? [...cmsSolutions, ...published.content.solutions]
            : published.content.solutions,
      },
    };
  } catch (error) {
    console.error("home-landing-pages-load", error);
    return { state: "unavailable" };
  }
}
