import type { APIRoute } from "astro";
import { jsonError, jsonOk } from "../../../lib/api";
import { getRuntimeEnv } from "../../../lib/env";
import { MengantarClient } from "../../../lib/mengantar-client";
import { getProviderConfig } from "../../../lib/provider-config";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database) {
    return jsonError("Database belum tersedia", 503);
  }

  const action = url.searchParams.get("action");

  try {
    const config = await getProviderConfig(database, locals);
    if (!config.mengantar.apiKey) {
      return jsonError(
        "Mengantar API Key belum dikonfigurasi. Silakan atur di Profil Admin & Integrasi API.",
        400,
      );
    }

    const client = new MengantarClient(
      config.mengantar.apiKey,
      config.mengantar.baseUrl,
    );

    if (action === "search-address") {
      const keyword = String(url.searchParams.get("keyword") || "").trim();
      if (!keyword || keyword.length < 3) return jsonOk({ data: [] });
      const results = await client.searchAddress(keyword);
      return jsonOk({ data: results });
    }

    if (action === "estimate") {
      const originId = String(url.searchParams.get("origin") || "").trim();
      const destinationId = String(
        url.searchParams.get("destination") || "",
      ).trim();
      const weight = Number(url.searchParams.get("weight") || 1);
      // The operator checker is the one caller allowed to ask for the COD fee.
      // Passing it on a checkout quote would bill the buyer twice: the COD
      // service fee is owned by `payment-fee-policy.ts` and charged separately.
      const rawCodAmount = Number(url.searchParams.get("cod") || 0);
      const codAmount =
        Number.isFinite(rawCodAmount) && rawCodAmount > 0
          ? Math.min(Math.round(rawCodAmount), 100_000_000)
          : undefined;

      if (!originId || !destinationId) {
        return jsonError("origin dan destination wajib diisi", 400);
      }

      const rates = await client.estimateRates({
        originId,
        destinationId,
        weight,
        courier: "all",
        codAmount,
      });

      return jsonOk({ data: rates });
    }

    return jsonError("Action tidak valid", 400);
  } catch (error) {
    console.error("admin-ongkir-get", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Terjadi kesalahan saat menghubungi Mengantar.",
      500,
    );
  }
};
