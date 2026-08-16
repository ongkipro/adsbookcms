import type { APIRoute } from 'astro';
import { getRuntimeEnv } from '../../lib/env';

export const prerender = false;

const SAFE_KEY = /^uploads\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.(?:jpg|png|webp|gif|avif)$/i;

export const GET: APIRoute = async ({ params, locals }) => {
  const key = String(params.key || '');
  if (!SAFE_KEY.test(key)) return new Response('Not found', { status: 404 });

  const bucket = getRuntimeEnv(locals)?.ASSET_BUCKET as R2Bucket | undefined;
  if (!bucket) return new Response('Asset storage unavailable', { status: 503 });

  const object = await bucket.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  if (object.httpMetadata?.contentType) headers.set('Content-Type', object.httpMetadata.contentType);
  if (object.httpMetadata?.contentLanguage) headers.set('Content-Language', object.httpMetadata.contentLanguage);
  if (object.httpMetadata?.contentDisposition) headers.set('Content-Disposition', object.httpMetadata.contentDisposition);
  if (object.httpMetadata?.contentEncoding) headers.set('Content-Encoding', object.httpMetadata.contentEncoding);
  if (object.httpMetadata?.cacheControl) headers.set('Cache-Control', object.httpMetadata.cacheControl);
  if (object.httpMetadata?.cacheExpiry) headers.set('Expires', object.httpMetadata.cacheExpiry.toUTCString());
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new Response(object.body as unknown as BodyInit, { headers });
};
