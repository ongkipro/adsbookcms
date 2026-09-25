import * as React from "react";

import { DistrictCombobox, type DistrictOption } from "@/components/admin/DistrictCombobox";
import { groupLocationResults } from "@/lib/location-search";

export type WarehouseOrigin = { id: string; label: string; city: string; province: string };

type OriginRow = {
  id: string;
  label: string;
  district: string;
  subdistrict_name: string;
  city: string;
  province: string;
  postal_code: string;
};

type LocationRow = {
  id?: string;
  location_id?: string;
  label?: string;
  district?: string;
  district_name?: string;
  subdistrict_name?: string;
  city?: string;
  city_name?: string;
  province?: string;
  province_name?: string;
  postal_code?: string;
};

/**
 * The warehouse settings page is static Astro; only its origin search needs to
 * be interactive, so this is the one island on it. A pick is handed back as a
 * `warehouse-origin` window event, which the page's own script turns into the
 * pinned origin and the hidden form fields it already saves.
 */
export default function WarehouseOriginPicker() {
  const rows = React.useRef(new Map<string, WarehouseOrigin>());
  const [value, setValue] = React.useState<DistrictOption | null>(null);

  const search = React.useCallback(async (query: string, signal: AbortSignal) => {
    const response = await fetch(`/api/locations?search=${encodeURIComponent(query)}`, { signal });
    const payload = await response.json().catch(() => ({}));
    const items: OriginRow[] = (Array.isArray(payload?.items) ? payload.items : []).map((item: LocationRow) => ({
      id: String(item.id || item.location_id || ""),
      label: String(item.label || ""),
      district: String(item.district_name || item.district || item.subdistrict_name || ""),
      subdistrict_name: String(item.subdistrict_name || ""),
      city: String(item.city_name || item.city || ""),
      province: String(item.province_name || item.province || ""),
      postal_code: String(item.postal_code || ""),
    }));
    // Without a Mengantar key the search answers from the local district
    // list, which carries no Mengantar area id; pinning one would save an
    // empty origin. Say what to do instead of listing unusable rows.
    if (items.length && items.every((item) => !item.id)) {
      throw new Error("Kecamatan ditemukan, tetapi ID area Mengantar belum bisa diambil. Simpan API key Mengantar di menu Profil dulu, lalu cari lagi.");
    }
    return groupLocationResults(items.filter((item) => item.id)).flatMap((group) =>
      group.items.map((item) => {
        rows.current.set(item.id, { id: item.id, label: item.label, city: item.city, province: item.province });
        const place = item.subdistrict_name && group.items.length > 1 ? item.subdistrict_name : group.district;
        return {
          id: item.id,
          label: item.label,
          detail: `${place === group.district ? "" : `Kecamatan ${group.district} · `}${group.city}, ${group.province}${item.postal_code ? ` · ${item.postal_code}` : ""}`,
        };
      }),
    );
  }, []);

  return (
    <DistrictCombobox
      id="originSearch"
      value={value}
      placeholder="Ketik kecamatan atau kelurahan, min. 3 huruf…"
      describedBy="originSearchHint"
      search={search}
      onChange={(option) => {
        setValue(option);
        const origin = option ? rows.current.get(option.id) : undefined;
        if (origin) window.dispatchEvent(new CustomEvent<WarehouseOrigin>("warehouse-origin", { detail: origin }));
      }}
    />
  );
}
