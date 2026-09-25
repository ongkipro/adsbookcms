/**
 * Local stand-ins for Mengantar and AutoLaris, for `npm run dev:local`.
 *
 * Without them a local store cannot quote shipping, so checkout, dispatch and
 * online payment can only be exercised against the real providers. They speak
 * the same wire shapes the product's clients parse (`mengantar-client.ts`,
 * `autolaris-client.ts`); `src/lib/dev-providers.test.ts` drives the real
 * clients against this server, so a drift in either side fails `npm test`.
 *
 * Development only. Nothing in `src/` imports this file; a Worker reaches it
 * solely because `dev:local` points `MENGANTAR_BASE_URL` / `AUTOLARIS_BASE_URL`
 * at 127.0.0.1. Prices are deterministic fakes, not quotes.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { indonesiaDistricts } from "../src/data/indonesia-districts.ts";

type Json = Record<string, unknown> | unknown[];

const COURIERS: readonly { code: string; base: number; perKg: number; cod: boolean }[] = [
  { code: "JNE", base: 11000, perKg: 4000, cod: true },
  { code: "SiCepat", base: 9500, perKg: 3500, cod: true },
  { code: "J&T", base: 10000, perKg: 3800, cod: true },
  { code: "SAP", base: 10500, perKg: 3600, cod: true },
  { code: "Anteraja", base: 9000, perKg: 3400, cod: true },
  { code: "IDexpress", base: 8500, perKg: 3300, cod: true },
  { code: "Paxel", base: 14000, perKg: 5000, cod: false },
];

const normalize = (value: string) =>
  value.toLocaleLowerCase("id-ID").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Provider-shaped area rows from the real district index, ids stable per row. */
export function searchDevAreas(keyword: string, limit = 20) {
  const tokens = normalize(keyword).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  const rows = [];
  for (let index = 0; index < indonesiaDistricts.length && rows.length < limit; index += 1) {
    const [district, city, province] = indonesiaDistricts[index];
    const haystack = normalize(`${district} ${city} ${province}`).split(" ");
    if (tokens.every((token) => haystack.some((word) => word.startsWith(token)))) {
      rows.push({
        _id: `dev-area-${index + 1}`,
        DISTRICT_NAME: district,
        SUBDISTRICT_NAME: district,
        CITY_NAME: city,
        PROVINCE_NAME: province,
        ZIP_CODE: "",
      });
    }
  }
  return rows;
}

function areaNumber(id: string) {
  return Number(/(\d+)$/.exec(id)?.[1] ?? 0);
}

export function estimateDevRates(originId: string, destinationId: string, weightKg: number, codAmount: number) {
  const distance = Math.abs(areaNumber(originId) - areaNumber(destinationId)) % 9;
  const kg = Math.max(1, Math.ceil(weightKg));
  const data: Record<string, unknown> = {};
  for (const courier of COURIERS) {
    const price = Math.round((courier.base + courier.perKg * (kg - 1) + distance * 1000) / 500) * 500;
    data[courier.code] = {
      price,
      estimate_delivery: `${2 + (distance % 3)}-${3 + (distance % 3)}`,
      unsupported: false,
      unsupported_cod: !courier.cod,
      // Mengantar's own figure only appears when COD_AMOUNT is sent, which the
      // store never does at checkout (shipping-quote.ts); mirrored here.
      codFee: codAmount > 0 && courier.cod ? Math.round(codAmount * 0.03) : 0,
    };
  }
  return data;
}

