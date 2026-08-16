import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../../lib/api";
import { getLandingPageById, updateLandingPage, deleteLandingPage } from "../../../../lib/landing-pages";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.admin) return jsonError("Unauthorized", 401);
  const { id } = params;
  if (!id) return jsonError("ID is required", 400);

  try {
    const result = await getLandingPageById(locals, id);
    if (!result) return jsonError("Landing page not found", 404);
    return jsonOk({ data: result });
  } catch (error) {
    console.error("GET landing-pages/[id]", error);
    return jsonError("Failed to fetch landing page", 500);
  }
};

export const PUT: APIRoute = async ({ request, params, locals }) => {
  if (!locals.admin) return jsonError("Unauthorized", 401);
  const { id } = params;
  if (!id) return jsonError("ID is required", 400);

  try {
    const body = await request.json();
    const result = await updateLandingPage(locals, id, body);
    return jsonOk({ data: result });
  } catch (error: unknown) {
    console.error("PUT landing-pages/[id]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonError("Failed to update landing page: " + message, 500);
  }
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.admin) return jsonError("Unauthorized", 401);
  const { id } = params;
  if (!id) return jsonError("ID is required", 400);

  try {
    await deleteLandingPage(locals, id);
    return jsonOk({ message: "Deleted successfully" });
  } catch (error: unknown) {
    console.error("DELETE landing-pages/[id]", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonError("Failed to delete landing page: " + message, 500);
  }
};
