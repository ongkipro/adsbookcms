import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { indonesiaDistricts } from '../src/data/indonesia-districts.ts';

type AuditCase = {
  district: string;
  city: string;
  province: string;
};

type AuditResult = AuditCase & {
  status: number;
  classification: 'resolved' | 'alternatives' | 'unavailable' | 'error';
  resolved: number;
  alternatives: number;
  attempts: number;
  error?: string;
};

const representativeCases: AuditCase[] = [
  ['Cakung', 'Administrasi Jakarta Timur', 'Daerah Khusus Ibukota Jakarta'],
  ['Sukodono', 'Sidoarjo', 'Jawa Timur'],
  ['Coblong', 'Kota Bandung', 'Jawa Barat'],
  ['Lowokwaru', 'Kota Malang', 'Jawa Timur'],
  ['Depok', 'Sleman', 'Daerah Istimewa Yogyakarta'],
  ['Banjarsari', 'Kota Surakarta', 'Jawa Tengah'],
  ['Medan Baru', 'Kota Medan', 'Sumatera Utara'],
  ['Kuta', 'Badung', 'Bali'],
  ['Mandau', 'Bengkalis', 'Riau'],
  ['Ilir Timur I', 'Kota Palembang', 'Sumatera Selatan'],
  ['Pontianak Kota', 'Kota Pontianak', 'Kalimantan Barat'],
  ['Samarinda Ulu', 'Kota Samarinda', 'Kalimantan Timur'],
  ['Biringkanaya', 'Kota Makassar', 'Sulawesi Selatan'],
  ['Abepura', 'Kota Jayapura', 'Papua'],
  ['Sorong Timur', 'Kota Sorong', 'Papua Barat Daya'],
].map(([district, city, province]) => ({ district, city, province }));

const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith('--'));
if (!input) {
  console.error('Usage: npm run location:audit -- https://tenant.example.com [--all] [--concurrency=4] [--report=tmp/location-coverage.json]');
  process.exit(1);
}

const baseUrl = new URL(input);
const auditAll = args.includes('--all');
const retryNonResolved = args.includes('--retry-non-resolved');
const retryUnavailable = args.includes('--retry-unavailable');
const concurrency = Math.max(1, Math.min(8, Number(args.find((arg) => arg.startsWith('--concurrency='))?.split('=')[1] || 4)));
const reportPath = args.find((arg) => arg.startsWith('--report='))?.slice('--report='.length)
  || 'tmp/location-coverage.json';
const keyOf = ({ district, city, province }: AuditCase) =>
  [district, city, province].map((value) => value.trim().toLocaleLowerCase('id-ID')).join('|');
const cases = auditAll
  ? Array.from(new Map(indonesiaDistricts.map(([district, city, province]) => {
      const item = { district, city, province };
      return [keyOf(item), item];
    })).values())
  : representativeCases;

let savedResults: AuditResult[] = [];
try {
  savedResults = JSON.parse(await readFile(reportPath, 'utf8')) as AuditResult[];
} catch {
  // A missing or incomplete report starts a fresh audit.
}
const resumableResults = retryUnavailable
  ? savedResults.filter((result) => result.classification !== 'unavailable' && result.classification !== 'error')
  : retryNonResolved
    ? savedResults.filter((result) => result.classification === 'resolved')
    : savedResults;
const results = new Map(resumableResults.map((result) => [keyOf(result), result]));
let completedSinceSave = 0;

const save = async () => {
  await mkdir(reportPath.slice(0, Math.max(0, reportPath.lastIndexOf('/'))) || '.', { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(Array.from(results.values()), null, 2)}\n`);
  completedSinceSave = 0;
};

const resolveOne = async (item: AuditCase): Promise<AuditResult> => {
  const url = new URL('/api/locations', baseUrl);
  url.search = new URLSearchParams({
    search: item.district,
    city: item.city,
    level: 'resolve',
    province: item.province,
  }).toString();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      const payload = await response.json() as {
        items?: unknown[];
        alternatives?: unknown[];
      };
      const resolved = Array.isArray(payload.items) ? payload.items.length : 0;
      const alternatives = Array.isArray(payload.alternatives) ? payload.alternatives.length : 0;
      const classification = response.ok
        ? resolved > 0
          ? 'resolved'
          : alternatives > 0
            ? 'alternatives'
            : 'unavailable'
        : 'error';
      if (classification !== 'error' || attempt === 2) {
        return { ...item, status: response.status, classification, resolved, alternatives, attempts: attempt };
      }
    } catch (error) {
      if (attempt === 2) {
        return {
          ...item,
          status: 0,
          classification: 'error',
          resolved: 0,
          alternatives: 0,
          attempts: attempt,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 500);
    await promise;
  }
  throw new Error('Unreachable location audit state.');
};

let cursor = 0;
const pending = cases.filter((item) => !results.has(keyOf(item)));
const workers = Array.from({ length: Math.min(concurrency, pending.length || 1) }, async () => {
  while (cursor < pending.length) {
    const item = pending[cursor++];
    const result = await resolveOne(item);
    results.set(keyOf(item), result);
    completedSinceSave += 1;
    if (completedSinceSave >= 25) await save();
    if (results.size % 100 === 0 || result.classification !== 'resolved') {
      console.log(`${results.size}/${cases.length} ${result.classification}: ${result.district}, ${result.city}`);
    }
  }
});

await Promise.all(workers);
await save();
const finalResults = cases.map((item) => results.get(keyOf(item))).filter((item): item is AuditResult => Boolean(item));
const summary = Object.fromEntries(
  ['resolved', 'alternatives', 'unavailable', 'error'].map((classification) => [
    classification,
    finalResults.filter((item) => item.classification === classification).length,
  ]),
);
console.table(summary);
console.log(`${finalResults.length}/${cases.length} unique district-city-province records screened. Report: ${reportPath}`);
if (summary.unavailable > 0 || summary.error > 0) process.exitCode = 1;
