import { CalendarDays, Clock } from "lucide-react";
import { availablePickupHours, pickupDayOptions } from "@/lib/mengantar-order";
import { FilterSelect } from "./filter-bar";

/**
 * Date and hour of a Mengantar pickup as two dropdowns (one-hour slots
 * 09.00–18.00 WIB, at least 90 minutes ahead; only bookable hours are listed).
 * Shared by the push dialog and the shipping page. FilterSelect is a Radix
 * dropdown, so it works inside the push dialog where a Base UI Select loses
 * its selection (see PaymentSwitchDialog).
 */
export function MengantarPickupFields({
  date,
  hour,
  onChange,
  idPrefix,
}: {
  date: string;
  hour: number;
  onChange: (next: { date: string; hour: number }) => void;
  idPrefix: string;
}) {
  const days = pickupDayOptions();
  const hours = availablePickupHours(date) as readonly number[];
  const changeDate = (next: string) => {
    const open = availablePickupHours(next) as readonly number[];
    onChange({ date: next, hour: open.includes(hour) ? hour : (open[0] ?? hour) });
  };
  const hourOptions = hours.map((value) => ({ value: String(value), label: `${String(value).padStart(2, "0")}.00 WIB` }));
  return (
    <div className="grid min-w-0 grid-cols-2 gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-date`} className="text-sm font-medium">Tanggal pickup</label>
        <FilterSelect id={`${idPrefix}-date`} icon={CalendarDays} value={date} options={days} onValueChange={changeDate} />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-hour`} className="text-sm font-medium">Jam pickup</label>
        <FilterSelect
          id={`${idPrefix}-hour`}
          icon={Clock}
          value={String(hours.includes(hour) ? hour : (hours[0] ?? hour))}
          options={hourOptions.length ? hourOptions : [{ value: String(hour), label: "Tidak ada jam" }]}
          onValueChange={(value) => onChange({ date, hour: Number(value) })}
          disabled={!hourOptions.length}
        />
      </div>
    </div>
  );
}
