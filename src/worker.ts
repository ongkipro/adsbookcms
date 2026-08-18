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
