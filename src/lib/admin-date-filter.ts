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
