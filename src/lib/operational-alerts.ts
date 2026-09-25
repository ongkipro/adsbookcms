import type { OperationalHealth } from "./operational-health.ts";
import {
  statusFromSchemaError,
  type SchemaUpgradeError,
} from "./schema-version.ts";

export type OperationalAlertId = "schema" | "capi-outbox" | "google-ads-outbox";
export type OperationalAlertState = "healthy" | "firing" | "unknown";

export type OperationalAlertSignal = {
  id: OperationalAlertId;
  state: OperationalAlertState;
  reason: string;
};

export type OperationalAlertEvent = {
  version: 1;
  eventId: string;
  status: "firing" | "recovered";
  signal: OperationalAlertId;
  reason: string;
  transitionAt: string;
};

export type AlertEvaluation = {
  id: OperationalAlertId;
  state: OperationalAlertState;
  reason: string;
  transition:
    | "triggered"
    | "recovered"
    | "deduplicated"
    | "unchanged"
    | "unknown";
  notification: "sent" | "failed" | "disabled" | "not-needed";
  statePersisted: boolean;
};

export type AlertStateStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
};

type StoredAlertState = {
  state: "healthy" | "firing";
  reason: string;
  transitionAt: string;
  notification: "pending" | "sent" | "disabled";
};

type AlertLogger = Pick<Console, "error" | "info">;

type EvaluateOptions = {
  store?: AlertStateStore;
  webhookUrl?: string;
  notify?: (event: OperationalAlertEvent) => Promise<void>;
  now?: () => string;
  logger?: AlertLogger;
};

const ALERT_STATE_PREFIX = "adsbookcms:operational-alert:v1:";

function alertKey(id: OperationalAlertId) {
  return `${ALERT_STATE_PREFIX}${id}`;
}

function parseStoredState(value: string | null): StoredAlertState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredAlertState>;
    if (
      (parsed.state === "healthy" || parsed.state === "firing") &&
      typeof parsed.reason === "string" &&
      typeof parsed.transitionAt === "string" &&
      (parsed.notification === "pending" ||
        parsed.notification === "sent" ||
        parsed.notification === "disabled")
    ) {
      return parsed as StoredAlertState;
    }
  } catch {
    // Invalid state is treated as absent. It contains no authoritative business
    // data, and refusing to evaluate would hide the operational fault.
  }
  return null;
}

async function postAlertWebhook(
  webhookUrl: string,
  event: OperationalAlertEvent,
) {
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error("invalid alert webhook URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("alert webhook must use https");
  }

  // Bounded: during a schema outage this runs on the request path, and a
  // hanging webhook must not hang the storefront's 503 with it.
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("alert webhook rejected notification");
}

export function alertsFromOperationalHealth(
  health: OperationalHealth,
): OperationalAlertSignal[] {
  const schemaState = health.build.schemaState;
  const schema: OperationalAlertSignal =
    schemaState === "match"
      ? { id: "schema", state: "healthy", reason: "match" }
      : {
          id: "schema",
          state: "firing",
          reason: `schema-${schemaState}`,
        };

  // Both conversion queues alert the same way. Google's used to reach only the
  // health panel, which is how A-182's head-of-line block went unnoticed.
  const queue = (id: "capi-outbox" | "google-ads-outbox"): OperationalAlertSignal => {
    const signal = health.signals.find((candidate) => candidate.id === id);
    if (!signal) return { id, state: "unknown", reason: "unreadable" };
    if (signal.state === "degraded") return { id, state: "firing", reason: signal.reason };
    if (signal.state === "healthy") return { id, state: "healthy", reason: signal.reason };
    return { id, state: "unknown", reason: signal.reason };
  };

  return [schema, queue("capi-outbox"), queue("google-ads-outbox")];
}

export function schemaAlertFromError(
  error: SchemaUpgradeError | unknown,
): OperationalAlertSignal {
  const status = statusFromSchemaError(error);
  return {
    id: "schema",
    state: "firing",
    reason: `schema-${status.state}`,
  };
}

async function readState(
  store: AlertStateStore | undefined,
  id: OperationalAlertId,
  logger: AlertLogger,
) {
  if (!store) return { state: null, persisted: false };
  try {
    return {
      state: parseStoredState(await store.get(alertKey(id))),
      persisted: true,
    };
  } catch {
    logger.error("operational-alert-state-read-failed", { signal: id });
    return { state: null, persisted: false };
  }
}