function jakartaIn(hours: number) {
  const date = new Date(Date.now() + hours * 3_600_000 + 7 * 3_600_000);
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as Record<string, unknown>;
  const type = String(request.headers["content-type"] || "");
  if (type.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw)) as Record<string, unknown>;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function send(response: ServerResponse, status: number, body: Json) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function createDevProviderServer(): Server {
  const pickupAddresses: Record<string, string>[] = [];
  const shipments = new Map<string, Record<string, unknown>>();
  const payments = new Map<string, { paid: boolean; total: number }>();
  let sequence = 0;
  const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(sequence += 1)}`;

  return createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const method = request.method || "GET";

    // ---- AutoLaris: /api/h2h/* ------------------------------------------
    if (url.pathname === "/api/h2h/list_payment") {
      return send(response, 200, {
        rc: "00",
        ket: "SUCCESS",
        data: ["QRIS", "VABCA", "VAMANDIRI", "VABNI", "VABRI"].map((channel_code) => ({ channel_code })),
      });
    }
    if (url.pathname === "/api/h2h/submit" && method === "POST") {
      const body = await readBody(request);
      const amount = Number(body.grand_total) || 0;
      const admin = String(body.channel_code) === "QRIS" ? Math.round(amount * 0.007) : 4000;
      const transactionId = String(Date.now()) + String((sequence += 1));
      payments.set(transactionId, { paid: false, total: amount + admin });
      const qris = String(body.channel_code) === "QRIS";
      return send(response, 200, {
        rc: "00",
        ket: "SUCCESS",
        data: {
          transaction_id: transactionId,
          biaya_admin: admin,
          total: amount + admin,
          payment_info: {
            ...(qris
              ? { qr: `00020101021226DEV${transactionId}5303360540${amount + admin}6304ABCD` }
              : { va: `8808${transactionId.slice(-10)}` }),
            expired: jakartaIn(24),
          },
        },
      });
    }
    if (url.pathname === "/api/h2h/advice" && method === "POST") {
      const body = await readBody(request);
      const payment = payments.get(String(body.transaction_id));
      if (!payment) return send(response, 200, { rc: "14", ket: "TRANSAKSI TIDAK DITEMUKAN", data: {} });
      return send(response, 200, payment.paid
        ? { rc: "00", ket: "PAID", data: { awb: "" } }
        : { rc: "02", ket: "PENDING", data: { awb: "" } });
    }
    // Local-only lever: settle a transaction so the hourly reconciliation
    // (or `curl` against /cdn-cgi/handler/scheduled) has something to find.
    if (url.pathname === "/__dev/autolaris/pay" && method === "POST") {
      const payment = payments.get(url.searchParams.get("transaction_id") || "");
      if (!payment) return send(response, 404, { ok: false });
      payment.paid = true;
      return send(response, 200, { ok: true });
    }

    // ---- Mengantar: /api/public/<key>/* ---------------------------------
    const mengantar = /^\/api\/public\/[^/]+(\/.*)$/.exec(url.pathname);
    if (mengantar) {
      const path = mengantar[1];
      if (path === "/address/search") {
        return send(response, 200, { success: true, data: searchDevAreas(url.searchParams.get("keyword") || "") });
      }
      if (path === "/address" && method === "GET") {
        return send(response, 200, { success: true, data: pickupAddresses });
      }
      if (path === "/address" && method === "POST") {
        const body = await readBody(request);
        const id = String(body._id || "") || nextId("dev-pickup-");
        const row = {
          _id: id,
          PICKUP_NAME: String(body.PICKUP_NAME || ""),
          PICKUP_PIC: String(body.PICKUP_PIC || ""),
          PICKUP_PIC_PHONE: String(body.PICKUP_PIC_PHONE || ""),
          PICKUP_ADDRESS: String(body.PICKUP_ADDRESS || ""),
        };
        const existing = pickupAddresses.findIndex((address) => address._id === id);
        if (existing >= 0) pickupAddresses[existing] = row;
        else pickupAddresses.push(row);
        return send(response, 200, { success: true, data: row });
      }
      if (path === "/time") {
        const body = method === "POST" ? await readBody(request) : {};
        return send(response, 200, {
          success: true,
          data: method === "POST"
            ? [{ _id: nextId("dev-time-"), date: String(body.date || ""), time: String(body.time || "") }]
            : [],
        });
      }
      if (path === "/order/estimate") {
        return send(response, 200, {
          success: true,
          data: estimateDevRates(
            url.searchParams.get("origin_id") || "",
            url.searchParams.get("destination_id") || "",
            Number(url.searchParams.get("weight")) || 1,
            Number(url.searchParams.get("COD_AMOUNT")) || 0,
          ),
        });
      }
      if (path === "/order" && method === "POST") {
        const body = await readBody(request);
        const id = nextId("dev-order-");
        const cnote = `DEV${Date.now().toString().slice(-10)}`;
        const row = { _id: id, ORDER_ID: id.toUpperCase(), cnote_no: cnote, isPaid: true, status: "Order Created", payload: body };
        shipments.set(cnote, row);
        return send(response, 200, { success: true, batch_id: nextId("dev-batch-"), data: [row] });
      }
      if (path === "/order" && method === "GET") {
        const shipment = shipments.get(url.searchParams.get("tracking_id") || "");
        return send(response, 200, {
          success: true,
          data: shipment
            ? [{ cnote_no: shipment.cnote_no, ORDER_ID: shipment.ORDER_ID, status: shipment.status, history: [] }]
            : [],
        });
      }
      if (path === "/getReceiverScoreByNumberUser") {
        return send(response, 200, { success: true, data: {} });
      }
      return send(response, 404, { success: false, message: `dev-providers: ${method} ${path} is not simulated` });
    }

    if (url.pathname === "/") {
      return send(response, 200, {
        name: "AdsBookCMS dev providers",
        mengantar: "/api/public/<any-key>/…",
        autolaris: "/api/h2h/…",
        settle: "POST /__dev/autolaris/pay?transaction_id=…",
      });
    }
    return send(response, 404, { error: "not found" });
  });
}

export function startDevProviders(port: number): Promise<Server> {
  const server = createDevProviderServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.DEV_PROVIDERS_PORT) || 8788;
  await startDevProviders(port);
  console.log(`dev providers on http://127.0.0.1:${port}`);
}
