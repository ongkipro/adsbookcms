import { getCodDisabledProvinces } from './form-mode.ts';
import { normalizeProvince, normalizeProvinceName } from './province.ts';

// Pagar lapis kedua untuk form middle: IP geolocation operator seluler ID
// sering meleset (pelanggan Papua bisa terdeteksi Jakarta), jadi alamat yang
// DIKETIK pembeli menjadi sinyal final. Keyword = nama provinsi, singkatan
// umum, dan kota/kabupaten khas tiap provinsi excluded.
const AREA_KEYWORDS: Record<string, string[]> = {
  papua: [
    'papua',
    'jayapura',
    'abepura',
    'sentani',
    'merauke',
    'timika',
    'mimika',
    'nabire',
    'wamena',
    'sorong',
    'manokwari',
    'fakfak',
    'biak',
    'serui',
    'keerom',
    'asmat',
    'jayawijaya',
  ],
  maluku: ['maluku', 'ambon', 'tual', 'masohi', 'namlea', 'saumlaki', 'dobo'],
  'maluku utara': ['malut', 'ternate', 'tidore', 'sofifi', 'tobelo', 'halmahera'],
  'nusa tenggara timur': [
    'nusa tenggara timur',
    'ntt',
    'kupang',
    'ende',
    'maumere',
    'labuan bajo',
    'ruteng',
    'atambua',
    'waingapu',
    'kefamenanu',
    'flores',
    'sumba',
    'alor',
    'lembata',
    'manggarai',
    'sikka',
    'belu',
    'rote',
  ],
  'kalimantan utara': [
    'kalimantan utara',
    'kaltara',
    'tarakan',
    'tanjung selor',
    'nunukan',
    'malinau',
    'bulungan',
    'tana tidung',
  ],
  'sulawesi barat': ['sulawesi barat', 'sulbar', 'mamuju', 'majene', 'polewali', 'mamasa', 'pasangkayu'],
  gorontalo: ['gorontalo', 'limboto', 'marisa', 'kwandang', 'boalemo', 'pohuwato'],
  'kepulauan riau': [
    'kepulauan riau',
    'kepri',
    'batam',
    'tanjung pinang',
    'tanjungpinang',
    'bintan',
    'karimun',
    'natuna',
    'anambas',
    'lingga',
  ],
  aceh: ['aceh', 'lhokseumawe', 'langsa', 'sabang', 'meulaboh', 'bireuen', 'takengon', 'subulussalam'],
  bengkulu: ['bengkulu', 'curup', 'manna', 'arga makmur', 'mukomuko', 'kepahiang', 'lebong', 'seluma'],
};

function normalizeText(value: unknown) {
  return ` ${String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

/**
 * Deteksi apakah teks alamat menunjuk ke provinsi yang dikecualikan dari COD.
 * Mengembalikan nama provinsi kanonik, atau '' bila tidak terdeteksi.
 * Hanya provinsi yang benar-benar ada di daftar excluded (env-driven) yang
 * dilaporkan, sehingga kebijakan tetap satu sumber di PUBLIC_COD_DISABLED_PROVINCES.
 */
export function detectExcludedAreaInText(text: unknown, excluded = getCodDisabledProvinces()): string {
  const haystack = normalizeText(text);
  if (haystack.trim() === '') return '';

  const excludedNormalized = new Set(excluded.map((item) => normalizeProvinceName(item) || normalizeProvince(item)));

  for (const [province, keywords] of Object.entries(AREA_KEYWORDS)) {
    if (!excludedNormalized.has(province)) continue;
    for (const keyword of keywords) {
      if (haystack.includes(` ${keyword} `)) return province;
    }
  }
  return '';
}
