import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { availablePickupHours, defaultPickupSlot, MENGANTAR_PICKUP_HOURS } from "@/lib/mengantar-order";

/**
 * Date and hour of a Mengantar pickup (one-hour slots 09.00–18.00 WIB, at
 * least 90 minutes ahead). Shared by the push dialog and the shipping page.
 * Hours are buttons, not a Select: a Base UI Select portalled out of a Radix
 * dialog loses its selection (see PaymentSwitchDialog).
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
  const open = availablePickupHours(date) as readonly number[];
  const changeDate = (next: string) => {
    const hours = availablePickupHours(next) as readonly number[];
    onChange({ date: next, hour: hours.includes(hour) ? hour : (hours[0] ?? hour) });
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-date`} className="text-sm font-medium">Tanggal pickup</label>
        <Input id={`${idPrefix}-date`} type="date" value={date} min={defaultPickupSlot().date} onChange={(event) => changeDate(event.target.value)} required />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <span id={`${idPrefix}-hour`} className="text-sm font-medium">Jam pickup (WIB)</span>
        <div role="group" aria-labelledby={`${idPrefix}-hour`} className="grid grid-cols-5 gap-1.5">
          {MENGANTAR_PICKUP_HOURS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={value === hour && open.includes(value) ? "default" : "outline"}
              aria-pressed={value === hour && open.includes(value)}
              disabled={!open.includes(value)}
              onClick={() => onChange({ date, hour: value })}
            >
              {String(value).padStart(2, "0")}.00
            </Button>
          ))}
        </div>
        {open.length === 0 && <p className="text-xs text-muted-foreground">Tidak ada jam tersisa di tanggal ini; pilih tanggal lain.</p>}
      </div>
    </div>
  );
}
