import assert from 'node:assert/strict';
import test from 'node:test';
import { detectExcludedAreaInText } from './excluded-area.ts';

test('detectExcludedAreaInText correctly identifies province codes such as PA (Papua) as excluded', () => {
  const result = detectExcludedAreaInText('Jayapura, Papua', ['PA', 'PB']);
  assert.equal(result, 'papua');
});

test('detectExcludedAreaInText returns empty string for non-excluded addresses', () => {
  const result = detectExcludedAreaInText('Jl. Asia Afrika, Bandung, Jawa Barat', ['PA', 'PB']);
  assert.equal(result, '');
});
