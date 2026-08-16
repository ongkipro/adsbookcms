import assert from 'node:assert/strict';
import test from 'node:test';
import { orderSubmitSchema } from './order-schema.ts';
import { buildWaUrl, renderCrmMessage } from './crm-template.ts';
import { isProvinceExcluded, parseProvinceList } from './province.ts';

const validOrder = {
  customer_name: 'Budi Santoso',
  customer_phone: '6281234567890',
  address: 'Jl. Branjangan Nomor 18A',
  district: 'Krembangan',
  province: 'Jawa Timur',
  postal_code: '60175',
  payment_method: 'cod',
  variant_id: 'AUS-500ML',
  quantity: 1,
  submit_token: 'submit-token-at-least-sixteen',
};

test('order schema normalizes a valid Indonesian mobile number', () => {
  const result = orderSubmitSchema.parse(validOrder);
  assert.equal(result.customer_phone, '6281234567890');
});

test('order schema rejects alphabetic or truncated phone input after normalization', () => {
  assert.equal(orderSubmitSchema.safeParse({ ...validOrder, customer_phone: 'abcdefghijk' }).success, false);
  assert.equal(orderSubmitSchema.safeParse({ ...validOrder, customer_phone: '08123' }).success, false);
});

test('order schema requires a stable submit token and bounded integer quantity', () => {
  assert.equal(orderSubmitSchema.safeParse({ ...validOrder, submit_token: '' }).success, false);
  assert.equal(orderSubmitSchema.safeParse({ ...validOrder, quantity: 1.5 }).success, false);
  assert.equal(orderSubmitSchema.safeParse({ ...validOrder, quantity: 101 }).success, false);
});

test('online checkout requires a matching AutoLaris channel and no longer requires email', () => {
  const validQris = orderSubmitSchema.safeParse({
    ...validOrder,
    payment_method: 'qris',
    payment_channel: 'QRIS',
  });
  assert.equal(validQris.success, true);
  assert.equal(orderSubmitSchema.safeParse({
    ...validOrder,
    payment_method: 'qris',
    payment_channel: 'VABCA',
  }).success, false);
  assert.equal(orderSubmitSchema.safeParse({
    ...validOrder,
    payment_method: 'bank_transfer',
    payment_channel: 'VABCA',
  }).success, true);
  assert.equal(orderSubmitSchema.safeParse({
    ...validOrder,
    payment_method: 'bank_transfer',
  }).success, false);
  assert.equal(orderSubmitSchema.safeParse({
    ...validOrder,
    payment_method: 'bank_transfer',
    payment_channel: 'DANA',
  }).success, false);
});

test('manual transfer requires a selected seller bank account', () => {
  assert.equal(orderSubmitSchema.safeParse({
    ...validOrder,
    payment_method: 'manual_transfer',
    seller_bank_account_id: 7,
  }).success, true);
  assert.equal(orderSubmitSchema.safeParse({
    ...validOrder,
    payment_method: 'manual_transfer',
  }).success, false);
});

test('province aliases enforce COD exclusions consistently', () => {
  const excluded = parseProvinceList('DI Yogyakarta, Kep. Riau');
  assert.equal(isProvinceExcluded('Provinsi Kepulauan Riau', excluded), true);
  assert.equal(isProvinceExcluded('Jawa Timur', excluded), false);
});

test('CRM rendering replaces order variables and produces an encoded WhatsApp URL', () => {
  const message = renderCrmMessage('Halo {{nama}}, order {{inv}} total {{total}}.', {
    customerName: 'Budi',
    customerPhone: '081234567890',
    district: 'Krembangan',
    province: 'Jawa Timur',
    orderNumber: 'INV-1',
    productName: 'Alpha',
    totalAmount: 183000,
    courierCode: 'SiCepat',
  });
  assert.equal(message, 'Halo Budi, order INV-1 total Rp 183.000.');
  assert.equal(buildWaUrl('081234567890', message).startsWith('https://wa.me/6281234567890?text='), true);
});
