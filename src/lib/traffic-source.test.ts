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

test('a leftover ttclid from before TikTok support was removed reads as organic, not a phantom category', () => {
  // TikTok classification was removed 2026-08-24 (TRACKING_SPECS.md §8). An
  // order whose ad_click_ids still holds a ttclid from before that — nothing
  // was backfilled — must not resolve to a `TrafficSourceType` that no longer
  // exists in the union; it falls through to organic like any other unknown key.
  const source = parseTrafficSource(JSON.stringify({ ttclid: 'E_123456' }));
  assert.equal(source.type, 'organic');
  assert.equal(source.label, 'Organic / Direct');
});

test('parseTrafficSource identifies Organic / Direct when adClickIds is empty or absent', () => {
  assert.equal(parseTrafficSource(null).type, 'organic');
  assert.equal(parseTrafficSource('').type, 'organic');
  assert.equal(parseTrafficSource('{}').type, 'organic');
  assert.equal(parseTrafficSource(null).label, 'Organic / Direct');
});
