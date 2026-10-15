import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyReceiverRisk, parseReceiverPerformance } from './receiver-performance.ts';

const liveShape = {
  _id: 'receiver-id',
  phone: '81234567890',
  JNE: { total: 54, value: 870000, inProgress: 22, delivered: 4, rts: 50, undelivered: 0, rate: 0.7 },
  SiCepat: { total: 5, value: 154000, inProgress: 5, delivered: 2, rts: 3, undelivered: 0, rate: 4 },
  JT: { total: 37, value: 838654, inProgress: 11, delivered: 24, rts: 13, undelivered: 0, rate: 6.5 },
  createdAt: '2023-05-12T04:19:39.809Z',
};

test('receiver performance parses the live per-courier Mengantar response shape', () => {
  const result = parseReceiverPerformance(liveShape, '081234567890', '2026-08-08T00:00:00.000Z');

  assert.equal(result.couriers.length, 3);
  assert.equal(result.couriers[0]?.courier, 'JNE');
  assert.deepEqual(result.totals, {
    total: 96,
    delivered: 30,
    rts: 66,
    undelivered: 0,
    inProgress: 38,
    value: 1862654,
  });
  assert.equal(result.deliveryRate, 31.3);
  assert.equal(result.riskLevel, 'HIGH');
});

test('receiver delivery rate is derived from completed history, not the undocumented API rate field', () => {
  const result = parseReceiverPerformance({
    CourierA: { total: 10, delivered: 8, rts: 2, inProgress: 3, rate: 999 },
  }, '081234567890');

  assert.equal(result.deliveryRate, 80);
  assert.equal(result.couriers[0]?.deliveryRate, 80);
  assert.equal(result.couriers[0]?.apiRate, 999);
  assert.equal(result.riskLevel, 'LOW');
});

test('receiver parser rejects responses without courier history', () => {
  assert.throws(
    () => parseReceiverPerformance({ phone: '81234567890', createdAt: '2026-08-08' }, '081234567890'),
    /tidak berisi riwayat kurir/,
  );
});

test('receiver risk thresholds follow the documented AdsBookCMS operational policy', () => {
  assert.equal(classifyReceiverRisk(null), 'UNKNOWN');
  assert.equal(classifyReceiverRisk(39.9), 'HIGH');
  assert.equal(classifyReceiverRisk(40), 'MEDIUM');
  assert.equal(classifyReceiverRisk(69.9), 'MEDIUM');
  assert.equal(classifyReceiverRisk(70), 'LOW');
});

test('a documented summary decides the rate and grade, matching what Mengantar shows', () => {
  const result = parseReceiverPerformance({
    JNE: { total: 36, value: 10542000, inProgress: 3652, delivered: 35, rts: 1, undelivered: 0, rate: 9.7 },
    JT: { total: 4, value: 450000, inProgress: 2970, delivered: 2, rts: 1, undelivered: 1, rate: 5 },
    summary: { average_number: 7.4, average_score: 'B' },
  }, '08123456789');

  // Unweighted courier mean (7.4/10), not the 92.5% pooled across couriers.
  assert.equal(result.deliveryRate, 74);
  assert.equal(result.riskLevel, 'LOW');
  assert.equal(result.grade, 'B');
  assert.equal(result.couriers.length, 2);
});

test('a receiver with no history is a checked UNKNOWN, not a parse failure', () => {
  const result = parseReceiverPerformance({
    JNE: {},
    SiCepat: {},
    summary: { average_number: null, average_score: '-' },
  }, '08123456789');

  assert.equal(result.deliveryRate, null);
  assert.equal(result.riskLevel, 'UNKNOWN');
  assert.equal(result.grade, '-');
  assert.equal(result.couriers.length, 0);
});

test('an approximate grade keeps its prefix and still classifies', () => {
  const result = parseReceiverPerformance({
    JT: { total: 2, delivered: 0, rts: 2, undelivered: 0, rate: 0 },
    summary: { average_number: 0, average_score: '≈E-' },
  }, '08123456789');

  assert.equal(result.grade, '≈E-');
  assert.equal(result.riskLevel, 'HIGH');
});
