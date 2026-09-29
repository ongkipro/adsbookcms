import { getRuntimeEnv } from "./env.ts";

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

/**
 * What /thanks needs for its WhatsApp hand-off: the support number and whether
 * the operator turned the automatic redirect on (migration 0060). Any failure
 * reads as "off" — the page then shows its button, as it always has.
 */
export async function getThanksWhatsappSettings(
  locals?: App.Locals,
): Promise<{ phone: string; autoRedirect: boolean }> {
  const phone = await getStoreSupportWhatsapp(locals);
  const database = getRuntimeEnv(locals)?.OMS_DB;
  if (!phone || !database || typeof database !== "object") return { phone, autoRedirect: false };
  try {
    const row = await (database as D1Database)
      .prepare("SELECT thanks_whatsapp_redirect FROM stores ORDER BY id LIMIT 1")
      .first<{ thanks_whatsapp_redirect: number | null }>();
    return { phone, autoRedirect: Number(row?.thanks_whatsapp_redirect) === 1 };
  } catch (error) {
    console.error("storefront-thanks-whatsapp-redirect-load", error);
    return { phone, autoRedirect: false };
  }
}
