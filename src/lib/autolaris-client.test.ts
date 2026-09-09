import assert from "node:assert/strict";
import test from "node:test";
import {
  AutoLarisClient,
  autoLarisChannelLockReason,
  buildAutoLarisCreateOrderPayload,
  type AutoLarisCreateOrderInput,
  resolveDisabledAutoLarisChannels,
} from "./autolaris-client.ts";
import { POST as updateSettings } from "../pages/api/admin/settings.ts";

const VERIFIED_MESSAGE = "Koneksi AutoLaris aktif: 3 channel tersedia.";

const CHANNEL_CATALOGUE = {
  rc: "00",
  ket: "Sukses",
  data: [
    { channel_code: "QRIS", name: "QRIS", admin: "0.7", tipe_admin: "persen" },
    { channel_code: "VABCA", name: "Bank BCA", admin: "6500.0", tipe_admin: "fix" },
    { channel_code: "VABNI", name: "Bank BNI", admin: "3000.0", tipe_admin: "fix" },
  ],
};

const PROVIDER_CONFIG_ROW = {
  mengantar_api_key: null,
  mengantar_base_url: null,
  autolaris_api_key: "autolaris-secret-must-not-leak",
  autolaris_base_url: "https://autolaris.example.test",
} as const;

test("AutoLaris credential verification reads the provider channel catalogue", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  let requestedMethod = "";
  let sentAuthorization = "";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedMethod = String(init?.method || "GET");
    sentAuthorization = String(
      new Headers(init?.headers).get("Authorization") || "",
    );
    return Response.json(CHANNEL_CATALOGUE);
  };

  const result = await new AutoLarisClient(
    "autolaris-secret-must-not-leak",
    "https://autolaris.example.test",
  ).verifyCredentials();

  assert.deepEqual(result, {
    verified: true,
    verificationSupported: true,
    channels: ["QRIS", "VABCA", "VABNI"],
    message: VERIFIED_MESSAGE,
  });
  // list_payment is the one AutoLaris read that creates nothing.
  assert.equal(requestedUrl, "https://autolaris.example.test/api/h2h/list_payment");
  assert.equal(requestedMethod, "GET");
  assert.equal(sentAuthorization, "Bearer autolaris-secret-must-not-leak");
});

test("AutoLaris credential verification reports a rejected key without throwing", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json({ rc: "01", ket: "Invalid parameter", data: [] });

  const result = await new AutoLarisClient(
    "wrong-key",
    "https://autolaris.example.test",
  ).verifyCredentials();

  assert.equal(result.verified, false);
  assert.equal(result.verificationSupported, true);
  assert.match(result.message, /invalid parameter/i);
});

test("provider-locked AutoLaris channels cannot be removed from the disabled policy", () => {
  assert.equal(autoLarisChannelLockReason("VABSI"), "Tidak aktif di provider.");
  assert.equal(autoLarisChannelLockReason("VABCA"), undefined);
  assert.deepEqual(resolveDisabledAutoLarisChannels(["VABCA", "UNKNOWN"]), [
    "VABCA",
    "VABSI",
    "VACIMB",
    "VADANAMON",
  ]);
});

test("provider-locked AutoLaris channels fail before an outbound payment request", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(null, { status: 500 });
  };

  await assert.rejects(
    new AutoLarisClient("qa-key").createOrder({
      ...digitalOrderInput(),
      channelCode: "VABSI",
    }),
    /tidak aktif di provider/i,
  );
  assert.equal(providerCalls, 0);
});

