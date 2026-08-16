import assert from 'node:assert/strict';
import test from 'node:test';
import { searchDistrictCatalog } from './district-catalog.ts';
import {
  buildProviderDestinationSearch,
  buildProviderDestinationSearches,
  createDistrictDiscoveryLocation,
  formatDeliveryLocation,
  filterProviderDestinationAlternatives,
  groupLocationResults,
  matchesProviderDestination,
  resolveProviderDestinations,
  sortLocationResults,
  type LocationSearchResult,
} from './location-search.ts';

const location = (district: string, subdistrict: string, city: string): LocationSearchResult => ({
  label: `${district}, ${subdistrict}, ${city}, Jawa Timur`,
  district,
  subdistrict_name: subdistrict,
  district_name: district,
  city,
  province: 'Jawa Timur',
});

test('location search ranks matching kecamatan prefixes first', () => {
  const results = [
    location('Waru', 'Tambak Sawah', 'Sidoarjo'),
    location('Sei Balai', 'Suko Rejo', 'Batu Bara'),
    location('Sukoharjo', 'Gayam', 'Sukoharjo'),
    location('Sukodono', 'Anggaswangi', 'Sidoarjo'),
    location('Karanganyar', 'Jatipuro', 'Sukoharjo'),
  ];

  sortLocationResults(results, 'suko');

  assert.deepEqual(results.map((item) => item.district), [
    'Sukodono',
    'Sukoharjo',
    'Sei Balai',
    'Karanganyar',
    'Waru',
  ]);
});

test('location search prefers the district representative over its villages', () => {
  const results = [
    location('Taman', 'Krembangan', 'Sidoarjo'),
    location('Taman', 'Taman', 'Sidoarjo'),
    location('Taman', 'Wage', 'Sidoarjo'),
  ];

  sortLocationResults(results, 'Taman');

  assert.equal(results[0].subdistrict_name, 'Taman');
});

test('district catalog returns kecamatan matches by district or city, district-first', () => {
  const results = searchDistrictCatalog('suko');
  const districts = results.map((item) => item.district);

  assert.ok(districts.includes('Sukoharjo'));
  assert.ok(districts.includes('Sukodono'));
  assert.ok(!districts.includes('Delima'));
  // District-name matches rank ahead of city-only matches.
  assert.ok(results[0].district.toLocaleLowerCase('id-ID').startsWith('suko'));
});

test('location search groups villages under one kecamatan and city', () => {
  const results = [
    location('Sukodono', 'Anggaswangi', 'Sidoarjo'),
    location('Sukodono', 'Bangsri', 'Sidoarjo'),
    location('Sukodono', 'Bendo', 'Sragen'),
  ];

  const groups = groupLocationResults(results);

  assert.deepEqual(groups.map((group) => ({
    district: group.district,
    city: group.city,
    villages: group.items.map((item) => item.subdistrict_name),
  })), [
    { district: 'Sukodono', city: 'Sidoarjo', villages: ['Anggaswangi', 'Bangsri'] },
    { district: 'Sukodono', city: 'Sragen', villages: ['Bendo'] },
  ]);
});

test('delivery summary omits village and preserves district through postal code', () => {
  assert.equal(formatDeliveryLocation({
    district: 'Sukodono',
    city: 'Kabupaten Sidoarjo',
    province: 'Jawa Timur',
    postalCode: '61258',
  }), 'Sukodono, Kabupaten Sidoarjo, Jawa Timur 61258');

  assert.equal(formatDeliveryLocation({
    district: 'Jayapura Selatan',
    city: 'Jayapura',
    province: 'Papua',
  }), 'Jayapura Selatan, Jayapura, Papua');
});

test('district discovery resolves administrative provider city prefixes', () => {
  assert.equal(
    matchesProviderDestination(
      'KECAMATAN SUKODONO',
      'KABUPATEN SIDOARJO',
      'Sukodono',
      'Sidoarjo',
    ),
    true,
  );
  assert.equal(
    matchesProviderDestination(
      'SUKODONO',
      'KABUPATEN SRAGEN',
      'Sukodono',
      'Sidoarjo',
    ),
    false,
  );
  assert.equal(
    matchesProviderDestination('SUKODONO', 'KABUPATEN SRAGEN', 'Sukodono', ''),
    false,
  );
});

test('Cakung discovery keeps local catalog identity separate from provider IDs', () => {
  const catalogLocation = searchDistrictCatalog('Cakung').find((item) =>
    item.district === 'Cakung'
    && item.city === 'Administrasi Jakarta Timur'
  );

  assert.ok(catalogLocation);
  const discoveryLocation = createDistrictDiscoveryLocation(catalogLocation);
  assert.equal(discoveryLocation.id, '');
  assert.equal(discoveryLocation.location_id, '');
  assert.equal(
    buildProviderDestinationSearch(
      discoveryLocation.district,
      discoveryLocation.city,
    ),
    'Cakung Jakarta Timur',
  );
});

