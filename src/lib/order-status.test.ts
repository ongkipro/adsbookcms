import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../pages/api/order-status.ts';

test('order status requires the public status token', async () => {
  const response = await POST({
    request: new Request('https://permatamall.shop/api/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_pk: '42' }),
    }),
    locals: {},
  } as never);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    success: false,
    error: 'Parameter order_pk/order_id dan status_token wajib diisi.',
  });
});

test('order status scopes the database lookup to order and status token', async () => {
  let boundValues: unknown[] = [];
  const response = await POST({
    request: new Request('https://permatamall.shop/api/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_pk: '42', status_token: 'public-secret' }),
    }),
    locals: {
      runtimeEnv: {
        OMS_DB: {
          prepare(query: string) {
            assert.match(query, /o\.public_status_token = \?/);
            return {
              bind(...values: unknown[]) {
                boundValues = values;
                return {
                  async first() {
                    return {
                      order_number: 'INV-42',
                      payment_status: 'pending',
                      fulfillment_status: 'unfulfilled',
                      grand_total: 149_000,
                    };
                  },
                };
              },
            };
          },
        },
      },
    },
  } as never);

  assert.equal(response.status, 200);
  assert.deepEqual(boundValues, ['42', '42', 'public-secret']);
  const payload = await response.json() as { success?: boolean; order_number?: string };
  assert.equal(payload.success, true);
  assert.equal(payload.order_number, 'INV-42');
});
