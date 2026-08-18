import { getEnvValue, getRuntimeEnv } from "./env.ts";

export const DEFAULT_MENGANTAR_BASE_URL = "https://api-public.mengantar.com";
export const DEFAULT_AUTOLARIS_BASE_URL = "https://api-h2h.autolaris.com";

type ProviderConfigRow = {
  mengantar_api_key: string | null;
  mengantar_base_url: string | null;
  autolaris_api_key: string | null;
  autolaris_base_url: string | null;
};

export type ProviderConfig = {
  mengantar: {
    apiKey: string;
    baseUrl: string;
    source: "dashboard" | "server" | "none";
  };
  autolaris: {
    apiKey: string;
    baseUrl: string;
    source: "dashboard" | "server" | "none";
  };
};

const clean = (value: string | null | undefined) => value?.trim() || "";

export async function getProviderConfig(
  database: D1Database,
  locals?: App.Locals,
): Promise<ProviderConfig> {
  const row = await database
    .prepare(
      `
    SELECT mengantar_api_key, mengantar_base_url, autolaris_api_key, autolaris_base_url
    FROM stores
    ORDER BY id
    LIMIT 1
  `,
    )
    .first<ProviderConfigRow>();
  const env = getRuntimeEnv(locals);
  const mengantarDbKey = clean(row?.mengantar_api_key);
  const autolarisDbKey = clean(row?.autolaris_api_key);
  const mengantarEnvKey = getEnvValue("MENGANTAR_API_KEY", env);
  const autolarisEnvKey = getEnvValue("AUTOLARIS_API_KEY", env);

  return {
    mengantar: {
      apiKey: mengantarDbKey || mengantarEnvKey,
      baseUrl:
        clean(row?.mengantar_base_url) ||
        getEnvValue("MENGANTAR_BASE_URL", env) ||
        DEFAULT_MENGANTAR_BASE_URL,
      source: mengantarDbKey
        ? "dashboard"
        : mengantarEnvKey
          ? "server"
          : "none",
    },
    autolaris: {
      apiKey: autolarisDbKey || autolarisEnvKey,
      baseUrl:
        clean(row?.autolaris_base_url) ||
        getEnvValue("AUTOLARIS_BASE_URL", env) ||
        DEFAULT_AUTOLARIS_BASE_URL,
      source: autolarisDbKey
        ? "dashboard"
        : autolarisEnvKey
          ? "server"
          : "none",
    },
  };
}
