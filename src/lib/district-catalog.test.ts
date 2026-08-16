import test from 'node:test';
import assert from 'node:assert/strict';
import { searchDistrictCatalog } from './district-catalog.ts';

test('searches districts by district name', () => {
  const results = searchDistrictCatalog('Coblong');

  assert.ok(results.some((item) =>
    item.district === 'Coblong' && item.city.toLocaleLowerCase('id-ID').includes('bandung')
  ));
});

test('searches districts by city name', () => {
  const results = searchDistrictCatalog('Bandung');
  const cityMatches = results.filter((item) =>
    item.city.toLocaleLowerCase('id-ID').includes('bandung')
  );

  assert.ok(cityMatches.length > 1);
  assert.ok(cityMatches.every((item) =>
    item.city.toLocaleLowerCase('id-ID').includes('bandung')
  ));
  assert.ok(new Set(cityMatches.map((item) => item.district)).size > 1);
});
test('searches by district and city tokens in either order', () => {
  for (const query of ['Taman Sidoarjo', 'Sidoarjo Taman']) {
    const results = searchDistrictCatalog(query);
    assert.ok(results.some((item) =>
      item.district === 'Taman'
      && item.city.toLocaleLowerCase('id-ID').includes('sidoarjo')
    ));
  }
});


test('rejects empty and single-character searches', () => {
  assert.deepEqual(searchDistrictCatalog(''), []);
  assert.deepEqual(searchDistrictCatalog('a'), []);
});
