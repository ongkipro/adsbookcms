import type { APIRoute } from 'astro';
import { jsonError, jsonOk } from '../../../lib/api';
import { getEnvValue, getRuntimeEnv } from '../../../lib/env';
import { collectOperationalHealth } from '../../../lib/operational-health';
import {
  alertsFromOperationalHealth,
  evaluateOperationalAlerts,
} from '../../../lib/operational-alerts';

export const prerender = false;

/**
 * Operational health for the admin shell (`OBSERVABILITY.md` §4 item 4).
 *
 * Authentication is the middleware's, like every other `/api/admin/*` route.
 * Role access is the `ADMIN_API_ROUTES` table in `src/lib/auth.ts`, which lists
 * this route: owner and admin reach it, advertiser and customer_service get a
 * 403 that the component treats as "not yours to see" rather than an error.
 *
 * Counts, ages and states only. No order or customer payloads leave here.
 */
export const GET: APIRoute = async ({ locals }) => {
  const database = getRuntimeEnv(locals)?.OMS_DB as D1Database | undefined;
  if (!database?.prepare) {
    return jsonError('Database belum tersedia.', 503);
  }

  try {
    const health = await collectOperationalHealth(database, locals);
    const runtime = getRuntimeEnv(locals);
    const alerts = await evaluateOperationalAlerts(
      alertsFromOperationalHealth(health),
      {
        store: runtime?.SESSION as KVNamespace | undefined,
        webhookUrl: getEnvValue('OPS_ALERT_WEBHOOK_URL', runtime),
      },
    );
    return jsonOk({ health, alerts });
  } catch (error) {
    console.error('admin-health-get', error);
    return jsonError('Gagal membaca status operasional.', 502);
  }
};
