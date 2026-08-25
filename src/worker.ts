import type { ExportedHandler } from "@cloudflare/workers-types";
import { handle } from "@astrojs/cloudflare/handler";
import { purgeExpiredAbandonedOrders } from "./lib/order-persistence.ts";
import { getEnvValue } from "./lib/env.ts";
import {
  alertsFromOperationalHealth,
  evaluateOperationalAlerts,
} from "./lib/operational-alerts.ts";
import { collectOperationalHealth } from "./lib/operational-health.ts";
import { ensureSchemaUpgraded } from "./lib/schema-version.ts";
import { drainCapiOutbox } from "./lib/capi-outbox.ts";
import { getStoreAdsConfig } from "./lib/store-ads.ts";
import {
  drainGoogleAdsConversionOutbox,
  readGoogleAdsOfflineConfig,
  reconcileGoogleAdsConversions,
} from "./lib/google-ads-offline.ts";
type AstroRequest = Parameters<typeof handle>[0];

async function runScheduledMaintenance(
  env: CloudflareRuntimeEnv,
  scheduledTime: number,
) {
  await ensureSchemaUpgraded(env.OMS_DB);
  const purgedAbandonedOrders = await purgeExpiredAbandonedOrders(
    env.OMS_DB,
    new Date(scheduledTime),
  );
  // The outbox had no clock of its own: `drainCapiOutbox` was reachable only
  // from `/api/meta-event` and `/api/v1/tracking/events`, so a delivery that
  // failed was retried when the next visitor arrived rather than when its
  // backoff expired. Backoff caps at an hour, which assumes someone will be
  // along within the hour — not true for a store between campaigns, and the
  // health check below was already counting the overdue rows without anything
  // acting on them.
  const ads = await getStoreAdsConfig({ runtimeEnv: env } as unknown as App.Locals);
  const drainedCapiEvents =
    ads.metaPixelId && ads.metaCapiToken
      ? await drainCapiOutbox(env.OMS_DB, ads.metaPixelId, ads.metaCapiToken)
      : 0;
  const googleAdsOffline = readGoogleAdsOfflineConfig(env);
  const queuedGoogleAdsConversions = googleAdsOffline
    ? await reconcileGoogleAdsConversions(
        env.OMS_DB,
        googleAdsOffline,
        new Date(scheduledTime),
      )
    : 0;
  const drainedGoogleAdsConversions = googleAdsOffline
    ? await drainGoogleAdsConversionOutbox(env.OMS_DB, googleAdsOffline)
    : 0;

  const health = await collectOperationalHealth(env.OMS_DB);
  const alerts = await evaluateOperationalAlerts(
    alertsFromOperationalHealth(health),
    {
      store: env.SESSION,
      webhookUrl: getEnvValue("OPS_ALERT_WEBHOOK_URL", {
        OPS_ALERT_WEBHOOK_URL: env.OPS_ALERT_WEBHOOK_URL,
      }),
    },
  );

  console.info("operational-health-scheduled", {
    overall: health.overall,
    schemaState: health.build.schemaState,
    purgedAbandonedOrders,
    drainedCapiEvents,
    queuedGoogleAdsConversions,
    drainedGoogleAdsConversions,
    alerts: alerts.map(({ id, state, reason, transition, notification }) => ({
      id,
      state,
      reason,
      transition,
      notification,
    })),
  });
}

export default {
  fetch(request, env, ctx) {
    // @astrojs/cloudflare's public handler uses the DOM Request type while
    // ExportedHandler supplies the structurally compatible Workers Request.
    return handle(request as unknown as AstroRequest, env, ctx);
  },

  async scheduled(controller, env) {
    await runScheduledMaintenance(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<CloudflareRuntimeEnv>;
