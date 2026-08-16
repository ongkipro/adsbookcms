import { GET as shippingRatesGET } from './shipping-rates';
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  return shippingRatesGET(context);
};