async function writeState(
  store: AlertStateStore | undefined,
  id: OperationalAlertId,
  state: StoredAlertState,
  logger: AlertLogger,
) {
  if (!store) return false;
  try {
    await store.put(alertKey(id), JSON.stringify(state));
    return true;
  } catch {
    logger.error("operational-alert-state-write-failed", { signal: id });
    return false;
  }
}

async function evaluateSignal(
  signal: OperationalAlertSignal,
  options: EvaluateOptions,
): Promise<AlertEvaluation> {
  const logger = options.logger ?? console;
  const stored = await readState(options.store, signal.id, logger);
  const previous = stored.state;

  if (signal.state === "unknown") {
    return {
      ...signal,
      transition: "unknown",
      notification: "not-needed",
      statePersisted: stored.persisted,
    };
  }

  if (signal.state === "healthy" && previous?.state !== "firing") {
    return {
      ...signal,
      transition: "unchanged",
      notification: "not-needed",
      statePersisted: stored.persisted,
    };
  }

  const isRecovery = signal.state === "healthy";
  const repeated =
    !isRecovery &&
    previous?.state === "firing" &&
    previous.reason === signal.reason;
  const transitionAt = repeated
    ? previous.transitionAt
    : (options.now ?? (() => new Date().toISOString()))();
  const event: OperationalAlertEvent = {
    version: 1,
    eventId: `${signal.id}:${isRecovery ? "recovered" : "firing"}:${transitionAt}`,
    status: isRecovery ? "recovered" : "firing",
    signal: signal.id,
    reason: isRecovery ? `recovered-from-${previous?.reason ?? "unknown"}` : signal.reason,
    transitionAt,
  };
  const notifier = options.notify
    ? options.notify
    : options.webhookUrl
      ? (payload: OperationalAlertEvent) =>
          postAlertWebhook(options.webhookUrl as string, payload)
      : null;

  if (repeated && previous.notification !== "pending") {
    return {
      ...signal,
      transition: "deduplicated",
      notification:
        previous.notification === "sent" ? "sent" : "disabled",
      statePersisted: stored.persisted,
    };
  }

  const pendingState: StoredAlertState = {
    state: signal.state,
    reason: signal.reason,
    transitionAt,
    notification: notifier ? "pending" : "disabled",
  };
  // A repeat that is still pending already holds exactly this state. Writing
  // it again made every request during a schema outage a KV write — the
  // account-wide allowance ADR-021 exists to protect.
  let statePersisted = repeated
    ? stored.persisted
    : await writeState(options.store, signal.id, pendingState, logger);

  if (!repeated) {
    if (isRecovery) {
      logger.info("operational-alert-recovered", {
        signal: signal.id,
        reason: event.reason,
      });
    } else {
      logger.error("operational-alert-firing", {
        signal: signal.id,
        reason: signal.reason,
      });
    }
  }

  if (!notifier) {
    return {
      ...signal,
      transition: isRecovery ? "recovered" : repeated ? "deduplicated" : "triggered",
      notification: "disabled",
      statePersisted,
    };
  }

  try {
    await notifier(event);
    statePersisted =
      (await writeState(
        options.store,
        signal.id,
        { ...pendingState, notification: "sent" },
        logger,
      )) && statePersisted;
    return {
      ...signal,
      transition: isRecovery ? "recovered" : repeated ? "deduplicated" : "triggered",
      notification: "sent",
      statePersisted,
    };
  } catch {
    logger.error("operational-alert-notification-failed", {
      signal: signal.id,
      status: event.status,
    });
    return {
      ...signal,
      transition: isRecovery ? "recovered" : repeated ? "deduplicated" : "triggered",
      notification: "failed",
      statePersisted,
    };
  }
}

/**
 * Evaluates only redacted bounded signal state. KV keeps transitions per install
 * and the optional HTTPS webhook URL stays in the install's Worker environment.
 */
export async function evaluateOperationalAlerts(
  signals: readonly OperationalAlertSignal[],
  options: EvaluateOptions = {},
): Promise<AlertEvaluation[]> {
  const results: AlertEvaluation[] = [];
  for (const signal of signals) {
    results.push(await evaluateSignal(signal, options));
  }
  return results;
}
