import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTrustedHeadlessShipping } from './headless-checkout.ts';

test('resolveTrustedHeadlessShipping requires server-quoted destination and courier', async () => {
  await assert.rejects(
    () =>
      resolveTrustedHeadlessShipping(
        { shipping_cost: -50000 },
        {
          customer_name: 'Tester',
          customer_phone: '081234567890',
          customer_email: '',
          address: 'Jalan Mawar No. 1, Bandung',
          district: 'Coblong',
          province: 'Jawa Barat',
          postal_code: '40132',
          payment_method: 'cod',
          variant_id: '12',
          quantity: 1,
          submit_token: 'sb_test_token_123456',
        },
        async () => ({ rates: [] }),
      ),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      Reflect.get(error, 'code') === 'SHIPPING_QUOTE_REQUIRED',
  );
});

test('resolveTrustedHeadlessShipping trusts provider quote instead of client shipping_cost', async () => {
  const shipping = await resolveTrustedHeadlessShipping(
    {
      destination_id: 'dst-1',
      courier_code: 'jne',
      courier_service_id: 1,
      shipping_cost: -50000,
      city: 'Bandung',
    },
    {
      customer_name: 'Tester',
      customer_phone: '081234567890',
      customer_email: '',
      address: 'Jalan Mawar No. 1, Bandung',
      district: 'Coblong',
      province: 'Jawa Barat',
      postal_code: '40132',
      payment_method: 'cod',
      variant_id: '12',
      quantity: 1,
      submit_token: 'sb_test_token_123456',
    },
    async () => ({
      rates: [
        {
          courier_code: 'jne',
          courier_service: 'REG',
          price: 18000,
          estimated_days: '2-3',
          unsupported: false,
          unsupported_cod: false,
          cod_fee: 2500,
        },
      ],
      warehouse: {
        id: 9,
      },
    }),
  );

  assert.deepEqual(shipping, {
    destinationId: 'dst-1',
    shippingCost: 20500,
    courierCode: 'jne',
    courierService: 'REG',
    warehouseId: 9,
  });
});