test('provider resolution retries compact and token prefixes for spacing differences', () => {
  const searches = buildProviderDestinationSearches('Biringkanaya', 'Kota Makassar');
  assert.equal(searches[0], 'Biringkanaya Makassar');
  assert.ok(searches.includes('birin Makassar'));
  assert.ok(searches.includes('biri Makassar'));
  assert.ok(searches.includes('birin'));
  assert.ok(searches.includes('biri'));
  assert.ok(
    buildProviderDestinationSearches('Lawe Sigala-Gala', 'Aceh Tenggara')
      .includes('sigal Aceh Tenggara'),
  );
  assert.ok(
    buildProviderDestinationSearches('Padang Selatan', 'Padang', 'Sumatera Barat')
      .includes('Padang Sumatera Barat'),
  );
  assert.ok(
    buildProviderDestinationSearches('Na IX-X', 'Labuhanbatu Utara')
      .includes('na ix x Labuhanbatu Utara'),
  );
  assert.equal(
    matchesProviderDestination(
      'BIRING KANAYA',
      'MAKASSAR',
      'Biringkanaya',
      'Kota Makassar',
    ),
    true,
  );
  assert.equal(
    matchesProviderDestination(
      'SIANTAR TIMUR',
      'PEMATANG SIANTAR',
      'Siantar Timur',
      'Pematangsiantar',
    ),
    true,
  );
  assert.equal(
    matchesProviderDestination(
      'PADANG SIDEMPUAN UTARA (PADANGSIDIMPUAN)',
      'PADANG SIDEMPUAN',
      'Padangsidimpuan Utara',
      'Padangsidimpuan',
    ),
    true,
  );
  assert.equal(
    matchesProviderDestination(
      'BALIGE',
      'TOBA SAMOSIR',
      'Balige',
      'Toba',
    ),
    true,
  );
  assert.ok(
    buildProviderDestinationSearches('Bambalamotu', 'Pasangkayu', 'Sulawesi Barat')
      .includes('Mamuju Utara'),
  );
  assert.equal(
    matchesProviderDestination(
      'BAMBALAMOTU',
      'MAMUJU UTARA',
      'Bambalamotu',
      'Pasangkayu',
    ),
    true,
  );
  assert.equal(
    matchesProviderDestination(
      'WERTAMRIAN',
      'MALUKU TENGGARA BARAT',
      'Wertamrian',
      'Kepulauan Tanimbar',
    ),
    true,
  );
});

test('Jakabaring resolves only its five villages from the provider legacy district', () => {
  const searches = buildProviderDestinationSearches(
    'Jakabaring',
    'Palembang',
    'Sumatera Selatan',
  );
  assert.ok(searches.includes('Silaberanti Palembang'));
  assert.ok(searches.includes('Tuan Kentang Palembang'));
  assert.ok(searches.includes('9 10 Ulu Palembang'));

  const candidates = [
    location('SEBERANG ULU I', '8 ULU', 'PALEMBANG'),
    location('SEBERANG ULU I', '9/10 ULU', 'PALEMBANG'),
    location('SEBERANG ULU I', '15 ULU', 'PALEMBANG'),
    location('SEBERANG ULU I', 'SILABERANTI', 'PALEMBANG'),
    location('SEBERANG ULU I', 'TUAN KENTANG', 'PALEMBANG'),
    location('SEBERANG ULU I', '5 ULU', 'PALEMBANG'),
    location('JAKABARING', 'JAKABARING', 'BANYUASIN'),
  ];

  assert.deepEqual(
    filterProviderDestinationAlternatives(candidates, 'Jakabaring', 'Palembang')
      .map((item) => item.subdistrict_name),
    ['8 ULU', '9/10 ULU', '15 ULU', 'SILABERANTI', 'TUAN KENTANG'],
  );
});

test('provider resolution matches administrative cities without crossing city boundaries', () => {
  const candidates = [
    location('BINUANG', 'CAKUNG', 'SERANG'),
    location('CAKUNG', 'CAKUNG', 'JAKARTA TIMUR'),
    location('CAKUNG', 'CAKUNG', 'KABUPATEN SERANG'),
  ];

  const resolved = resolveProviderDestinations(
    candidates,
    'Cakung',
    'Administrasi Jakarta Timur',
  );

  assert.deepEqual(
    resolved.map((item) => [item.district, item.subdistrict_name, item.city]),
    [['CAKUNG', 'CAKUNG', 'JAKARTA TIMUR']],
  );
});
