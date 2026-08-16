import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMetaEventPayload } from './meta-event-contract.ts';

const requestUrl = 'https://permatamall.shop/api/meta-event';

// This is the payload the storefront trackers actually put on the wire:
// commerce fields flat, customer fields under user_data with customer_* keys.
// The previous fixture was hand-written in Meta's documented shape, which no
// caller in this repo has ever sent — so the server dropped every value,
// catalog id, and match signal while the suite stayed green.
const wirePayload = {
  event_name: 'Purchase',
  event_id: 'purchase_INV-20260814-ABC123',
  event_source_url: 'https://permatamall.shop/thanks?order=1',
  lp_name: 'asahan-portable',
  product_id: '434683',
  content_name: 'Asahan Portable',
  content_type: 'product',
  value: 89_000,
  currency: 'IDR',
  user_data: {
    customer_name: 'Siti Rahayu',
    customer_phone: '081234567890',
    country: 'id',
    postal_code: '60226',
    province: 'Jawa Timur',
    city: 'Surabaya',
    fbp: 'fb.1.1754400000000.1234567890',
    fbc: 'fb.1.1754400000000.IwAR0abcdef',
    external_id: '6281234567890',
  },
};

test('the payload the storefront actually sends is accepted intact', () => {
  const result = validateMetaEventPayload(wirePayload, requestUrl);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.eventName, 'Purchase');
  assert.equal(result.value.value, 89_000);
  assert.equal(result.value.contentName, 'Asahan Portable');
  assert.deepEqual(result.value.contentIds, ['434683']);
  assert.equal(result.value.currency, 'IDR');
  assert.equal(result.value.eventSourceUrl, 'https://permatamall.shop/thanks');
});

test('live six-digit catalog ids reach Meta', () => {
  // Real Zanoby catalog ids. The old /^\d{5}$/ rule rejected all of them.
  for (const id of ['434683', '434685', '441672']) {
    const result = validateMetaEventPayload({ ...wirePayload, product_id: id }, requestUrl);
    assert.equal(result.ok, true, `catalog id ${id} must reach Meta`);
    if (result.ok) assert.deepEqual(result.value.contentIds, [id]);
  }
});

test('match signals survive the contract instead of being dropped', () => {
  const result = validateMetaEventPayload(wirePayload, requestUrl);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.phone, '081234567890');
  assert.equal(result.value.name, 'Siti Rahayu');
  assert.equal(result.value.city, 'Surabaya');
  assert.equal(result.value.province, 'Jawa Timur');
  assert.equal(result.value.postalCode, '60226');
  assert.equal(result.value.country, 'id');
  assert.equal(result.value.externalId, '6281234567890');
  // _fbp/_fbc carry the highest matching weight and must pass through raw.
  assert.equal(result.value.fbp, 'fb.1.1754400000000.1234567890');
  assert.equal(result.value.fbc, 'fb.1.1754400000000.IwAR0abcdef');
});

test('the Meta-native nested shape is still accepted', () => {
  const result = validateMetaEventPayload(
    {
      event_name: 'ViewContent',
      event_id: 'vc_asahan_1754400000',
      event_source_url: 'https://permatamall.shop/produk/asahan-portable',
      user_data: { phone: '6281234567890', name: 'Siti' },
      custom_data: { content_name: 'Asahan Portable', content_ids: ['434683'], value: 89_000, currency: 'IDR' },
    },
    requestUrl,
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.contentIds, ['434683']);
});

test('malformed browser cookies are dropped without failing the event', () => {
  const result = validateMetaEventPayload(
    { ...wirePayload, user_data: { ...wirePayload.user_data, fbp: 'not-a-cookie', fbc: 'garbage' } },
    requestUrl,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.fbp, undefined);
  assert.equal(result.value.fbc, undefined);
});

test('poisoning inputs are rejected before transport', () => {
  const invalidPayloads = [
    { ...wirePayload, event_name: 'Refund' },
    { ...wirePayload, event_id: '<script>' },
    { ...wirePayload, event_source_url: 'https://attacker.example/order' },
    // Spaces and HTML tags are rejected as catalog ids.
    { ...wirePayload, product_id: 'Asahan Portable' },
    { ...wirePayload, product_id: '<script>id</script>' },
    { ...wirePayload, value: -1 },
    { ...wirePayload, currency: 'USD' },
    { ...wirePayload, user_data: { ...wirePayload.user_data, customer_name: 'x'.repeat(161) } },
  ];

  for (const payload of invalidPayloads) {
    assert.equal(validateMetaEventPayload(payload, requestUrl).ok, false);
  }
});
