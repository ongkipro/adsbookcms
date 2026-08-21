import assert from "node:assert/strict";
import test from "node:test";
import {
  AutoLarisClient,
  autoLarisChannelLockReason,
  type AutoLarisCreatePaymentInput,
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

const CREATE_PAYMENT_INPUT = {
  reffId: "10001",
  channelCode: "QRIS",
  customerId: "42",
  customerName: "QA Customer",
  customerPhone: "081331000000",
  customerEmail: "qa@example.test",
  // 10:00 WIB, so the provider-facing `expired` proves the timezone shift.
  expiresAt: new Date("2026-08-20T03:00:00.000Z"),
  amount: 118_400,
  callbackUrl: "https://store.example.test/api/webhooks/autolaris",
} as const satisfies AutoLarisCreatePaymentInput;

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
    new AutoLarisClient("qa-key").createPayment({
      ...CREATE_PAYMENT_INPUT,
      channelCode: "VABSI",
    }),
    /tidak aktif di provider/i,
  );
  assert.equal(providerCalls, 0);
});

test("AutoLaris online checkout creates a payment and never a shipment", async (context) => {
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
        trx_id: "874546",
        virtual_account: "",
        qr: "000201010212...",
        payment_code: "",
        url: "",
        amount: 118_400,
        admin: 84,
        total: 118_484,
      },
    });
  };

  const payment = await new AutoLarisClient(
    "qa-key",
    "https://autolaris.example.test",
  ).createPayment(CREATE_PAYMENT_INPUT);

  assert.equal(
    requestedUrl,
    "https://autolaris.example.test/api/h2h/create_payment",
  );
  // No origin, destination, courier or parcel field may reach the gateway:
  // shipping is Mengantar's, and /submit would register a shipment nobody ships.
  assert.deepEqual(requestedBody, {
    reff_id: "10001",
    channel_code: "QRIS",
    customer_id: "42",
    customer_name: "QA Customer",
    customer_phone: "081331000000",
    customer_email: "qa@example.test",
    expired: "20260820100000",
    amount: "118400",
    callback_url: "https://store.example.test/api/webhooks/autolaris",
  });
  assert.deepEqual(payment, {
    transactionId: "874546",
    virtualAccount: undefined,
    qr: "000201010212...",
    paymentCode: undefined,
    url: undefined,
    amount: 118_400,
    admin: 84,
    total: 118_484,
  });
});

test("AutoLaris rejects the store order number, so the payload fails before fetch", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(null, { status: 500 });
  };

  // The provider answers `rc: "01" / Invalid parameter` for each of these, with
  // no field named, so a customer must never be the one who discovers them.
  await assert.rejects(
    new AutoLarisClient("qa-key").createPayment({
      ...CREATE_PAYMENT_INPUT,
      reffId: "INV-10001",
    }),
    /referensi AutoLaris harus berupa angka/i,
  );
  await assert.rejects(
    new AutoLarisClient("qa-key").createPayment({
      ...CREATE_PAYMENT_INPUT,
      customerId: "",
    }),
    /id pembeli AutoLaris tidak lengkap/i,
  );
  await assert.rejects(
    new AutoLarisClient("qa-key").createPayment({
      ...CREATE_PAYMENT_INPUT,
      callbackUrl: "",
    }),
    /callback AutoLaris tidak lengkap/i,
  );
  assert.equal(providerCalls, 0);
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

test("an unobserved AutoLaris settlement code is never read as paid", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () =>
    Response.json({ rc: "00", ket: "SUCCESS", data: { awb: "" } });

  const inquiry = await new AutoLarisClient("qa-key").inquirePayment("956123");

  // `00` plausibly means settled, but no settled transaction has been observed.
  // Until one is, it stays unproven and cannot move money-bearing state.
  assert.equal(inquiry.settlement, "unproven");
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
