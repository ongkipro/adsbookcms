import type { APIRoute } from "astro";
import { handleOptions, validateHeadlessRequest } from "../../../lib/headless-api.ts";
import { headlessOpenApiDocument } from "../../../lib/headless-openapi.ts";

export const prerender = false;
export const OPTIONS = handleOptions;

export const GET: APIRoute = async ({ request, locals }) => {
  const validation = await validateHeadlessRequest(request, locals, {
    operation: "openApiRead",
  });
  if (!validation.allowed) return validation.errorResponse;

  return validation.finalize(new Response(JSON.stringify(headlessOpenApiDocument), {
    status: 200,
    headers: {
      "content-type": "application/vnd.oai.openapi+json;version=3.1",
      "cache-control": "private, max-age=300",
      ...validation.corsHeaders,
    },
  }));
};
