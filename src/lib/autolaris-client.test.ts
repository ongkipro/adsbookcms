import assert from "node:assert/strict";
import test from "node:test";
import {
  AutoLarisClient,
  autoLarisChannelLockReason,
  type AutoLarisCreateOrderInput,
  resolveDisabledAutoLarisChannels,
} from "./autolaris-client.ts";
import { POST as updateSettings } from "../pages/api/admin/settings.ts";

const UNAVAILABLE_MESSAGE =
  "API Key AutoLaris tersimpan, tetapi tidak dapat diverifikasi otomatis karena kontrak yang tersedia tidak menyediakan endpoint baca-saja. Tidak ada permintaan ke AutoLaris yang dikirim.";

const PROVIDER_CONFIG_ROW = {
  mengantar_api_key: null,
  mengantar_base_url: null,
  autolaris_api_key: "autolaris-secret-must-not-leak",
  autolaris_base_url: "https://autolaris.example.test",
} as const;

const CREATE_ORDER_INPUT = {
  reffId: "INV-QA-10001",
  channelCode: "QRIS",
  originAreaId: "3517100",
  destinationAreaId: "3518010",
  weightGrams: 1200,
  shipperName: "QA Warehouse",
  shipperPhone: "08123456789",
  shipperAddress: "Warehouse Street, Surabaya, Jawa Timur",
  receiverName: "QA Customer",
  receiverPhone: "081331000000",
  receiverEmail: "qa@example.test",
  receiverAddress: "Customer Street, Nganjuk, Jawa Timur",
  orderDetails: [
    { name: "QA Product - 500 ml", quantity: 2, unitPrice: 50_000 },
  ],
  amount: 118_400,
} as const satisfies AutoLarisCreateOrderInput;

test("AutoLaris credential verification is explicitly unsupported and makes no provider request", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ ket: "server error" }), { status: 500 });
  };

  const result = await new AutoLarisClient(
    "autolaris-secret-must-not-leak",
    "https://autolaris.example.test",
  ).verifyCredentials();

  assert.deepEqual(result, {
    verified: false,
    verificationSupported: false,
    message: UNAVAILABLE_MESSAGE,
  });
  assert.equal(providerCalls, 0);
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
      ...CREATE_ORDER_INPUT,
      reffId: "INV-QA-LOCKED",
      channelCode: "VABSI",
    }),
    /tidak aktif di provider/i,
  );
  assert.equal(providerCalls, 0);
});

test("AutoLaris online orders use submit with the fixed operational courir id", async (context) => {
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
      ket: "Success",
      data: {
        transaction_id: "874546",
        biaya_admin: 84,
        total: 118_484,
        payment_info: {
          va: "",
          qr: "000201010212...",
          url: "https://pay.example.test/874546",
        },
      },
    });
  };

  const payment = await new AutoLarisClient(
    "qa-key",
    "https://autolaris.example.test",
  ).createOrder(CREATE_ORDER_INPUT);

  assert.equal(requestedUrl, "https://autolaris.example.test/api/h2h/submit");
  assert.deepEqual(requestedBody, {
    reff_id: "INV-QA-10001",
    channel_code: "QRIS",
    courir_id: 1,
    origin: 3517100,
    destination: 3518010,
    weight: "1200",
    shipper_name: "QA Warehouse",
    shipper_phone: "08123456789",
    shipper_email: "",
    shipper_address: "Warehouse Street, Surabaya, Jawa Timur",
    receiver_name: "QA Customer",
    receiver_phone: "081331000000",
    receiver_email: "qa@example.test",
    receiver_address: "Customer Street, Nganjuk, Jawa Timur",
    callback_url: "",
    grand_total: "100000",
    cod_value: "0",
    remark: "AdsBookCMS INV-QA-10001",
    order_details: [
      { name: "QA Product - 500 ml", qty: "2", unit_price: "50000" },
    ],
  });
  assert.deepEqual(payment, {
    transactionId: "874546",
    virtualAccount: undefined,
    qr: "000201010212...",
    paymentCode: undefined,
    url: "https://pay.example.test/874546",
    amount: 118_400,
    admin: 84,
    total: 118_484,
  });
});

test("AutoLaris Create Order fails closed before fetch when a required area is missing", async (context) => {
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
      ...CREATE_ORDER_INPUT,
      destinationAreaId: "",
    }),
    /destination.*tidak lengkap/i,
  );
  assert.equal(providerCalls, 0);
});

test("test-autolaris returns the exact unsupported contract without leaking or probing credentials", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(null, { status: 500 });
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
  assert.deepEqual(await response.json(), {
    success: true,
    configured: true,
    verified: false,
    verification_supported: false,
    base_url: "https://autolaris.example.test",
    message: UNAVAILABLE_MESSAGE,
  });
  assert.equal(providerCalls, 0);
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

test("AutoLaris channel checks report local state as unverified without provider calls", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(null, { status: 500 });
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
  assert.equal(payload.message, `Pemeriksaan konfigurasi selesai: ${UNAVAILABLE_MESSAGE}`);
  assert.deepEqual(
    {
      api_key_configured: payload.data.api_key_configured,
      api_key_verified: payload.data.api_key_verified,
      api_key_verification_supported: payload.data.api_key_verification_supported,
    },
    {
      api_key_configured: true,
      api_key_verified: false,
      api_key_verification_supported: false,
    },
  );
  assert.deepEqual(
    payload.data.channels.find((channel) => channel.code === "QRIS"),
    {
      code: "QRIS",
      name: "QRIS",
      status: "configured_unverified",
      is_active: true,
      message: UNAVAILABLE_MESSAGE,
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
  assert.equal(providerCalls, 0);
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
