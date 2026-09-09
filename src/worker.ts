import type { ExecutionContext, ExportedHandler } from "@cloudflare/workers-types";
import { handle } from "@astrojs/cloudflare/handler";
import { purgeExpiredAbandonedOrders } from "./lib/order-persistence.ts";
import { getEnvValue } from "./lib/env.ts";
import {
  alertsFromOperationalHealth,
  evaluateOperationalAlerts,
} from "./lib/operational-alerts.ts";
import { collectOperationalHealth } from "./lib/operational-health.ts";
import { ensureSchemaUpgraded } from "./lib/schema-version.ts";
import { purgeExpiredRateLimits } from "./lib/rate-limit.ts";
import { purgeExpiredNotifications } from "./lib/notifications.ts";
import {
  expirePendingPaymentTransactions,
  purgeExpiredAutoLarisCallbacks,
  reconcileAutoLarisPaymentStatuses,
} from "./lib/autolaris-payment.ts";
import { enqueuePurchaseForPaidOrder } from "./lib/paid-order-purchase.ts";
import { envTenantConfig } from "./lib/tenant.ts";
import { drainCapiOutbox, purgeExpiredCapiOutboxEvents } from "./lib/capi-outbox.ts";
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
  context: ExecutionContext,
) {
  await ensureSchemaUpgraded(env.OMS_DB);
  const purgedAbandonedOrders = await purgeExpiredAbandonedOrders(
    env.OMS_DB,
    new Date(scheduledTime),
  );
  // Housekeeping never takes the outbox drains or the health evaluation down
  // with it: a transient D1 error here is logged and the hour goes on.
  const housekeeping = async (label: string, run: () => Promise<number>) => {
    try {
      return await run();
    } catch (error) {
      console.error(label, error);
      return -1;
    }
  };
  const purgedRateLimitWindows = await housekeeping(
    "scheduled-rate-limit-purge-failed",
    () => purgeExpiredRateLimits(env.OMS_DB, new Date(scheduledTime)),
  );
  const expiredPaymentInstructions = await housekeeping(
    "scheduled-payment-expiry-failed",
    () => expirePendingPaymentTransactions(env.OMS_DB, new Date(scheduledTime)),
  );
  const purgedProviderCallbacks = await housekeeping(
    "scheduled-callback-purge-failed",
    () => purgeExpiredAutoLarisCallbacks(env.OMS_DB, new Date(scheduledTime)),
  );
  const purgedNotifications = await housekeeping(
    "scheduled-notification-purge-failed",
    () => purgeExpiredNotifications(env.OMS_DB, new Date(scheduledTime)),
  );
  const purgedCapiOutboxEvents = await housekeeping(
    "scheduled-capi-outbox-purge-failed",
    () => purgeExpiredCapiOutboxEvents(env.OMS_DB, new Date(scheduledTime)),
  );
  // Payment truth for QRIS/VA. The retired webhook never answered; the
  // provider's Advice endpoint does, and this is the only clock that asks it.
  // A transaction is marked paid solely when the provider's own response says
  // so — an operator can still reconcile by hand from /admin/payments, and
  // every transition either way is audited.
  const scheduledLocals = {
    runtimeEnv: env,
    tenant: envTenantConfig,
    cfContext: context,
  } satisfies App.Locals;
  let autoLarisReconciliation = {
    checked: 0,
    pending: 0,
    unproven: 0,
    failed: 0,
    paidOrderIds: [] as number[],
    unrecognisedPaidStatuses: [] as string[],
  };
  try {
    autoLarisReconciliation = await reconcileAutoLarisPaymentStatuses(
      env.OMS_DB,
      scheduledLocals,
      new Date(scheduledTime),
    );
  } catch (error) {
    console.error("scheduled-autolaris-advice-failed", error);
  }
  for (const orderId of autoLarisReconciliation.paidOrderIds) {
    try {
      await enqueuePurchaseForPaidOrder(env.OMS_DB, scheduledLocals, orderId);
    } catch (error) {
      // Payment truth is authoritative. Conversion delivery is independently
      // retried by its outbox and must never roll a paid order back.
      console.error("scheduled-paid-order-purchase-failed", { orderId, error });
    }
  }
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
    purgedRateLimitWindows,
    expiredPaymentInstructions,
    purgedProviderCallbacks,
    purgedNotifications,
    purgedCapiOutboxEvents,
    autoLarisReconciliation: {
      checked: autoLarisReconciliation.checked,
      paid: autoLarisReconciliation.paidOrderIds.length,
      pending: autoLarisReconciliation.pending,
      unproven: autoLarisReconciliation.unproven,
      failed: autoLarisReconciliation.failed,
      // The provider's success code with a settlement word the allowlist does
      // not know. Non-empty here is the observation SCR1 needs, not an error.
      unrecognisedPaidStatuses: autoLarisReconciliation.unrecognisedPaidStatuses,
    },
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

  async scheduled(controller, env, ctx) {
    await runScheduledMaintenance(env, controller.scheduledTime, ctx);
  },
} satisfies ExportedHandler<CloudflareRuntimeEnv>;
