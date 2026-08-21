import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMengantarPickupAddressId,
  getActualMengantarRatePrice,
  mapMengantarStatusEvidence,
  MengantarClient,
  redactMengantarApiKey,
  selectMengantarPickupAddress,
  selectProviderShippingAdvance,
} from "./mengantar-client.ts";

test("uses the public courier price instead of Mengantar's discounted price", () => {
  assert.equal(
    getActualMengantarRatePrice({ price: 18_000, estimatedSpecialPrice: 12_000 }),
    18_000,
  );
});

test("does not fall back to a discounted price when public price is absent", () => {
  assert.equal(getActualMengantarRatePrice({ estimatedSpecialPrice: 12_000 }), null);
  assert.equal(getActualMengantarRatePrice({ price: 0, estimatedSpecialPrice: 12_000 }), null);
});

test("redacts raw and URL-encoded Mengantar API keys from errors", () => {
  const apiKey = "cmsads_live_secret/with+symbols";
  const message = `Gagal https://provider.invalid/api/public/${encodeURIComponent(apiKey)}?token=${apiKey}`;
  const sanitized = redactMengantarApiKey(message, apiKey);
  assert.doesNotMatch(sanitized, /cmsads_live_secret/);
  assert.match(sanitized, /\[REDACTED\]/);
});

const pickup = {
  _id: "pickup-real",
  PICKUP_NAME: "Gudang Utama",
  PICKUP_PIC: "Ongki",
  PICKUP_PIC_PHONE: "628123456789",
  PICKUP_ADDRESS: "Jl. Branjangan 18A",
};

test("ignores a stale pickup ID and reuses the matching Mengantar address", () => {
  assert.equal(
    selectMengantarPickupAddress([pickup], {
      addressId: "pickup-deleted",
      pickupName: "Gudang Utama",
      pickupPic: "Ongki",
      pickupPicPhone: "+62 812-3456-789",
      pickupAddress: "Jl. Branjangan 18A",
      pickupAutofill: "origin-1",
    })?._id,
    "pickup-real",
  );
});

test("extracts the provider-assigned pickup ID from address creation", () => {
  assert.equal(
    extractMengantarPickupAddressId({ _id: "pickup-created" }),
    "pickup-created",
  );
  assert.equal(extractMengantarPickupAddressId({ accepted: true }), "");
});

test("upserts a stale pickup ID using Mengantar's real matching address ID", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; body: string }> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push({
      method: init?.method || "GET",
      body: String(init?.body || ""),
    });
    return new Response(
      JSON.stringify(
        init?.method === "POST"
          ? { success: true, data: { accepted: true } }
          : { success: true, data: [pickup] },
      ),
      { status: 200 },
    );
  };

  try {
    const client = new MengantarClient(
      "test-key",
      "https://provider.invalid",
    );
    const id = await client.ensurePickupAddress({
      addressId: "pickup-deleted",
      pickupName: "Gudang Utama",
      pickupPic: "Ongki",
      pickupPicPhone: "628123456789",
      pickupAddress: "Jl. Branjangan 18A",
      pickupAutofill: "origin-1",
    });

    assert.equal(id, "pickup-real");
    assert.equal(requests.length, 2);
    assert.match(requests[1].body, /_id=pickup-real/);
    assert.doesNotMatch(requests[1].body, /pickup-deleted/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects a quote before the provider call when a provider area ID is missing", async () => {
  const client = new MengantarClient("test-key", "https://provider.invalid");

  await assert.rejects(
    client.estimateRates({
      originId: "provider-origin-id",
      destinationId: "",
      weight: 1,
    }),
    /wajib dipilih dari hasil pencarian provider/,
  );
});
test("injects x-client-source header and calls payUnpaidOrder API", async () => {
  const originalFetch = globalThis.fetch;
  let capturedHeader = "";
  let capturedBody = "";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedHeader = new Headers(init?.headers).get("x-client-source") || "";
    capturedBody = String(init?.body || "");
    return new Response(
      JSON.stringify({ success: true, cnote_no: ["TRACK123"], count: 1 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const client = new MengantarClient("test-key", "https://provider.invalid");
    const result = await client.payUnpaidOrder("batch-99", "JNE");
    assert.equal(capturedHeader, "directCall");
    assert.match(capturedBody, /batch-99/);
    assert.equal(result.success, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("looks up one Mengantar order using the documented tracking_id query", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = String(input);
    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            ORDER_ID: "MGT-100",
            cnote_no: "JNE/100 20",
            status: "{\"CREATED\":true}",
            history: [
              {
                date: "17-08-2026 09:00 Asia/Jakarta",
                desc: "Order created",
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const client = new MengantarClient("test-key", "https://provider.invalid");
    const tracking = await client.getOrderByTrackingId(" JNE/100 20 ");
    assert.equal(tracking.ORDER_ID, "MGT-100");
    assert.equal(tracking.history?.[0]?.desc, "Order created");
    assert.equal(
      capturedUrl,
      "https://provider.invalid/api/public/test-key/order?tracking_id=JNE%2F100+20",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("maps Mengantar status flags while preserving latest raw history", () => {
  const cases = [
    {
      tracking: {
        status: "{\"CREATED\":true}",
        history: [{ date: "17-08-2026 08:00 Asia/Jakarta", desc: "Order created" }],
      },
      expected: "processing",
    },
    {
      tracking: {
        status: "{\"PICKED_UP\":true}",
        history: [
          {
            date: "17-08-2026 09:00 Asia/Jakarta",
            desc: "Paket telah dijemput kurir",
          },
          {
            date: "17-08-2026 08:00 Asia/Jakarta",
            desc: "Order created",
          },
        ],
      },
      expected: "shipped",
    },
    {
      tracking: {
        status: "{\"DELIVERED_COMPLETE\":true}",
        history: [{ date: "17-08-2026 10:00 Asia/Jakarta", desc: "Delivered" }],
      },
      expected: "delivered",
    },
    {
      tracking: {
        status: "{\"RTS\":true}",
        history: [{ date: "17-08-2026 10:00 Asia/Jakarta", desc: "Return to sender" }],
      },
      expected: "returned",
    },
    {
      tracking: {
        status: "{\"DELIVERED_PENDING\":true}",
        history: [{ date: "17-08-2026 10:00 Asia/Jakarta", desc: "Need attention" }],
      },
      expected: "processing",
    },
  ] as const;

  for (const { tracking, expected } of cases) {
    assert.equal(mapMengantarStatusEvidence(tracking).shippingStatus, expected);
  }
  assert.deepEqual(mapMengantarStatusEvidence(cases[1].tracking), {
    shippingStatus: "shipped",
    description: "Paket telah dijemput kurir",
    occurredAt: "2026-08-17T02:00:00.000Z",
  });
});

test("selects only monotonic provider lifecycle advances", () => {
  assert.equal(selectProviderShippingAdvance("pending", "processing"), "processing");
  assert.equal(selectProviderShippingAdvance("processing", "shipped"), "shipped");
  assert.equal(selectProviderShippingAdvance("shipped", "processing"), null);
  assert.equal(selectProviderShippingAdvance("delivered", "returned"), null);
  assert.equal(selectProviderShippingAdvance("returned", "delivered"), null);
  assert.equal(selectProviderShippingAdvance("cancelled", "delivered"), null);
});
