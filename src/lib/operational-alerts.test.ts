import assert from "node:assert/strict";
import test from "node:test";
import {
  alertsFromOperationalHealth,
  evaluateOperationalAlerts,
  schemaAlertFromError,
  type AlertStateStore,
  type OperationalAlertEvent,
  type OperationalAlertSignal,
} from "./operational-alerts.ts";
import type { OperationalHealth } from "./operational-health.ts";
import { SchemaUpgradeError } from "./schema-version.ts";

class MemoryAlertStore implements AlertStateStore {
  readonly values = new Map<string, string>();
  writes = 0;

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string) {
    this.writes += 1;
    this.values.set(key, value);
  }
}

function recordingLogger() {
  const errors: unknown[][] = [];
  const info: unknown[][] = [];
  return {
    errors,
    info,
    logger: {
      error: (...values: unknown[]) => errors.push(values),
      info: (...values: unknown[]) => info.push(values),
    } as Pick<Console, "error" | "info">,
  };
}

const firing: OperationalAlertSignal = {
  id: "capi-outbox",
  state: "firing",
  reason: "terminal-failures",
};
const healthy: OperationalAlertSignal = {
  id: "capi-outbox",
  state: "healthy",
  reason: "empty",
};

test("healthy state emits no alert noise", async () => {
  const store = new MemoryAlertStore();
  const log = recordingLogger();
  let notifications = 0;

  const result = await evaluateOperationalAlerts([healthy], {
    store,
    logger: log.logger,
    notify: async () => {
      notifications += 1;
    },
  });

  assert.equal(result[0].transition, "unchanged");
  assert.equal(result[0].notification, "not-needed");
  assert.equal(store.writes, 0);
  assert.equal(notifications, 0);
  assert.equal(log.errors.length, 0);
  assert.equal(log.info.length, 0);
});

test("a firing outbox alert is persisted and deduplicated", async () => {
  const store = new MemoryAlertStore();
  const log = recordingLogger();
  const events: OperationalAlertEvent[] = [];
  const options = {
    store,
    logger: log.logger,
    now: () => "2026-08-17T10:00:00.000Z",
    notify: async (event: OperationalAlertEvent) => {
      events.push(event);
    },
  };

  const first = await evaluateOperationalAlerts([firing], options);
  const duplicate = await evaluateOperationalAlerts([firing], options);

  assert.equal(first[0].transition, "triggered");
  assert.equal(first[0].notification, "sent");
  assert.equal(duplicate[0].transition, "deduplicated");
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0]).sort(), [
    "eventId",
    "reason",
    "signal",
    "status",
    "transitionAt",
    "version",
  ]);
  assert.equal(log.errors.filter((entry) => entry[0] === "operational-alert-firing").length, 1);
});

test("recovery is emitted once and later healthy evaluations stay quiet", async () => {
  const store = new MemoryAlertStore();
  const log = recordingLogger();
  const events: OperationalAlertEvent[] = [];
  let tick = 0;
  const options = {
    store,
    logger: log.logger,
    now: () => `2026-08-17T10:0${tick++}:00.000Z`,
    notify: async (event: OperationalAlertEvent) => {
      events.push(event);
    },
  };

  await evaluateOperationalAlerts([firing], options);
  const recovery = await evaluateOperationalAlerts([healthy], options);
  const quiet = await evaluateOperationalAlerts([healthy], options);

  assert.equal(recovery[0].transition, "recovered");
  assert.equal(quiet[0].transition, "unchanged");
  assert.deepEqual(events.map((event) => event.status), ["firing", "recovered"]);
  assert.equal(log.info.length, 1);
});

test("notification failure keeps the firing state visible and retries one event id", async () => {
  const store = new MemoryAlertStore();
  const log = recordingLogger();
  const eventIds: string[] = [];
  let attempts = 0;
  const options = {
    store,
    logger: log.logger,
    now: () => "2026-08-17T11:00:00.000Z",
    notify: async (event: OperationalAlertEvent) => {
      attempts += 1;
      eventIds.push(event.eventId);
      if (attempts === 1) throw new Error("sink unavailable");
    },
  };

  const failed = await evaluateOperationalAlerts([firing], options);
  const retried = await evaluateOperationalAlerts([firing], options);

  assert.equal(failed[0].state, "firing");
  assert.equal(failed[0].notification, "failed");
  assert.equal(failed[0].statePersisted, true);
  assert.equal(retried[0].transition, "deduplicated");
  assert.equal(retried[0].notification, "sent");
  assert.equal(attempts, 2);
  assert.equal(eventIds[0], eventIds[1]);
  assert.equal(
    log.errors.some(
      (entry) => entry[0] === "operational-alert-notification-failed",
    ),
    true,
  );
});

test("health and schema failures map only to bounded redacted alert state", () => {
  const health: OperationalHealth = {
    checkedAt: "2026-08-17T12:00:00.000Z",
    overall: "degraded",
    signals: [
      {
        id: "capi-outbox",
        state: "degraded",
        reason: "stalled",
        lastAt: "2026-08-17T10:00:00.000Z",
        ageMinutes: 120,
        metrics: { pending: 4, failed: 0, overdue: 4 },
      },
    ],
    build: {
      version: "test",
      releaseTag: "test",
      expectedSchemaVersion: 40,
      appliedSchemaVersion: 39,
      schemaState: "database-behind",
    },
  };

  assert.deepEqual(alertsFromOperationalHealth(health), [
    { id: "schema", state: "firing", reason: "schema-database-behind" },
    { id: "capi-outbox", state: "firing", reason: "stalled" },
  ]);
  assert.deepEqual(
    schemaAlertFromError(
      new SchemaUpgradeError(
        "SCHEMA_UPGRADE_APPLY_FAILED",
        40,
        39,
        "0039_runtime_storefront_templates.sql",
      ),
    ),
    { id: "schema", state: "firing", reason: "schema-upgrade-failed" },
  );
});
