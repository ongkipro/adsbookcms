import * as React from "react";
import { Search, X, type LucideIcon } from "lucide-react";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
 *   - a choice is `FilterSelect`: the date filter's look (icon, value,
 *     chevron) and `items` always set, so the server-rendered trigger already
 *     reads "Semua status" instead of the raw value "all".
 *
 * `src/lib/admin-controls.test.ts` refuses the old per-call overrides.
 */
export function FilterBar({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-wrap items-end gap-3", className)} {...props} />;
}

const FIELD_WIDTH = {
  sm: "w-full sm:w-40",
  md: "w-full sm:w-48",
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

export type FilterOption<T extends string> = { value: T; label: string };

export function FilterSelect<T extends string>({
  id,
  icon: Icon,
  value,
  onValueChange,
  options,
}: {
  id: string;
  icon: LucideIcon;
  value: T;
  onValueChange: (value: T) => void;
  options: readonly FilterOption<T>[];
}) {
  const items = Object.fromEntries(options.map((option) => [option.value, option.label]));
  return (
    <Select items={items} value={value} onValueChange={(next) => onValueChange((next ?? options[0].value) as T)}>
      <SelectTrigger id={id} className="w-full">
        <Icon className="text-slate-400" aria-hidden="true" />
        <SelectValue className="min-w-0 flex-1 truncate text-left" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
