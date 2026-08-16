import { getRuntimeEnv } from "./env";

export async function getStoreSupportWhatsapp(
  locals?: App.Locals,
): Promise<string> {
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!database || typeof database !== "object") {
    // No binding at all: every surface that offers support loses its contact
    // route, and the storefront renders as if support were unconfigured.
    console.error("storefront-support-whatsapp-no-database-binding");
    return "";
  }

  try {
    const store = await (database as D1Database)
      .prepare("SELECT support_whatsapp FROM stores ORDER BY id LIMIT 1")
      .first<{ support_whatsapp: string | null }>();
    if (!store) {
      // No row at all is a different failure from a row with no number saved:
      // the database is migrated but the store was never seeded, so every
      // other stores-backed read on this install is failing too.
      console.error("storefront-support-whatsapp-no-store-row");
      return "";
    }
    return store.support_whatsapp?.replace(/\D/g, "") || "";
  } catch (error) {
    console.error("storefront-support-whatsapp-load", error);
    return "";
  }
}