test("AutoLaris Create Order maps nested QRIS instructions and provider expiry", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  let requestedBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      rc: "00",
      ket: "Sukses",
      data: {
        transaction_id: "874546",
        biaya_admin: 84,
        total: 118_484,
        payment_info: {
          expired: "2026-09-03 16:42:00",
          va: "",
          qr: "000201010212...",
          url: "",
        },
      },
    });
  };

  const payment = await new AutoLarisClient(
    "qa-key",
    "https://autolaris.example.test",
  ).createOrder(digitalOrderInput());

  assert.equal(
    requestedUrl,
    "https://autolaris.example.test/api/h2h/submit",
  );
  assert.equal(requestedBody?.courir_id, 1);
  assert.equal(requestedBody?.channel_code, "QRIS");
  assert.deepEqual(payment, {
    transactionId: "874546",
    virtualAccount: undefined,
    qr: "000201010212...",
    paymentCode: undefined,
    url: undefined,
    amount: 12_000,
    admin: 84,
    total: 118_484,
    expiresAt: "2026-09-03T09:42:00.000Z",
  });
});

test("an unpaid AutoLaris transaction reads back as pending and nothing else", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let requestedUrl = "";
  let requestedBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ rc: "02", ket: "PENDING", data: { awb: "" } });
  };

  const inquiry = await new AutoLarisClient(
    "qa-key",
    "https://autolaris.example.test",
  ).inquirePayment("956123");

  assert.equal(requestedUrl, "https://autolaris.example.test/api/h2h/advice");
  assert.deepEqual(requestedBody, { transaction_id: "956123" });
  assert.deepEqual(inquiry, {
    code: "02",
    status: "PENDING",
    awb: undefined,
    settlement: "pending",
  });
});

test("Advice accepts only rc 00 with an explicit settled status as paid", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json({ rc: "00", ket: "PAID", data: { awb: "" } });

  const inquiry = await new AutoLarisClient("qa-key").inquirePayment("956123");

  assert.equal(inquiry.settlement, "paid");

  // The provider's own guide names these as unsafe: `SUCCESS` and `BERHASIL`
  // are too generic, and `rc: "00"` means the API call succeeded rather than
  // the payment. Reading either as settled marks an order paid that may not be.
  for (const generic of ["SUCCESS", "BERHASIL"]) {
    globalThis.fetch = async () =>
      Response.json({ rc: "00", ket: generic, data: { awb: "" } });
    const ambiguous = await new AutoLarisClient("qa-key").inquirePayment("956125");
    assert.equal(
      ambiguous.settlement,
      "unproven",
      `${generic} is too generic to settle a payment`,
    );
  }

  // `DELIVERED` is shipping vocabulary and never settlement.
  globalThis.fetch = async () =>
    Response.json({ rc: "00", ket: "DELIVERED", data: { awb: "" } });
  const shipping = await new AutoLarisClient("qa-key").inquirePayment("956126");
  assert.equal(shipping.settlement, "unproven");

  globalThis.fetch = async () =>
    Response.json({ rc: "00", ket: "UNKNOWN", data: { awb: "" } });
  const unknown = await new AutoLarisClient("qa-key").inquirePayment("956124");
  assert.equal(unknown.settlement, "unproven");
});

test("test-autolaris verifies the stored key against the provider without leaking it", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let providerCalls = 0;
  globalThis.fetch = async (input) => {
    providerCalls += 1;
    assert.equal(
      String(input),
      "https://autolaris.example.test/api/h2h/list_payment",
    );
    return Response.json(CHANNEL_CATALOGUE);
  };

  const database = {
    prepare(query: string) {
      assert.match(query, /SELECT mengantar_api_key, mengantar_base_url, autolaris_api_key, autolaris_base_url/);
      return {
        async first() {
          return PROVIDER_CONFIG_ROW;
        },
      };
    },
  };

  const response = await updateSettings({
    request: new Request("https://store.example.test/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test-autolaris" }),
    }),
    locals: { runtimeEnv: { OMS_DB: database } },
  } as never);

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload, {
    success: true,
    configured: true,
    verified: true,
    verification_supported: true,
    base_url: "https://autolaris.example.test",
    message: VERIFIED_MESSAGE,
  });
  assert.equal(providerCalls, 1);
  assert.equal(JSON.stringify(payload).includes(PROVIDER_CONFIG_ROW.autolaris_api_key), false);
});

