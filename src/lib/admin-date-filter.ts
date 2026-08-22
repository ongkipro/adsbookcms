export const ADMIN_DATE_FILTER_OPTIONS = [
  { value: "7d", label: "7 hari terakhir (Default)" },
  { value: "today", label: "Hari ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "30d", label: "30 hari terakhir" },
  { value: "this_month", label: "Bulan ini" },
  { value: "last_month", label: "Bulan lalu" },
  { value: "90d", label: "90 hari terakhir" },
  { value: "180d", label: "180 hari terakhir (Maks 6 bulan)" },
  { value: "all", label: "Semua waktu" },
] as const;

export type AdminDateFilter = (typeof ADMIN_DATE_FILTER_OPTIONS)[number]["value"];
export type AdminDateInterval = "hour" | "day";

/** An explicit start/end period, distinct from every named preset. */
export const ADMIN_CUSTOM_DATE_FILTER = "custom";
export type AdminCustomRange = { start: string; end: string };

/**
 * The order and shipping lists read whatever history the operator asks for.
 * The dashboard aggregates and charts every day in the period, so it caps
 * itself lower and passes its own number in.
 */
export const ADMIN_MAX_CUSTOM_RANGE_DAYS = 180;

export type AdminDateRangeResolution =
  | { ok: true; start: string; end: string; interval: AdminDateInterval }
  | { ok: false; reason: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True only for a real calendar date — `2026-02-31` is not one. */
export function isCalendarDate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function daysBetweenAdminDates(start: string, end: string) {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(end) - toUtc(start)) / 86_400_000);
}

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isAdminDateFilter(value: string): value is AdminDateFilter {
  return ADMIN_DATE_FILTER_OPTIONS.some((option) => option.value === value);
}
export function getAdminDateFilterLabel(value: string) {
  return (
    ADMIN_DATE_FILTER_OPTIONS.find((option) => option.value === value)?.label ??
    "7 hari terakhir (Default)"
  );
}

export function formatJakartaDate(value: Date) {
  return jakartaDateFormatter.format(value);
}

export function shiftAdminDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function resolveAdminDateRange(
  filter: AdminDateFilter,
  now = new Date(),
): { start: string; end: string; interval: AdminDateInterval } {
  const today = formatJakartaDate(now);

  if (filter === "all") return { start: "", end: "", interval: "day" };
  if (filter === "today")
    return { start: today, end: today, interval: "hour" };
  if (filter === "yesterday") {
    const yesterday = shiftAdminDate(today, -1);
    return { start: yesterday, end: yesterday, interval: "hour" };
  }
  if (filter === "30d")
    return {
      start: shiftAdminDate(today, -29),
      end: today,
      interval: "day",
    };
  if (filter === "90d")
    return {
      start: shiftAdminDate(today, -89),
      end: today,
      interval: "day",
    };
  if (filter === "180d")
    return {
      start: shiftAdminDate(today, -179),
      end: today,
      interval: "day",
    };
  if (filter === "this_month")
    return { start: `${today.slice(0, 8)}01`, end: today, interval: "day" };

  if (filter === "last_month") {
    const previousMonthEnd = shiftAdminDate(`${today.slice(0, 8)}01`, -1);
    return {
      start: `${previousMonthEnd.slice(0, 8)}01`,
      end: previousMonthEnd,
      interval: "day",
    };
  }

  // Default filter is 7d
  return {
    start: shiftAdminDate(today, -6),
    end: today,
    interval: "day",
  };
}

/**
 * Resolves any period, named or explicit, and says no rather than guessing.
 *
 * The callers used to hand `resolveAdminDateRange` an unvalidated string, so
 * anything it did not recognise — including `custom` — silently became the
 * 7-day default and was presented as the period the operator asked for
 * (REQ-157). This returns a refusal instead.
 */
export function resolveAdminDateSelection(
  filter: string,
  options: {
    customRange?: Partial<AdminCustomRange>;
    maxCustomRangeDays?: number;
    now?: Date;
  } = {},
): AdminDateRangeResolution {
  const now = options.now ?? new Date();

  if (filter !== ADMIN_CUSTOM_DATE_FILTER) {
    if (!isAdminDateFilter(filter)) {
      return { ok: false, reason: "Periode laporan tidak dikenal." };
    }
    return { ok: true, ...resolveAdminDateRange(filter, now) };
  }

  const start = (options.customRange?.start ?? "").trim();
  const end = (options.customRange?.end ?? "").trim();
  if (!isCalendarDate(start) || !isCalendarDate(end)) {
    return { ok: false, reason: "Tanggal mulai dan akhir wajib diisi lengkap." };
  }
  if (start > end) {
    return { ok: false, reason: "Tanggal mulai tidak boleh melewati tanggal akhir." };
  }

  const today = formatJakartaDate(now);
  if (end > today) {
    return { ok: false, reason: "Tanggal akhir tidak boleh di masa depan." };
  }

  const maxDays = options.maxCustomRangeDays ?? ADMIN_MAX_CUSTOM_RANGE_DAYS;
  // Inclusive: start and end on the same day is a one-day range.
  if (daysBetweenAdminDates(start, end) + 1 > maxDays) {
    return {
      ok: false,
      reason: `Rentang tanggal maksimal ${maxDays} hari.`,
    };
  }

  return {
    ok: true,
    start,
    end,
    // A single day is read hour by hour, matching the `today` preset.
    interval: start === end ? "hour" : "day",
  };
}

/**
 * One reader for the three routes that accept a period, so they cannot drift
 * on parameter names or on what counts as valid.
 */
export function parseAdminDateSelection(
  searchParams: URLSearchParams,
  options: { maxCustomRangeDays?: number; now?: Date } = {},
) {
  const filter = (searchParams.get("date_filter") || "all").trim().toLowerCase();
  return {
    filter,
    resolution: resolveAdminDateSelection(filter, {
      customRange: {
        start: searchParams.get("date_start") || "",
        end: searchParams.get("date_end") || "",
      },
      maxCustomRangeDays: options.maxCustomRangeDays,
      now: options.now,
    }),
  };
}

export function formatAdminDateRangeLabel(start: string, end: string) {
  const short = (value: string) => value.split("-").reverse().join("/");
  return start === end ? short(start) : `${short(start)} – ${short(end)}`;
}
