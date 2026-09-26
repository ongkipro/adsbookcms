import { cn } from "@/lib/utils";

// The product's neutral mark (tenant.ts default logo). It is a 4:1 wordmark,
// unreadable in the square the sidebar and phone top bar give a logo, so a
// store without its own logo shows its initial instead.
const PRODUCT_MARK = "/images/adsbook-mark.webp";

export function StoreMark({ logo, name, className }: { logo?: string; name: string; className?: string }) {
  if (logo && logo !== PRODUCT_MARK) {
    return <img src={logo} alt={name} className={cn("shrink-0 object-contain", className)} />;
  }
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-lg bg-slate-900 text-sm font-semibold text-white", className)}>
      {(name.trim()[0] || "A").toUpperCase()}
    </span>
  );
}
