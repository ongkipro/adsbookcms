import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAutoLaris,
  classifyCapiDelivery,
  classifyCapiOutbox,
  classifyMengantar,
  summarizeHealth,
  type HealthSignal,
} from "./operational-health.ts";

const NOW = Date.parse("2026-08-16T12:00:00.000Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW - minutes * 60_000).toISOString();

test("an empty outbox owes Meta nothing", () => {
  const health = classifyCapiOutbox(
    { pending: 0, failed: 0, overdue: 0, oldestCreatedAt: null },
    NOW,
  );
  assert.equal(health.state, "healthy");
  assert.equal(health.reason, "empty");
});

test("a backlog still inside its backoff is draining, not stalled", () => {
  const health = classifyCapiOutbox(
    { pending: 3, failed: 0, overdue: 0, oldestCreatedAt: minutesAgo(5) },
    NOW,
  );
  assert.equal(health.state, "healthy");
  assert.equal(health.reason, "draining");
  assert.equal(health.ageMinutes, 5);
});

test("events past every retry window and still due mean the drain stopped", () => {
  const health = classifyCapiOutbox(
    { pending: 12, failed: 0, overdue: 12, oldestCreatedAt: minutesAgo(180) },
    NOW,
  );
  assert.equal(health.state, "degraded");
  assert.equal(health.reason, "stalled");
  assert.equal(health.metrics.overdue, 12);
});

test("an old backlog that is not yet due is not called stalled", () => {
  // Age alone must not raise the alarm: a rate-limited event legitimately waits.
  const health = classifyCapiOutbox(
    { pending: 4, failed: 0, overdue: 0, oldestCreatedAt: minutesAgo(600) },
    NOW,
  );
  assert.equal(health.state, "healthy");
});

test("terminally failed conversions are degraded even when nothing is pending", () => {
  const health = classifyCapiOutbox(
    { pending: 0, failed: 2, overdue: 0, oldestCreatedAt: minutesAgo(90) },
    NOW,
  );
  assert.equal(health.state, "degraded");
  assert.equal(health.reason, "terminal-failures");
});

test("an unreadable outbox is unknown, never a depth of zero", () => {
  const health = classifyCapiOutbox(null, NOW);
  assert.equal(health.state, "unknown");
  assert.equal(health.reason, "unreadable");
  assert.deepEqual(health.metrics, {});
});

test("a pipeline nobody has used is unknown, not degraded", () => {
  const health = classifyCapiDelivery(
    { rowsScanned: 0, lastDeliveredAt: null, lastFailedAt: null },
    NOW,
  );
  assert.equal(health.state, "unknown");
  assert.equal(health.reason, "never-enqueued");
});

test("events that only ever failed are degraded", () => {
  const health = classifyCapiDelivery(
    { rowsScanned: 6, lastDeliveredAt: null, lastFailedAt: minutesAgo(20) },
    NOW,
  );
  assert.equal(health.state, "degraded");
  assert.equal(health.reason, "never-delivered");
});

test("a failure newer than the last delivery flips CAPI to degraded", () => {
  const health = classifyCapiDelivery(
    {
      rowsScanned: 40,
      lastDeliveredAt: minutesAgo(120),
      lastFailedAt: minutesAgo(5),
    },
    NOW,
  );
  assert.equal(health.state, "degraded");
  assert.equal(health.reason, "failing");
  assert.equal(health.ageMinutes, 120, "still reports the last real delivery");
});

test("a delivery newer than the last failure is healthy", () => {
  const health = classifyCapiDelivery(
    {
      rowsScanned: 40,
      lastDeliveredAt: minutesAgo(2),
      lastFailedAt: minutesAgo(300),
    },
    NOW,
  );
  assert.equal(health.state, "healthy");
  assert.equal(health.reason, "delivered");
});

test("a store with no orders cannot say anything about Mengantar", () => {
  const health = classifyMengantar(
    { rowsScanned: 0, lastDispatchedAt: null, failedInWindow: 0 },
    NOW,
  );
  assert.equal(health.state, "unknown");
  assert.equal(health.reason, "no-orders");
});

test("orders nobody has released yet are unknown, not a courier outage", () => {
  const health = classifyMengantar(
    { rowsScanned: 30, lastDispatchedAt: null, failedInWindow: 0 },
    NOW,
  );
  assert.equal(health.state, "unknown");
  assert.equal(health.reason, "never-dispatched");
});

test("recorded dispatch attempts with no success at all are degraded", () => {
  const health = classifyMengantar(
    { rowsScanned: 30, lastDispatchedAt: null, failedInWindow: 7 },
    NOW,
  );
  assert.equal(health.state, "degraded");
  assert.equal(health.reason, "all-attempts-failed");
  assert.equal(health.metrics.failedInWindow, 7);
});

test("an accepted dispatch is healthy and reports its age", () => {
  const health = classifyMengantar(
    { rowsScanned: 30, lastDispatchedAt: minutesAgo(45), failedInWindow: 2 },
    NOW,
  );
  assert.equal(health.state, "healthy");
  assert.equal(health.ageMinutes, 45);
});

test("a store that has never taken a gateway payment is unknown", () => {
  const health = classifyAutoLaris(
    {
      rowsScanned: 0,
      lastOutboundAt: null,
      lastManualConfirmationAt: null,
      failedInWindow: 0,
    },
    NOW,
  );
  assert.equal(health.state, "unknown");
  assert.equal(health.reason, "never-used");
});

test("payments created but not yet paid is nobody paid today, not an outage", () => {
  const health = classifyAutoLaris(
    {
      rowsScanned: 9,
      lastOutboundAt: minutesAgo(10),
      lastManualConfirmationAt: null,
      failedInWindow: 0,
    },
    NOW,
  );
  assert.equal(health.state, "unknown");
  assert.equal(health.reason, "awaiting-first-manual-confirmation");
  assert.equal(health.ageMinutes, 10, "outbound contact is still reported");
});

test("create-payment calls that all failed are degraded", () => {
  const health = classifyAutoLaris(
    {
      rowsScanned: 9,
      lastOutboundAt: null,
      lastManualConfirmationAt: null,
      failedInWindow: 9,
    },
    NOW,
  );
  assert.equal(health.state, "degraded");
  assert.equal(health.reason, "create-failing");
});

test("an audited manual confirmation reports the last verified payment", () => {
  const health = classifyAutoLaris(
    {
      rowsScanned: 9,
      lastOutboundAt: minutesAgo(90),
      lastManualConfirmationAt: minutesAgo(3),
      failedInWindow: 1,
    },
    NOW,
  );
  assert.equal(health.state, "healthy");
  assert.equal(health.reason, "manually-confirmed");
  assert.equal(health.ageMinutes, 3);
});

test("a fault is louder than a blank when the panel is summarised", () => {
  const of = (state: HealthSignal["state"]): HealthSignal => ({
    id: "meta-capi",
    state,
    reason: "test",
    lastAt: null,
    ageMinutes: null,
    metrics: {},
  });
  assert.equal(summarizeHealth([of("healthy"), of("healthy")]), "healthy");
  assert.equal(summarizeHealth([of("healthy"), of("unknown")]), "unknown");
  assert.equal(
    summarizeHealth([of("unknown"), of("degraded"), of("healthy")]),
    "degraded",
  );
});
