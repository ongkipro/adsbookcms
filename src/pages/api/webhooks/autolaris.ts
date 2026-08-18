import type { APIRoute } from "astro";
import { jsonError } from "../../../lib/api.ts";

export const prerender = false;

// AutoLaris does not provide an accepted payment webhook contract. Keep the
// former URL as an explicit tombstone so retries cannot mutate payment state.
export const POST: APIRoute = async () =>
  jsonError(
    "Webhook AutoLaris tidak digunakan. Pembayaran diverifikasi manual oleh operator.",
    410,
    { code: "AUTOLARIS_WEBHOOK_RETIRED" },
  );
