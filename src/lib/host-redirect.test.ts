import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHostRedirect } from './host-redirect.ts';

const site = 'https://petanisejahtera.com';
const aliases = 'petanisawit.com, beranda.click';
const go = (href: string, a: string | null = aliases, s: string | null = site) => resolveHostRedirect(new URL(href), s, a);

test('an alias domain, bare or www, goes to the canonical origin with path and query', () => {
  assert.equal(go('https://petanisawit.com/aussie-formulabaru?utm_source=fb&fbclid=x'), 'https://petanisejahtera.com/aussie-formulabaru?utm_source=fb&fbclid=x');
  assert.equal(go('http://www.petanisawit.com/'), 'https://petanisejahtera.com/');
  assert.equal(go('https://www.beranda.click/produk'), 'https://petanisejahtera.com/produk');
});

test('http goes to https on the same host; the canonical https host stays', () => {
  assert.equal(go('http://petanisejahtera.com/produk?x=1'), 'https://petanisejahtera.com/produk?x=1');
  assert.equal(go('https://petanisejahtera.com/produk'), null);
  assert.equal(go('http://toko.example/', null, null), 'https://toko.example/');
  // www of the canonical host is left to the existing www rule.
  assert.equal(go('https://www.petanisejahtera.com/'), null);
});

test('api paths and local hosts are never moved', () => {
  assert.equal(go('https://beranda.click/api/webhooks/autolaris'), null);
  assert.equal(go('http://petanisawit.com/api/submit-order'), null);
  assert.equal(go('http://localhost:4321/'), null);
  assert.equal(go('http://127.0.0.1:8798/produk'), null);
});

test('aliases need a canonical site; a bad list or URL moves nothing but http', () => {
  assert.equal(go('https://beranda.click/', aliases, null), null);
  assert.equal(go('https://beranda.click/', aliases, 'not a url'), null);
  assert.equal(go('https://beranda.click/', ' , ', site), null);
  assert.equal(go('https://beranda.click/', 'https://beranda.click/', site), 'https://petanisejahtera.com/');
});
