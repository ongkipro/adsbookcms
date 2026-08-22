import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import {
  ADMIN_CUSTOM_DATE_FILTER,
  ADMIN_DATE_FILTER_OPTIONS,
  ADMIN_MAX_CUSTOM_RANGE_DAYS,
  formatAdminDateRangeLabel,
  formatJakartaDate,
  getAdminDateFilterLabel,
  resolveAdminDateSelection,
  shiftAdminDate,
} from "../../lib/admin-date-filter";

export type AdminDateSelection = {
  filter: string;
  start: string;
  end: string;
};

type Props = {
  value: AdminDateSelection;
  onChange: (value: AdminDateSelection) => void;
  disabled?: boolean;
  /** Presets this surface does not offer, e.g. the dashboard hides 90d/180d. */
  hiddenPresets?: readonly string[];
  /** Longest custom range this surface can answer for. */
  maxCustomRangeDays?: number;
  className?: string;
};

export function adminDateSelectionLabel(value: AdminDateSelection) {
  if (value.filter !== ADMIN_CUSTOM_DATE_FILTER) {
    return getAdminDateFilterLabel(value.filter);
  }
  return value.start && value.end
    ? formatAdminDateRangeLabel(value.start, value.end)
    : "Rentang tanggal";
}

export function AdminDateRangeFilter({
  value,
  onChange,
  disabled = false,
  hiddenPresets = [],
  maxCustomRangeDays = ADMIN_MAX_CUSTOM_RANGE_DAYS,
  className = "",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [draftStart, setDraftStart] = React.useState(value.start);
  const [draftEnd, setDraftEnd] = React.useState(value.end);

  // Reopening should show what is actually in force, not a stale draft.
  React.useEffect(() => {
    if (open) {
      setDraftStart(value.start);
      setDraftEnd(value.end);
    }
  }, [open, value.start, value.end]);

  const today = formatJakartaDate(new Date());
  const presets = ADMIN_DATE_FILTER_OPTIONS.filter(
    (option) => !hiddenPresets.includes(option.value),
  );

  // The cap is expressed in the inputs themselves, so an out-of-range date
  // cannot be picked in the first place (REQ-156).
  const earliestStart = shiftAdminDate(today, -(maxCustomRangeDays - 1));
  const latestEnd = draftStart
    ? [shiftAdminDate(draftStart, maxCustomRangeDays - 1), today].sort()[0]
    : today;

  const draft = resolveAdminDateSelection(ADMIN_CUSTOM_DATE_FILTER, {
    customRange: { start: draftStart, end: draftEnd },
    maxCustomRangeDays,
  });

  const choosePreset = (filter: string) => {
    onChange({ filter, start: "", end: "" });
    setOpen(false);
  };

  const applyCustom = () => {
    if (!draft.ok) return;
    onChange({
      filter: ADMIN_CUSTOM_DATE_FILTER,
      start: draftStart,
      end: draftEnd,
    });
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className={`flex h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-900 shadow-none transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        >
          <CalendarDays className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            {adminDateSelectionLabel(value)}
          </span>
          <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(30rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-[11rem_1fr]">
          <div className="max-h-64 overflow-y-auto border-b border-slate-200 p-1.5 sm:max-h-none sm:border-b-0 sm:border-r">
            {presets.map((option) => {
              const active = value.filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => choosePreset(option.value)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition hover:bg-slate-100 ${
                    active ? "bg-slate-100 font-bold text-slate-900" : "text-slate-700"
                  }`}
                >
                  <Check
                    className={`size-3.5 shrink-0 ${active ? "opacity-100" : "opacity-0"}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2.5 p-3">
            <p className="text-xs font-bold text-slate-900">Rentang tanggal</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="grid grid-cols-1 gap-1">
                <span className="text-[11px] font-bold text-slate-600">Mulai</span>
                <input
                  type="date"
                  value={draftStart}
                  min={earliestStart}
                  max={draftEnd || today}
                  onChange={(event) => setDraftStart(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900"
                />
              </label>
              <label className="grid grid-cols-1 gap-1">
                <span className="text-[11px] font-bold text-slate-600">Akhir</span>
                <input
                  type="date"
                  value={draftEnd}
                  min={draftStart || undefined}
                  max={latestEnd}
                  onChange={(event) => setDraftEnd(event.target.value)}
                  className="h-10 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-900"
                />
              </label>
            </div>
            <p
              className={`text-[11px] ${draft.ok || !draftStart || !draftEnd ? "text-slate-500" : "text-red-600"}`}
              role={draft.ok ? undefined : "alert"}
            >
              {!draftStart || !draftEnd
                ? `Maksimal ${maxCustomRangeDays} hari, waktu Jakarta (WIB).`
                : draft.ok
                  ? formatAdminDateRangeLabel(draftStart, draftEnd)
                  : draft.reason}
            </p>
            <Button
              type="button"
              onClick={applyCustom}
              disabled={!draft.ok}
              className="h-10 w-full text-xs"
            >
              Terapkan rentang
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
