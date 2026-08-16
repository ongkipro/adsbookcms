import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrafficSource } from './traffic-source.ts';

test('parseTrafficSource identifies Meta Ads from fbclid, _fbc, or _fbp', () => {
  const sourceFbclid = parseTrafficSource(JSON.stringify({ fbclid: 'IwAR123456789' }));
  assert.equal(sourceFbclid.type, 'meta');
  assert.equal(sourceFbclid.label, 'Meta Ads');
  assert.ok(sourceFbclid.badgeClass.includes('blue'));
  assert.equal(parseTrafficSource(JSON.stringify({ _fbp: 'fb.1.1700000000.123' })).type, 'meta');

  const sourceInstagram = parseTrafficSource(JSON.stringify({ utm_source: 'instagram', fbclid: 'xyz' }));
  assert.equal(sourceInstagram.type, 'meta');
  assert.equal(sourceInstagram.label, 'Instagram Ads');
});

test('parseTrafficSource identifies Google Ads from gclid, gbraid, or wbraid', () => {
  const sourceGclid = parseTrafficSource(JSON.stringify({ gclid: 'Cj0KCQ_abc123' }));
  assert.equal(sourceGclid.type, 'google');
  assert.equal(sourceGclid.label, 'Google Ads');
  assert.ok(sourceGclid.badgeClass.includes('emerald'));

  const sourceGbraid = parseTrafficSource(JSON.stringify({ gbraid: '0AAAAA_xyz' }));
  assert.equal(sourceGbraid.type, 'google');
  assert.equal(sourceGbraid.label, 'Google Ads');
});

test('parseTrafficSource identifies TikTok Ads from ttclid or utm_source tiktok', () => {
  const sourceTikTok = parseTrafficSource(JSON.stringify({ ttclid: 'E_123456' }));
  assert.equal(sourceTikTok.type, 'tiktok');
  assert.equal(sourceTikTok.label, 'TikTok Ads');
  assert.ok(sourceTikTok.badgeClass.includes('purple'));
});

test('parseTrafficSource identifies Organic / Direct when adClickIds is empty or absent', () => {
  assert.equal(parseTrafficSource(null).type, 'organic');
  assert.equal(parseTrafficSource('').type, 'organic');
  assert.equal(parseTrafficSource('{}').type, 'organic');
  assert.equal(parseTrafficSource(null).label, 'Organic / Direct');
});
