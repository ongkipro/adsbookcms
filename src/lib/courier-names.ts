/**
 * One display name per courier, whatever code a screen holds: the live
 * estimate says `lion`, `spx`, `JT`; a courier rule says `Lion`, `SPX`, `J&T`.
 * Screens printed `${code} · ${service}`, and Mengantar's estimate repeats the
 * code as the service, so operators read "JNE · JNE" and "lion · lion".
 */
const NAMES: Record<string, string> = {
  jne: "JNE",
  sicepat: "SiCepat",
  jt: "J&T Express",
  sap: "SAP Express",
  saplite: "SAP Lite",
  anteraja: "Anteraja",
  lion: "Lion Parcel",
  idexpress: "ID Express",
  paxel: "Paxel",
  pos: "Pos Indonesia",
  spx: "SPX Express",
  ninja: "Ninja Xpress",
  ico: "Kurir menyusul",
};

const key = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");

export function courierDisplayName(code: string | null | undefined) {
  if (!code) return "—";
  return NAMES[key(code)] ?? code;
}

/** "SiCepat", or "SiCepat · BEST" when the service names something more. */
export function courierServiceLabel(code: string | null | undefined, service?: string | null) {
  const name = courierDisplayName(code);
  if (!service || key(service) === key(code ?? "") || key(service) === key(name)) return name;
  return `${name} · ${service}`;
}
