import { getRuntimeEnv } from "./env";
import { envTenantConfig, type PublicTenantConfig } from "./tenant";
import {
  loadPublishedHomeContent,
  type HomeContent,
} from "./storefront-content";
import { heroSlides, heroHighlights, proofs } from "../data/home";
import { solutionEntries } from "../data/content";
import { listLandingPages } from "./landing-pages";

export type TenantHomeContent = HomeContent;

const staticSolutions = solutionEntries.map((entry) => ({
  title: entry.title,
  excerpt: entry.excerpt,
  image: entry.image,
  href: entry.href || `/${entry.slug}`,
  crop: entry.category,
}));

/**
 * Structural shell used only while the merchant has not published home content
 * from /admin/content. It carries generic section labels and the store's own
 * identity — never marketing claims, and never copy inherited from another
 * install. `homeContentSource` records which path produced the page so a
 * degraded render is distinguishable from a configured one.
 */
export function buildDefaultHomeContent(
  tenant: Pick<PublicTenantConfig, "name" | "tagline" | "description">,
): HomeContent {
  return {
  hero: {
    title: tenant.name,
    description: tenant.tagline || tenant.description,
    ratingLabel: "",
  },
  catalog: {
    eyebrow: "Katalog Produk",
    title: "Produk yang Tersedia",
    description:
      "Lihat produk, pilihan varian, dan harga yang tersedia di katalog toko.",
  },
  solutionsHeading: {
    eyebrow: "Informasi Produk",
    title: "Pilihan dari Katalog",
    description:
      "Buka halaman produk untuk melihat informasi dan pilihan yang tersedia.",
  },
  proofsHeading: {
    eyebrow: "Informasi Toko",
    title: "Konten Tambahan",
    description:
      "Bagian ini hanya menampilkan konten yang telah diterbitkan oleh pengelola toko.",
  },
  heroHighlights,
  heroSlides,
  solutions: staticSolutions,
  proofs,
  };
}

export async function getTenantHomeContent(
  locals?: App.Locals,
): Promise<TenantHomeContent | null> {
  let cmsSolutions: typeof staticSolutions = [];

  if (locals) {
    try {
      const d1Pages = (await listLandingPages(locals)).filter(
        (page) => !page.id.startsWith("static:"),
      );
      cmsSolutions = d1Pages
        .filter((p) => Boolean(p.is_active))
        .map((p) => ({
          title: p.title,
          excerpt: p.meta_description || `Informasi ${p.title}`,
          image: "/images/logo.webp",
          href: `/${p.slug}`,
          crop: "CMS Landing Page",
        }));
    } catch (error) {
      // Gracefully fall back if database or table not ready. The page still
      // renders, but with the CMS landing pages missing from its solutions.
      console.error("home-landing-pages-load", error);
    }
  }

  const combinedSolutions = [...cmsSolutions, ...staticSolutions];
  const tenant = locals?.tenant ?? envTenantConfig;

  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== "object") {
    // No binding at all: the install is not wired up. Serving the structural
    // shell keeps the catalog reachable, but it is a degraded render.
    console.error("home-content-no-database-binding");
    return {
      ...buildDefaultHomeContent(tenant),
      solutions: combinedSolutions,
    };
  }

  const content = await loadPublishedHomeContent(database as D1Database);
  if (!content) {
    // Nothing published yet. Never inherit marketing copy — the shell carries
    // this store's own identity and generic section labels only.
    console.error("home-content-unpublished");
    return {
      ...buildDefaultHomeContent(tenant),
      solutions: combinedSolutions,
    };
  }

  return {
    ...content,
    solutions: cmsSolutions.length > 0 ? [...cmsSolutions, ...(content.solutions || staticSolutions)] : (content.solutions && content.solutions.length > 0 ? content.solutions : combinedSolutions),
  };
}
