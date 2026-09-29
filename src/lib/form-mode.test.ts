import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCodBlockedForProvince,
  getCodDisabledProvinceCodes,
  resolveFormModeContext,
  resolveFormModeFromProvince,
} from './form-mode.ts';
import { validateProvinceCodeList } from './province.ts';

function requestWithCf(cf: Record<string, unknown>) {
  const request = new Request('https://example.com/hybrid-form');
  Object.defineProperty(request, 'cf', { value: cf });
  return request;
}

test('known non-excluded province codes and names resolve to middle mode', () => {
  const disabledCodes = getCodDisabledProvinceCodes();
  assert.equal(resolveFormModeFromProvince('JI', disabledCodes), 'middle');
  assert.equal(resolveFormModeFromProvince('Jawa Timur', disabledCodes), 'middle');
});

test('provider formal Jakarta and Yogyakarta names remain COD-eligible when only Jawa Timur is disabled', () => {
  const disabledCodes = ['JI'];
  assert.equal(
    resolveFormModeFromProvince('Daerah Khusus Ibukota Jakarta', disabledCodes),
    'middle',
  );
  assert.equal(
    resolveFormModeFromProvince('Daerah Istimewa Yogyakarta', disabledCodes),
    'middle',
  );
  assert.equal(resolveFormModeFromProvince('Jawa Timur', disabledCodes), 'full');
});

test('excluded province codes and names resolve to full mode', () => {
  const disabledCodes = getCodDisabledProvinceCodes();
  assert.equal(resolveFormModeFromProvince('PA', disabledCodes), 'full');
  assert.equal(resolveFormModeFromProvince('Papua', disabledCodes), 'full');
});

test('unknown or absent provinces default to full mode in hybrid mode', () => {
  const disabledCodes = getCodDisabledProvinceCodes();
  assert.equal(resolveFormModeFromProvince('', disabledCodes), 'full');
  assert.equal(resolveFormModeFromProvince('Atlantis', disabledCodes), 'full');
});

test('Cloudflare regionCode is the primary hybrid dispatch signal', async () => {
  const context = await resolveFormModeContext(
    requestWithCf({ regionCode: 'JI', region: 'Papua' }),
    ['PA'],
  );
  assert.equal(context.provinceCode, 'JI');
  assert.equal(context.resolvedMode, 'middle');
  assert.equal(context.source, 'cloudflare');
});

test('Cloudflare region name and headers remain dispatch fallbacks', async () => {
  const namedContext = await resolveFormModeContext(
    requestWithCf({ region: 'Papua' }),
    ['PA'],
  );
  assert.equal(namedContext.provinceCode, 'PA');
  assert.equal(namedContext.resolvedMode, 'full');

  const headerContext = await resolveFormModeContext(
    new Request('https://example.com/hybrid-form', {
      headers: { 'x-cf-region-code': 'JB' },
    }),
    ['PA'],
  );
  assert.equal(headerContext.provinceCode, 'JB');
  assert.equal(headerContext.resolvedMode, 'middle');
});

test('province policy validation rejects unknown ISO suffix codes', () => {
  assert.deepEqual(validateProvinceCodeList(['PA', 'JB']), {
    success: true,
    codes: ['PA', 'JB'],
  });
  assert.deepEqual(validateProvinceCodeList(['PA', 'XX']), {
    success: false,
    invalidCodes: ['XX'],
  });
});

test('a COD order is refused for an excluded or unresolvable province', () => {
  const disabledCodes = ['PA', 'MA', 'AC'];

  // The address decides, not the form the visitor happened to be shown.
  assert.equal(isCodBlockedForProvince('cod', 'Papua', disabledCodes), true);
  assert.equal(isCodBlockedForProvince('cod', 'PA', disabledCodes), true);
  assert.equal(isCodBlockedForProvince('cod', 'Aceh', disabledCodes), true);

  assert.equal(isCodBlockedForProvince('cod', 'Jawa Timur', disabledCodes), false);
  assert.equal(isCodBlockedForProvince('cod', 'JI', disabledCodes), false);

  // Fails closed: a province the policy cannot classify never gets COD.
  assert.equal(isCodBlockedForProvince('cod', '', disabledCodes), true);
  assert.equal(isCodBlockedForProvince('cod', 'Atlantis', disabledCodes), true);

  // Non-COD is never blocked by this rule, whatever the province.
  assert.equal(isCodBlockedForProvince('bank_transfer', 'Papua', disabledCodes), false);
  assert.equal(isCodBlockedForProvince('qris', '', disabledCodes), false);
});

test('a page renders the order form through the hybrid dispatch, never a form component directly', async () => {
  // GeoIpResolvedForm is the only place the province rule runs: an excluded or
  // unresolved province gets the full form, any other the middle form. A
  // landing that renders FormHybridContent (the full form) or FormMiddleContent
  // itself skips that rule for every visitor — twelve landings on one install
  // did, showing the full form to buyers the middle form was meant for.
  const { readdirSync, readFileSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const pagesDir = new URL('../pages/', import.meta.url).pathname;
  // hybrid-form.astro is the legacy direct route for the full form, by design.
  const allowed = new Set(['hybrid-form.astro']);
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.astro') && !allowed.has(path.slice(pagesDir.length))) {
        const source = readFileSync(path, 'utf8');
        if (/<Form(Hybrid|Middle)Content\b/.test(source)) offenders.push(path.slice(pagesDir.length));
      }
    }
  };
  walk(pagesDir);
  assert.deepEqual(offenders, [], `render <GeoIpResolvedForm mode="hybrid" /> instead in: ${offenders.join(', ')}`);
});
