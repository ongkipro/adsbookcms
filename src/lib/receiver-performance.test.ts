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
