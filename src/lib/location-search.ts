export type LocationSearchResult = {
  label: string;
  district: string;
  subdistrict_name: string;
  district_name: string;
  city: string;
  province: string;
};

export type GroupableLocation = Pick<LocationSearchResult, 'district' | 'city' | 'province'> & {
  district_name?: string;
};

export type LocationDistrictGroup<T extends GroupableLocation = LocationSearchResult> = {
  key: string;
  district: string;
  city: string;
  province: string;
  items: T[];
};

export type DeliveryLocationSummary = {
  district: string;
  city: string;
  province: string;
  postalCode?: string;
};

const collator = new Intl.Collator('id-ID', { sensitivity: 'base', numeric: true });

const normalize = (value: string) => value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('id-ID')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const DISTRICT_ADMINISTRATIVE_PREFIX = /^(?:kecamatan|kec)\s+/;
const CITY_ADMINISTRATIVE_PREFIX =
  /^(?:(?:kota\s+)?administrasi|kota administratif|kota adm|kabupaten|kab|kota)\s+/;
const PROVIDER_PREFIX_LENGTHS = [5, 4, 3] as const;
const PROVIDER_DISTRICT_MIGRATION_ALIASES: Record<string, string[]> = {
  'jakabaring|palembang': ['8 Ulu', '9 10 Ulu', '15 Ulu', 'Silaberanti', 'Tuan Kentang'],
};

const normalizeDistrict = (value: string) =>
  normalize(value)
    .replace(DISTRICT_ADMINISTRATIVE_PREFIX, '')
    .replace(/\s+padangsidimpuan$/, '')
    .replace(/\bsidempuan\b/g, 'sidimpuan');

const CITY_CANONICAL_ALIASES: Record<string, string> = {
  'fakfak': 'fak fak',
  'gunung kidul': 'gunungkidul',
  'kep siau tagulandang biaro': 'siau tagulandang biaro',
  'kepulauan siau tagulandang biaro sitaro': 'siau tagulandang biaro',
  'maluku tenggara barat': 'kepulauan tanimbar',
  'mamuju utara': 'pasangkayu',
  'muko muko': 'mukomuko',
  'padang sidempuan': 'padang sidimpuan',
  'palangka raya': 'palangkaraya',
  'pangkajene kepulauan': 'pangkajene dan kepulauan',
  'toba samosir': 'toba',
};

export const normalizeAdministrativeCity = (value: string) => {
  const normalized = normalize(value)
    .replace(CITY_ADMINISTRATIVE_PREFIX, '')
    .replace(/\bsidempuan\b/g, 'sidimpuan');
  return CITY_CANONICAL_ALIASES[normalized] || normalized;
};

const PROVIDER_CITY_SEARCH_ALIASES: Record<string, string[]> = {
  'fak fak': ['Fakfak'],
  'gunungkidul': ['Gunung Kidul'],
  'kepulauan tanimbar': ['Maluku Tenggara Barat'],
  'mukomuko': ['Muko Muko'],
  'padangsidimpuan': ['Padang Sidempuan'],
  'palangkaraya': ['Palangka Raya'],
  'pangkajene dan kepulauan': ['Pangkajene Kepulauan', 'Pangkajene'],
  'pasangkayu': ['Mamuju Utara'],
  'siau tagulandang biaro': ['Kepulauan Siau Tagulandang Biaro', 'Siau Tagulandang Biaro'],
  'toba': ['Toba Samosir'],
};

const providerCitySearchVariants = (city: string) => {
  const normalized = normalizeAdministrativeCity(city);
  return Array.from(new Set([
    city,
    ...(PROVIDER_CITY_SEARCH_ALIASES[normalized] || []),
  ]));
};

const compact = (value: string) => normalize(value).replace(/\s+/g, '');
const providerDistrictMigrationAliases = (district: string, city: string) =>
  PROVIDER_DISTRICT_MIGRATION_ALIASES[
    `${normalizeDistrict(district)}|${normalizeAdministrativeCity(city)}`
  ] || [];

export function buildProviderDestinationSearches(
  district: string,
  city: string,
  province = '',
) {
  const providerDistrict = district.trim().replace(/^(?:kecamatan|kec\.?)\s+/i, '');
  const providerCity = city.trim().replace(
    /^(?:(?:kota\s+)?administrasi|kota administratif|kota adm\.?|kabupaten|kab\.?|kota)\s+/i,
    '',
  );
  const primary = [providerDistrict, providerCity].filter(Boolean).join(' ');
  const cityVariants = providerCitySearchVariants(providerCity);
  const districtMigrationAliases = providerDistrictMigrationAliases(providerDistrict, providerCity);
  const normalizedDistrict = normalizeDistrict(providerDistrict);
  const compactDistrict = normalizedDistrict.replace(/\s+/g, '');
  const words = normalizedDistrict.split(' ').filter((word) => word.length >= 4);
  const cityProvinceVariants = province.trim()
    ? cityVariants.map((cityVariant) => `${cityVariant} ${province.trim()}`)
    : [];
  const prefixes = PROVIDER_PREFIX_LENGTHS.flatMap((length) =>
    Array.from(new Set([
      compactDistrict.slice(0, length),
      ...words.map((word) => word.slice(0, length)),
    ])).filter((value) => value.length >= 3),
  );

  return Array.from(new Set([
    primary,
    ...districtMigrationAliases.map((subdistrict) =>
      [subdistrict, providerCity].filter(Boolean).join(' ')),
    ...cityVariants.slice(1).map((cityVariant) =>
      [providerDistrict, cityVariant].filter(Boolean).join(' ')),
    ...cityVariants.map((cityVariant) =>
      [normalizedDistrict, cityVariant].filter(Boolean).join(' ')),
    ...prefixes.flatMap((prefix) =>
      cityVariants.map((cityVariant) => [prefix, cityVariant].filter(Boolean).join(' '))),
    ...prefixes,
    ...cityProvinceVariants,
    ...cityVariants,
  ].filter((value) => value.length >= 2)));
}

