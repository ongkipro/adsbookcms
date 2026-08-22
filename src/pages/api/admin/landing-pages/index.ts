import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../../lib/api";
import {
  buildLandingPageDuplicateInput,
  createLandingPage,
  getLandingPageById,
  LandingProductPageConflictError,
  listLandingPages,
  parseLandingPageDuplicatePayload,
  setLandingPageAsProductPage,
  type CreateLandingPageInput,
} from "../../../../lib/landing-pages";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.admin) return jsonError("Unauthorized", 401);

  try {
    const result = await listLandingPages(locals);
    return jsonOk({ data: result });
  } catch (error) {
    console.error("GET landing-pages", error);
    return jsonError("Failed to fetch landing pages", 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.admin) return jsonError("Unauthorized", 401);

  const body = await request.json().catch(() => null);

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (record.action === "set-product-page") {
    // Building a landing page is `advertiser` work; deciding what
    // `/produk/<slug>` serves every visitor is not. A19 already excluded that
    // role from commerce surfaces, and this changes the storefront itself.
    if (locals.admin.role !== "owner" && locals.admin.role !== "admin") {
      return jsonError(
        "Hanya owner atau admin yang dapat mengubah halaman produk.",
        403,
      );
    }
    const id = String(record.id || "").trim();
    if (!id || id.startsWith("static:")) {
      return jsonError("Landing page tidak valid.", 400);
    }
    if (typeof record.is_product_page !== "boolean") {
      return jsonError("Nilai halaman produk tidak valid.", 400);
    }
    try {
      const updated = await setLandingPageAsProductPage(
        locals,
        id,
        record.is_product_page,
      );
      if (!updated) return jsonError("Landing page not found", 404);
      return jsonOk({
        message: updated.is_product_page
          ? `Landing page /${updated.slug} kini menjadi halaman produk.`
          : `Landing page /${updated.slug} kembali berdiri sendiri.`,
        data: updated,
      });
    } catch (error: unknown) {
      if (error instanceof LandingProductPageConflictError) {
        return jsonError(error.message, 409);
      }
      console.error("POST set-product-page landing-page", error);
      return jsonError("Gagal mengubah status halaman produk.", 500);
    }
  }

  const duplicatePayload = parseLandingPageDuplicatePayload(body);
  if (duplicatePayload) {
    if ("error" in duplicatePayload) {
      return jsonError(duplicatePayload.error, 400);
    }

    try {
      const source = await getLandingPageById(
        locals,
        duplicatePayload.value.id,
      );
      if (!source) return jsonError("Landing page not found", 404);

      const result = await createLandingPage(
        locals,
        buildLandingPageDuplicateInput(source),
      );
      return jsonOk(
        {
          message: `Landing page duplicated as /${result.slug}`,
          data: result,
        },
        201,
      );
    } catch (error: unknown) {
      console.error("POST duplicate landing-page", error);
      const message =
        error instanceof Error ? error.message : "Unknown error";
      const status = message.includes("slug is already in use") ? 409 : 500;
      return jsonError("Failed to duplicate landing page: " + message, status);
    }
  }

  try {
    const result = await createLandingPage(
      locals,
      body as CreateLandingPageInput,
    );
    return jsonOk({ data: result });
  } catch (error: unknown) {
    console.error("POST landing-pages", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonError("Failed to create landing page: " + message, 500);
  }
};