test("only the owner may replace provider endpoints or credentials", async () => {
  let databaseReads = 0;
  const response = await updateSettings({
    request: new Request("https://store.example.test/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-integrations", integrations: {} }),
    }),
    locals: {
      admin: { username: "admin-test", role: "admin", mustChangePassword: false },
      runtimeEnv: {
        OMS_DB: {
          prepare() {
            databaseReads += 1;
            throw new Error("database must not be reached");
          },
        },
      },
    },
  } as never);

  assert.equal(response.status, 403);
  assert.equal(databaseReads, 0);
});

test("AutoLaris channel checks report verified provider state", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json(CHANNEL_CATALOGUE);
  };

  const database = {
    prepare(query: string) {
      if (query.includes("SELECT mengantar_api_key")) {
        return {
          async first() {
            return PROVIDER_CONFIG_ROW;
          },
        };
      }
      assert.match(query, /FROM stores s\s+LEFT JOIN warehouses/);
      return {
        async first() {
          return {
            store_id: 1,
            is_autolaris_enabled: 1,
            disabled_autolaris_channels: "VABCA",
          };
        },
      };
    },
  };

  const response = await updateSettings({
    request: new Request("https://store.example.test/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test-autolaris-channels" }),
    }),
    locals: { runtimeEnv: { OMS_DB: database } },
  } as never);

  assert.equal(response.status, 200);
  const payload = (await response.json()) as {
    success: boolean;
    message: string;
    data: {
      api_key_configured: boolean;
      api_key_verified: boolean;
      api_key_verification_supported: boolean;
      channels: Array<{ code: string; status: string; is_active: boolean; message: string }>;
    };
  };
  assert.equal(payload.success, true);
  assert.match(payload.message, /terverifikasi aktif oleh server AutoLaris/i);
  assert.deepEqual(
    {
      api_key_configured: payload.data.api_key_configured,
      api_key_verified: payload.data.api_key_verified,
      api_key_verification_supported: payload.data.api_key_verification_supported,
    },
    {
      api_key_configured: true,
      api_key_verified: true,
      api_key_verification_supported: true,
    },
  );
  assert.deepEqual(
    payload.data.channels.find((channel) => channel.code === "QRIS"),
    {
      code: "QRIS",
      name: "QRIS",
      status: "ready",
      is_active: true,
      message: "Channel aktif & siap digunakan di checkout.",
    },
  );
  assert.deepEqual(
    payload.data.channels.find((channel) => channel.code === "VABCA"),
    {
      code: "VABCA",
      name: "Virtual Account BCA",
      status: "disabled_by_store",
      is_active: false,
      message: "Dinonaktifkan oleh toko (Disembunyikan dari checkout).",
    },
  );
  assert.deepEqual(
    payload.data.channels.find((channel) => channel.code === "VABSI"),
    {
      code: "VABSI",
      name: "Virtual Account BSI",
      status: "locked_by_provider",
      is_active: false,
      message: "Tidak aktif di provider.",
    },
  );
  assert.equal(payload.data.channels.length, 9);
  assert.equal(payload.data.channels.some((channel) => channel.code === "DANA"), false);
  assert.equal(providerCalls, 1);
});

