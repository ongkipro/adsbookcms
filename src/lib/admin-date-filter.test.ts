import assert from "node:assert/strict";
import test from "node:test";
import {
  formatJakartaDate,
  isAdminDateFilter,
  resolveAdminDateRange,
} from "./admin-date-filter.ts";

const jakartaTuesday = new Date("2026-08-10T17:30:00.000Z");

test("date presets use Jakarta calendar boundaries and inclusive day counts", () => {
  assert.equal(formatJakartaDate(jakartaTuesday), "2026-08-11");
  assert.deepEqual(resolveAdminDateRange("today", jakartaTuesday), {
    start: "2026-08-11",
    end: "2026-08-11",
    interval: "hour",
  });
  assert.deepEqual(resolveAdminDateRange("yesterday", jakartaTuesday), {
    start: "2026-08-10",
    end: "2026-08-10",
    interval: "hour",
  });
  assert.deepEqual(resolveAdminDateRange("7d", jakartaTuesday), {
    start: "2026-08-05",
    end: "2026-08-11",
    interval: "day",
  });
  assert.deepEqual(resolveAdminDateRange("30d", jakartaTuesday), {
    start: "2026-07-13",
    end: "2026-08-11",
    interval: "day",
  });
});

test("month presets and all-time range are stable across year boundaries", () => {
  const january = new Date("2026-01-15T03:00:00.000Z");
  assert.deepEqual(resolveAdminDateRange("all", january), {
    start: "",
    end: "",
    interval: "day",
  });
  assert.deepEqual(resolveAdminDateRange("this_month", january), {
    start: "2026-01-01",
    end: "2026-01-15",
    interval: "day",
  });
  assert.deepEqual(resolveAdminDateRange("last_month", january), {
    start: "2025-12-01",
    end: "2025-12-31",
    interval: "day",
  });
});

test("only supported date-filter values pass validation", () => {
  assert.equal(isAdminDateFilter("all"), true);
  assert.equal(isAdminDateFilter("7d"), true);
  assert.equal(isAdminDateFilter("custom"), false);
  assert.equal(isAdminDateFilter("week"), false);
});
