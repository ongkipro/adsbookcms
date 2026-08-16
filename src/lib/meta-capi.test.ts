import assert from 'node:assert/strict';
import test from 'node:test';
import { META_GRAPH_API_VERSION, sendMetaCapiEvent, toE164Digits } from './meta-capi.ts';

test('Indonesian storefront phones normalize to the E.164 form Meta matches on', () => {
  assert.equal(toE164Digits('081234567890'), '6281234567890');
  assert.equal(toE164Digits('0812-3456-7890'), '6281234567890');
  assert.equal(toE164Digits('+62 812 3456 7890'), '6281234567890');
  assert.equal(toE164Digits('6281234567890'), '6281234567890');
});

test('blank phone input yields no hash rather than a hash of nothing', () => {
  assert.equal(toE164Digits(''), undefined);
  assert.equal(toE164Digits(undefined), undefined);
  assert.equal(toE164Digits('---'), undefined);
});

test('Meta CAPI uses supported API version and forwards test event code', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestUrl = '';
  let requestBody: unknown;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ events_received: 1 }), {
      status: 200,
    });
  };

  const result = await sendMetaCapiEvent(
    'PageView',
    'settings_test_1',
    'https://petanisejahtera.com/admin/ads/meta',
    { phone: '081234567890', name: 'Siti', clientIp: '127.0.0.1', userAgent: 'test' },
    { contentName: 'AdsBookCMS Meta CAPI connection test' },
    '123456789',
    'test-token',
    'TEST12345',
  );

  assert.equal(result.success, true);
  assert.equal(requestUrl, `https://graph.facebook.com/${META_GRAPH_API_VERSION}/123456789/events?access_token=test-token`);
  assert.ok(requestBody && typeof requestBody === 'object');
  const payload = requestBody as Record<string, unknown>;
  assert.equal(payload.test_event_code, 'TEST12345');
  const data = payload.data as Array<{ user_data: { ph: string[]; fn: string[] } }>;
  assert.match(data[0].user_data.ph[0], /^[a-f0-9]{64}$/);
  assert.match(data[0].user_data.fn[0], /^[a-f0-9]{64}$/);
  assert.notEqual(data[0].user_data.ph[0], '081234567890');
});