test("save-autolaris-channels keeps provider-locked channels disabled", async () => {
  let persistedDisabled = "";
  let runtimeDdl = 0;
  const database = {
    prepare(query: string) {
      if (query.includes("SELECT mengantar_api_key")) {
        return { async first() { return PROVIDER_CONFIG_ROW; } };
      }
      if (query.includes("FROM stores s")) {
        return {
          async first() {
            return { store_id: 1, is_autolaris_enabled: 1 };
          },
        };
      }
      if (query.includes("ALTER TABLE stores")) {
        runtimeDdl += 1;
        return { async run() { return { success: true }; } };
      }
      assert.match(query, /UPDATE stores SET disabled_autolaris_channels/);
      return {
        bind(value: string, storeId: number) {
          assert.equal(storeId, 1);
          persistedDisabled = value;
          return { async run() { return { success: true }; } };
        },
      };
    },
  };

  const response = await updateSettings({
    request: new Request("https://store.example.test/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-autolaris-channels",
        disabled_autolaris_channels: [],
      }),
    }),
    locals: { runtimeEnv: { OMS_DB: database } },
  } as never);

  assert.equal(response.status, 200);
  assert.equal(runtimeDdl, 0);
  const payload = (await response.json()) as {
    data: { disabled_autolaris_channels: string[] };
  };
  assert.deepEqual(payload.data.disabled_autolaris_channels, [
    "VABSI",
    "VACIMB",
    "VADANAMON",
  ]);
  assert.equal(persistedDisabled, "VABSI,VACIMB,VADANAMON");
});

test("payment master settings reject missing boolean values", async () => {
  let updateCalls = 0;
  const database = {
    prepare(query: string) {
      if (query.includes("SELECT mengantar_api_key")) {
        return { async first() { return PROVIDER_CONFIG_ROW; } };
      }
      if (query.includes("FROM stores s")) {
        return { async first() { return { store_id: 1 }; } };
      }
      if (query.includes("UPDATE stores SET is_cod_enabled")) {
        updateCalls += 1;
      }
      return { async run() { return { success: true }; } };
    },
  };

  const response = await updateSettings({
    request: new Request("https://store.example.test/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save-payment-toggles",
        is_cod_enabled: false,
      }),
    }),
    locals: { runtimeEnv: { OMS_DB: database } },
  } as never);

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /harus berupa boolean/i);
  assert.equal(updateCalls, 0);
});

function digitalOrderInput(
  overrides: Partial<AutoLarisCreateOrderInput> = {},
): AutoLarisCreateOrderInput {
  return {
    reffId: "10041",
    channelCode: "QRIS",
    origin: "3517100",
    destination: "3517100",
    shipperName: "Toko Testing",
    shipperPhone: "08123456789",
    shipperEmail: "toko@example.test",
    shipperAddress: "Alamat toko",
    receiverName: "Buyer",
    receiverPhone: "081331000000",
    receiverEmail: "buyer@example.test",
    receiverAddress: "Gang buntu no 5 Sidoarjo",
    grandTotal: 12000,
    orderDetails: [{ name: "Produk digital", qty: 1, unitPrice: 12000 }],
    ...overrides,
  };
}

test("createOrder payload defaults to courir_id 1 and prepaid cod_value 0", () => {
  const payload = buildAutoLarisCreateOrderPayload(digitalOrderInput());
  assert.equal(payload.courir_id, 1);
  assert.equal(payload.cod_value, "0");
  assert.equal(payload.reff_id, "10041");
  assert.equal(payload.grand_total, "12000");
  // Amounts and quantities cross the wire as strings, the shape the provider's
  // examples use.
  assert.deepEqual(payload.order_details, [
    { name: "Produk digital", qty: "1", unit_price: "12000" },
  ]);
});

test("createOrder rejects a non-numeric reff_id, like the payment path", () => {
  assert.throws(
    () => buildAutoLarisCreateOrderPayload(digitalOrderInput({ reffId: "INV-10041" })),
    /angka/i,
  );
});

test("createOrder rejects an empty order and a non-positive grand total", () => {
  assert.throws(
    () => buildAutoLarisCreateOrderPayload(digitalOrderInput({ orderDetails: [] })),
    /tidak boleh kosong/i,
  );
  assert.throws(
    () => buildAutoLarisCreateOrderPayload(digitalOrderInput({ grandTotal: 0 })),
    /positif/i,
  );
});

test("createOrder carries an explicit COD value through unchanged", () => {
  const payload = buildAutoLarisCreateOrderPayload(
    digitalOrderInput({ codValue: 20150, courirId: 2 }),
  );
  assert.equal(payload.cod_value, "20150");
  assert.equal(payload.courir_id, 2);
});
