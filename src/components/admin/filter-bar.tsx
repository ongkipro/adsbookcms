import * as React from "react";
import { ChevronDown, Search, X, type LucideIcon } from "lucide-react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The one pattern for an admin toolbar of filters. Every filter row used to
 * hand-size its controls (h-7 … h-11, fixed w-[140px] columns, its own label
 * style), so rows overlapped at some widths and no two screens matched. Here:
 *
 *   - controls come from the shadcn primitives at their default size — never
 *     pass height, radius, background or text size to them;
 *   - a field has one label style and a width from `size`, and the row wraps
 *     instead of overlapping;
 *   - search is `SearchInput`, not an icon positioned over an <Input>;
 *   - a choice is `FilterSelect`, the same DropdownMenu as the date filter
 *     (one trigger class, `FILTER_TRIGGER_CLASS`), with a radio group: the
 *     trigger renders the chosen label itself, so it never shows "all".
 *
 * `src/lib/admin-controls.test.ts` refuses the old per-call overrides.
 */
export function FilterBar({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-end gap-3", className)} {...props} />;
}

// Below sm a fixed-width field takes half the row (gap-3 = 0.75rem), so four
// filters are two rows on a phone instead of a screen of stacked selects.
const FIELD_WIDTH = {
  sm: "w-[calc(50%-0.375rem)] sm:w-44",
  md: "w-[calc(50%-0.375rem)] sm:w-48",
  lg: "w-full sm:w-64",
  grow: "w-full min-w-56 sm:flex-1",
} as const;

export function FilterField({
  label,
  htmlFor,
  size = "md",
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  size?: keyof typeof FIELD_WIDTH;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // gap, not space-y: Base UI's Select renders a hidden input last, which
    // space-y's :not(:last-child) margin would push the trigger off baseline.
    <div className={cn("flex flex-col gap-1.5", FIELD_WIDTH[size], className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <InputGroup className={cn("bg-white", className)}>
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput type="search" value={value} onChange={(event) => onValueChange(event.target.value)} {...props} />
      {value && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Kosongkan pencarian" onClick={() => onValueChange("")}>
            <X aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

/** One trigger look for every toolbar menu — the date filter and FilterSelect. */
export const FILTER_TRIGGER_CLASS =
  "flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-white px-2.5 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 data-[state=open]:bg-slate-50";

export type FilterOption<T extends string> = { value: T; label: string };

export function FilterSelect<T extends string>({
  id,
  icon: Icon,
  value,
  onValueChange,
  options,
  ariaLabel,
  disabled,
}: {
  disabled?: boolean;
  id: string;
  /** For a filter shown without a visible <label>. */
  ariaLabel?: string;
  icon: LucideIcon;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly FilterOption<T>[];
}) {
  const current = options.find((option) => option.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button id={id} type="button" disabled={disabled} aria-label={ariaLabel ? `${ariaLabel}: ${current?.label ?? ""}` : undefined} className={FILTER_TRIGGER_CLASS}>
          <Icon className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{current?.label}</span>
          <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-(--radix-dropdown-menu-trigger-width)">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onValueChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
