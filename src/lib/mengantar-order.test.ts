import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMengantarOrderPayload,
  parseMengantarDispatchResponse,
  resolveAcceptedMengantarShipment,
  resolveMengantarPickupSlot,
  runMengantarOrderQueue,
  summarizeMengantarDispatchResults,
} from "./mengantar-order.ts";

test("builds canonical Mengantar order payload for COD", () => {
  const payload = buildMengantarOrderPayload({
    orderNumber: "INV-20260810-AAAA",
    courierCode: "JNE",
    pickupAddressId: "pickup_123",
    destinationAreaId: "dest_456",
    customerName: " Customer One ",
    customerPhone: "0812-3456-7890",
    customerAddress: "Jl. Merdeka 10",
    productTitle: "Pupuk Aussies",
    variantTitle: "1 Liter",
    unitWeightKg: 1.2,
    quantity: 2,
    paymentMethod: "cod",
    goodsAmount: 300000,
    collectedAmount: 320000,
  });

  assert.equal(payload.courier, "JNE");
  assert.equal(payload.pickup.type, "dropOff");
  assert.equal(payload.pickup.address_id, "pickup_123");
  assert.equal(payload.orders.length, 1);

  const first = payload.orders[0] as Record<string, unknown>;
  assert.equal(first.customerName, "Customer One");
  assert.equal(first.customerPhone, "081234567890");
  assert.equal(first.customerAddressDataId, "dest_456");
  assert.equal(first.parcelContent, "Pupuk Aussies - 1 Liter");
  assert.equal(first.weight, 2.4);
  assert.equal(first.quantity, 2);
  assert.equal(first.COD, 320000);
  assert.equal(first.goodsValue, undefined);
});

test("parses successful Mengantar dispatch response", () => {
  const parsed = parseMengantarDispatchResponse({
    success: true,
    batch_id: "batch_99",
    data: [
      {
        _id: "mgt_ord_1",
        ORDER_ID: "MGT123456",
        cnote_no: "1100099988",
        isPaid: true,
      },
    ],
  });

  assert.equal(parsed.providerOrderId, "mgt_ord_1");
  assert.equal(parsed.providerOrderCode, "MGT123456");
  assert.equal(parsed.providerBatchId, "batch_99");
  assert.equal(parsed.cnoteNo, "1100099988");
  assert.equal(parsed.isPaid, true);
});

test("rejects an unaccepted Mengantar response even when it contains an ID", () => {
  assert.throws(
    () => parseMengantarDispatchResponse({
      success: false,
      data: [{ _id: "rejected-provider-id" }],
    }),
    /tidak mengonfirmasi penerimaan order/,
  );
});

test("preserves Mengantar unpaid shipment drafts without a tracking number", () => {
  const parsed = parseMengantarDispatchResponse({
    success: true,
    batch_id: "batch_unpaid",
    data: [
      {
        _id: "mgt_unpaid_1",
        ORDER_ID: "MGT-UNPAID-1",
        cnote_no: null,
        isPaid: false,
      },
    ],
  });

  assert.equal(parsed.providerOrderId, "mgt_unpaid_1");
  assert.equal(parsed.cnoteNo, null);
  assert.equal(parsed.isPaid, false);
});
test("accepted paid and unpaid provider orders transition into Shipping", () => {
  const acceptedAt = "2026-08-11T10:00:00.000Z";
  const paid = resolveAcceptedMengantarShipment(
    "bank_transfer",
    {
      providerOrderId: "mgt_paid_1",
      providerOrderCode: "MGT-PAID-1",
      providerBatchId: "batch-paid",
      cnoteNo: "WAYBILL-PAID-1",
      isPaid: true,
    },
    acceptedAt,
  );
  const draft = resolveAcceptedMengantarShipment(
    "bank_transfer",
    {
      providerOrderId: "mgt_draft_1",
      providerOrderCode: "MGT-DRAFT-1",
      providerBatchId: "batch-draft",
      cnoteNo: null,
      isPaid: false,
    },
    acceptedAt,
  );

  assert.deepEqual(paid, {
    outcome: "dispatched",
    shippingStatus: "processing",
    providerOrderId: "mgt_paid_1",
    providerBatchId: "batch-paid",
    cnoteNo: "WAYBILL-PAID-1",
    providerDispatchError: null,
    providerDispatchedAt: acceptedAt,
  });
  assert.deepEqual(draft, {
    outcome: "unpaid",
    shippingStatus: "processing",
    providerOrderId: "mgt_draft_1",
    providerBatchId: "batch-draft",
    cnoteNo: null,
    providerDispatchError: "MENGANTAR_WALLET_UNPAID",
    providerDispatchedAt: null,
  });
});

test("normalizes a pickup date to the verified Jakarta provider slot", () => {
  assert.deepEqual(resolveMengantarPickupSlot("2026-08-11T03:00:00.000Z"), {
    date: "08-11-2026",
    time: "9:00 - 18:00",
    scheduledAt: "2026-08-11T02:00:00.000Z",
  });
  assert.throws(
    () => resolveMengantarPickupSlot("not-a-date"),
    /Jadwal pickup tidak valid/,
  );
});

test("runs Mengantar order requests sequentially", async () => {
  let active = 0;
  let peak = 0;
  const order = [] as number[];
  const firstDispatch = Promise.withResolvers<void>();

  const pending = runMengantarOrderQueue([11, 22, 33], async (orderId) => {
    active += 1;
    peak = Math.max(peak, active);
    order.push(orderId);
    if (orderId === 11) await firstDispatch.promise;
    active -= 1;
    return { status: "dispatched", providerOrderId: `provider-${orderId}` };
  });
  await Promise.resolve();
  assert.equal(active, 1);
  assert.deepEqual(order, [11]);
  firstDispatch.resolve();
  const results = await pending;

  assert.equal(peak, 1);
  assert.deepEqual(order, [11, 22, 33]);
  assert.deepEqual(
    results.map(({ orderId, providerOrderId }) => ({ orderId, providerOrderId })),
    [
      { orderId: 11, providerOrderId: "provider-11" },
      { orderId: 22, providerOrderId: "provider-22" },
      { orderId: 33, providerOrderId: "provider-33" },
    ],
  );
});
test("continues a batch after one dispatch rejects", async () => {
  const results = await runMengantarOrderQueue([11, 22, 33], async (orderId) => {
    if (orderId === 22) throw new Error("Provider timeout");
    return { status: "dispatched", providerOrderId: `provider-${orderId}` };
  });

  assert.deepEqual(
    results.map(({ orderId, status, error }) => ({ orderId, status, error })),
    [
      { orderId: 11, status: "dispatched", error: undefined },
      { orderId: 22, status: "failed", error: "Provider timeout" },
      { orderId: 33, status: "dispatched", error: undefined },
    ],
  );
});


test("summarizes batch partial success without hiding per-order failures", () => {
  const results = [
    { orderId: 11, status: "dispatched" },
    { orderId: 22, status: "unpaid" },
    { orderId: 33, status: "failed", error: "Provider timeout" },
    { orderId: 44, status: "waiting_for_payment" },
    { orderId: 55, status: "already_dispatched" },
  ];
  assert.deepEqual(summarizeMengantarDispatchResults(results), {
    accepted: 2,
    created: 1,
    unpaid: 1,
    failed: 1,
    skipped: 2,
  });
  assert.deepEqual(results[2], {
    orderId: 33,
    status: "failed",
    error: "Provider timeout",
  });
});