export function buildProviderDestinationSearch(district: string, city: string) {
  return buildProviderDestinationSearches(district, city)[0] || '';
}

export function createDistrictDiscoveryLocation({
  district,
  city,
  province,
}: {
  district: string;
  city: string;
  province: string;
}) {
  return {
    location_id: '',
    id: '',
    label: [district, city, province].filter(Boolean).join(', '),
    district,
    district_name: district,
    subdistrict_name: '',
    city,
    city_name: city,
    province,
    province_name: province,
    postal_code: '',
  };
}

export function matchesProviderDestination(
  providerDistrict: string,
  providerCity: string,
  catalogDistrict: string,
  catalogCity: string,
) {
  const normalizedProviderDistrict = normalizeDistrict(providerDistrict);
  const normalizedCatalogDistrict = normalizeDistrict(catalogDistrict);
  const districtMatches = compact(normalizedProviderDistrict) === compact(normalizedCatalogDistrict);
  if (!districtMatches || !catalogCity.trim()) return false;

  return compact(normalizeAdministrativeCity(providerCity))
    === compact(normalizeAdministrativeCity(catalogCity));
}

export function filterProviderDestinationAlternatives<T extends LocationSearchResult>(
  items: T[],
  catalogDistrict: string,
  catalogCity: string,
) {
  const cityMatches = items.filter((item) =>
    compact(normalizeAdministrativeCity(item.city))
      === compact(normalizeAdministrativeCity(catalogCity)),
  );
  const migratedSubdistricts = providerDistrictMigrationAliases(catalogDistrict, catalogCity)
    .map(normalize);
  if (migratedSubdistricts.length === 0) return cityMatches;

  return cityMatches.filter((item) =>
    migratedSubdistricts.includes(normalize(item.subdistrict_name)),
  );
}

export function resolveProviderDestinations<T extends LocationSearchResult>(
  items: T[],
  catalogDistrict: string,
  catalogCity: string,
) {
  const normalizedCatalogCity = normalize(catalogCity);
  const matches = items.filter((item) =>
    matchesProviderDestination(
      item.district_name,
      item.city,
      catalogDistrict,
      catalogCity,
    ),
  );

  sortLocationResults(matches, catalogDistrict);
  return matches.sort((left, right) => {
    const leftCityRank = normalize(left.city) === normalizedCatalogCity ? 0 : 1;
    const rightCityRank = normalize(right.city) === normalizedCatalogCity ? 0 : 1;
    return leftCityRank - rightCityRank;
  });
}

function relevance(item: LocationSearchResult, query: string) {
  const districts = Array.from(new Set([item.district_name, item.district].map(normalize).filter(Boolean)));
  const subdistrict = normalize(item.subdistrict_name);

  const exactDistrict = districts.some((value) => value === query);
  if (exactDistrict && subdistrict === query) return 0;
  if (exactDistrict) return 1;
  if (districts.some((value) => value.startsWith(query))) return 2;
  if (districts.some((value) => value.split(' ').some((word) => word.startsWith(query)))) return 3;
  if (subdistrict === query) return 4;
  if (subdistrict.startsWith(query)) return 5;
  if (subdistrict.split(' ').some((word) => word.startsWith(query))) return 6;

  const city = normalize(item.city);
  if (city.split(' ').some((word) => word.startsWith(query))) return 7;

  const label = normalize(item.label);
  if (label.split(' ').some((word) => word.startsWith(query))) return 8;
  if (label.includes(query)) return 9;
  return 10;
}

export function formatDeliveryLocation(location: DeliveryLocationSummary) {
  const district = location.district.trim();
  const city = location.city.trim();
  const province = location.province.trim();
  const postalCode = location.postalCode?.trim();
  const provinceAndPostal = [province, postalCode].filter(Boolean).join(' ');

  return [district, city, provinceAndPostal].filter(Boolean).join(', ');
}


export function sortLocationResults<T extends LocationSearchResult>(items: T[], search: string) {
  const query = normalize(search);
  if (!query) return items;

  return items.sort((left, right) => {
    const score = relevance(left, query) - relevance(right, query);
    if (score !== 0) return score;
    return collator.compare(left.district || left.label, right.district || right.label);
  });
}

export function groupLocationResults<T extends GroupableLocation>(items: T[]) {
  const groups = new Map<string, LocationDistrictGroup<T>>();

  items.forEach((item) => {
    const district = item.district_name || item.district;
    const key = [district, item.city, item.province].map(normalize).join('|');
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      return;
    }
    groups.set(key, {
      key,
      district,
      city: item.city,
      province: item.province,
      items: [item],
    });
  });

  return Array.from(groups.values());
}
