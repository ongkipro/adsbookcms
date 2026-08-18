import {
  calculateCodCustomerTotal,
  calculateCodFeeBreakdown,
  normalizePaymentFeeBearer,
  type PaymentFeeBearer,
} from "./payment-fee-policy.ts";
import { paymentBrandLabel } from "./payment-brand.ts";
import { isValidWa62, normalizePhone } from "./validation.ts";

export type PersistOrderInput = {
  submitToken: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: string;
  province: string;
  city: string;
  district: string;
  postalCode?: string;
  variantKey: string;
  quantity: number;
  shippingCost: number;
  paymentMethod: "cod" | "bank_transfer" | "qris" | "manual_transfer";
  sellerBankAccountId?: number;
  warehouseId?: number;
  destinationAreaId?: string;
  courierCode?: string;
  courierService?: string;
  adClickIds?: string;
};

export type PersistedOrder = {
  id: number;
  orderNumber: string;
  publicStatusToken: string;
  totalAmount: number;
  unitPrice: number;
  codServiceFee: number;
  codServiceFeeVat: number;
  codFeeBearer: PaymentFeeBearer;
  sellerBankAccountId?: number;
  sellerBankCode?: string;
  sellerBankName?: string;
  sellerAccountHolder?: string;
  sellerAccountNumber?: string;
};

export class DuplicateSubmissionError extends Error {}
export class OrderInputError extends Error {}

export type OrderNumberPrefix = "INV" | "ABN";

/**
 * Advances the one store-wide order sequence in a single D1 statement.
 *
 * Completed and abandoned orders deliberately share a sequence. An abandoned
 * number can therefore be promoted by changing only its prefix without ever
 * colliding with a completed order allocated in the meantime.
 */
export async function allocateOrderNumber(
  database: D1Database,
  prefix: OrderNumberPrefix,
): Promise<string> {
  const row = await database
    .prepare(
      `UPDATE order_number_counters
       SET last_value = last_value + 1,
           updated_at = ?
       WHERE counter_name = 'orders'
       RETURNING last_value`,
    )
    .bind(new Date().toISOString())
    .first<{ last_value: number }>();
  const value = Number(row?.last_value);
  if (!Number.isInteger(value) || value <= 10000) {
    throw new Error("Nomor order gagal dialokasikan.");
  }
  return `${prefix}-${value}`;
}

function completedNumberFromAbandoned(orderNumber: string): string {
  if (!/^ABN-\d{5,}$/.test(orderNumber)) {
    throw new Error("Nomor pesanan tertinggal tidak valid.");
  }
  return `INV-${orderNumber.slice(4)}`;
}

export const ABANDONED_RETENTION_DAYS = 7;

export async function purgeExpiredAbandonedOrders(
  database: D1Database,
  now = new Date(),
): Promise<number> {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Waktu retensi tidak valid.");
  }
  const cutoff = now.toISOString();
  const eligibleOrderIds = `SELECT id
    FROM orders
    WHERE shipping_status = 'abandoned'
      AND payment_status = 'unpaid'
      AND unixepoch(created_at) < unixepoch(?, '-${ABANDONED_RETENTION_DAYS} days')`;
  const results = await database.batch([
    database
      .prepare(
        `DELETE FROM payment_transactions
         WHERE order_id IN (${eligibleOrderIds})`,
      )
      .bind(cutoff),
    database
      .prepare(
        `DELETE FROM order_items
         WHERE order_id IN (${eligibleOrderIds})`,
      )
      .bind(cutoff),
    database
      .prepare(
        `DELETE FROM orders
         WHERE id IN (${eligibleOrderIds})`,
      )
      .bind(cutoff),
  ]);
  return Number(results[2]?.meta?.changes ?? 0);
}

export type RecordAbandonedOrderInput = {
  customerName: string;
  customerPhone: string;
  address?: string;
  province?: string;
  totalAmount?: number;
  variantId?: number;
};

export type RecordedAbandonedOrder = {
  id: number;
  orderNumber: string;
  customerPhone: string;
  action: "created" | "updated";
};

export async function recordAbandonedOrder(
  database: D1Database,
  input: RecordAbandonedOrderInput,
): Promise<RecordedAbandonedOrder> {
  const customerName = input.customerName.trim();
  const customerPhone = normalizePhone(input.customerPhone);
  if (customerName.length < 3) {
    throw new OrderInputError("Nama pelanggan minimal 3 karakter.");
  }
  if (!isValidWa62(customerPhone)) {
    throw new OrderInputError("Nomor WhatsApp tidak valid.");
  }
  const address = input.address?.trim() || "";
  const province = input.province?.trim() || "";
  const selectedVariant = input.variantId && input.variantId > 0
    ? await database
        .prepare(
          `SELECT pv.id, pv.price
           FROM product_variants pv
           INNER JOIN products p ON p.id = pv.product_id
           WHERE pv.id = ? AND p.is_active = 1
           LIMIT 1`,
        )
        .bind(input.variantId)
        .first<{ id: number; price: number }>()
    : null;
  const totalAmount = selectedVariant
    ? Math.max(0, Math.round(Number(selectedVariant.price) || 0))
    : 0;
  const createdAt = new Date().toISOString();
  const existing = await database
    .prepare(
      `SELECT id, order_number
       FROM orders
       WHERE customer_phone = ?
         AND shipping_status = 'abandoned'
         AND unixepoch(created_at) >= unixepoch('now', '-2 hours')
       ORDER BY id DESC
       LIMIT 1`,
    )
    .bind(customerPhone)
    .first<{ id: number; order_number: string }>();

  if (existing) {
    const statements = [database
      .prepare(
        `UPDATE orders
         SET customer_name = ?,
             address = COALESCE(NULLIF(?, ''), address),
             province = COALESCE(NULLIF(?, ''), province),
             total_amount = ?,
             payment_status = 'unpaid',
             shipping_status = 'abandoned',
             created_at = ?
         WHERE id = ? AND shipping_status = 'abandoned'`,
      )
      .bind(
        customerName,
        address,
        province,
        totalAmount,
        createdAt,
        existing.id,
      )
    ];
    if (selectedVariant) {
      statements.push(
        database
          .prepare("DELETE FROM order_items WHERE order_id = ?")
          .bind(existing.id),
        database
          .prepare(
            `INSERT INTO order_items (order_id, variant_id, quantity, unit_price)
             VALUES (?, ?, 1, ?)`,
          )
          .bind(existing.id, selectedVariant.id, totalAmount),
      );
    }
    await database.batch(statements);
    return {
      id: existing.id,
      orderNumber: existing.order_number,
      customerPhone,
      action: "updated",
    };
  }

  const store = await database
    .prepare("SELECT id FROM stores ORDER BY id LIMIT 1")
    .first<{ id: number }>();
  if (!store) throw new Error("Store belum dikonfigurasi.");

  const orderNumber = await allocateOrderNumber(database, "ABN");
  const statements = [
    database
      .prepare(
        `INSERT INTO orders (
          order_number, store_id, customer_name, customer_phone,
          address, province, city, district,
          payment_method, payment_status, shipping_status,
          total_amount, shipping_cost, discount_amount, cod_service_fee,
          cod_service_fee_vat, cod_fee_bearer, created_at
        )
        SELECT
          ?, ?, ?, ?,
          ?, ?, '', '',
          'cod', 'unpaid', 'abandoned',
          ?, 0, 0, 0,
          0, 'buyer', ?
        WHERE NOT EXISTS (
          SELECT 1
          FROM orders
          WHERE customer_phone = ?
            AND shipping_status = 'abandoned'
            AND unixepoch(created_at) >= unixepoch('now', '-2 hours')
        )`,
      )
      .bind(
        orderNumber,
        store.id,
        customerName,
        customerPhone,
        address,
        province || "ID-JK",
        totalAmount,
        createdAt,
        customerPhone,
      ),
  ];
  if (selectedVariant) {
    statements.push(
      database
        .prepare(
          `INSERT INTO order_items (order_id, variant_id, quantity, unit_price)
           SELECT o.id, pv.id, 1, ?
           FROM orders o
           INNER JOIN product_variants pv ON pv.id = ?
           WHERE o.order_number = ?`,
        )
        .bind(totalAmount, selectedVariant.id, orderNumber),
    );
  }
  statements.push(
    database
      .prepare(
        `SELECT id, order_number
         FROM orders
         WHERE customer_phone = ?
           AND shipping_status = 'abandoned'
           AND unixepoch(created_at) >= unixepoch('now', '-2 hours')
         ORDER BY id DESC
         LIMIT 1`,
      )
      .bind(customerPhone),
  );
  const results = await database.batch(statements);
  const row = results.at(-1)?.results?.[0] as
    | { id?: number; order_number?: string }
    | undefined;
  if (!row?.id || !row.order_number) {
    throw new Error("Pesanan tertinggal gagal disimpan.");
  }
  return {
    id: row.id,
    orderNumber: row.order_number,
    customerPhone,
    action: "created",
  };
}


export async function persistOrder(
  database: D1Database,
  input: PersistOrderInput,
): Promise<PersistedOrder> {
  const variant = await database
    .prepare(
      `
      SELECT pv.id, pv.price, pv.stock
      FROM product_variants pv
      INNER JOIN products p ON p.id = pv.product_id
      WHERE (CAST(pv.id AS TEXT) = ? OR pv.sku = ?)
        AND p.is_active = 1
      LIMIT 1
    `,
    )
    .bind(input.variantKey, input.variantKey)
    .first<{ id: number; price: number; stock: number | null }>();
  if (!variant) throw new OrderInputError("Varian produk tidak ditemukan.");
  if (variant.stock !== null && variant.stock < input.quantity)
    throw new OrderInputError("Stok produk tidak mencukupi.");

  const store = await database
    .prepare("SELECT id, cod_fee_bearer FROM stores ORDER BY id LIMIT 1")
    .first<{ id: number; cod_fee_bearer: string | null }>();
  if (!store) throw new Error("Store belum dikonfigurasi.");
  const sellerBankAccount =
    input.paymentMethod === "manual_transfer"
      ? await database
          .prepare(
            `SELECT id, bank_code, account_holder, account_number
             FROM seller_bank_accounts
             WHERE id = ? AND store_id = ? AND is_active = 1
             LIMIT 1`,
          )
          .bind(input.sellerBankAccountId || 0, store.id)
          .first<{
            id: number;
            bank_code: string;
            account_holder: string;
            account_number: string;
          }>()
      : null;
  if (input.paymentMethod === "manual_transfer" && !sellerBankAccount) {
    throw new OrderInputError("Rekening transfer tidak tersedia.");
  }

  const abandonedOrder = await database
    .prepare(
      `SELECT id, order_number, public_status_token
       FROM orders
       WHERE customer_phone = ?
         AND shipping_status = 'abandoned'
         AND unixepoch(created_at) >= unixepoch('now', '-2 hours')
       ORDER BY id DESC
       LIMIT 1`,
    )
    .bind(input.customerPhone)
    .first<{
      id: number;
      order_number: string;
      public_status_token: string | null;
    }>();
  const orderNumber = abandonedOrder
    ? completedNumberFromAbandoned(abandonedOrder.order_number)
    : (await allocateOrderNumber(database, "INV"));
  const publicStatusToken =
    abandonedOrder?.public_status_token || crypto.randomUUID();
  const unitPrice = Number(variant.price);
  const orderAmount = unitPrice * input.quantity + input.shippingCost;
  const codFeeBearer = normalizePaymentFeeBearer(store.cod_fee_bearer);
  const codFee =
    input.paymentMethod === "cod"
      ? calculateCodFeeBreakdown(orderAmount)
      : calculateCodFeeBreakdown(0);
  const totalAmount =
    input.paymentMethod === "cod"
      ? calculateCodCustomerTotal(orderAmount, codFeeBearer)
      : orderAmount;
  const createdAt = new Date().toISOString();
  const paymentStatus =
    input.paymentMethod === "cod" ? "unpaid" : "pending";

  try {
    const orderStatement = abandonedOrder
      ? database
          .prepare(
            `UPDATE orders
             SET order_number = ?,
                 submit_token = ?,
                 public_status_token = ?,
                 customer_name = ?,
                 customer_phone = ?,
                 customer_email = ?,
                 address = ?,
                 province = ?,
                 city = ?,
                 district = ?,
                 postal_code = ?,
                 warehouse_id = ?,
                 total_amount = ?,
                 shipping_cost = ?,
                 discount_amount = 0,
                 cod_service_fee = ?,
                 cod_service_fee_vat = ?,
                 cod_fee_bearer = ?,
                 payment_method = ?,
                 payment_status = ?,
                 shipping_status = 'pending',
                 destination_area_id = ?,
                 courier_code = ?,
                 courier_service = ?,
                 ad_click_ids = COALESCE(?, ad_click_ids),
                 seller_bank_account_id = ?,
                 seller_bank_code = ?,
                 seller_bank_name = ?,
                 seller_account_holder = ?,
                 seller_account_number = ?
             WHERE id = ?
               AND customer_phone = ?
               AND shipping_status = 'abandoned'
               AND unixepoch(created_at) >= unixepoch('now', '-2 hours')`,
          )
          .bind(
            orderNumber,
            input.submitToken,
            publicStatusToken,
            input.customerName,
            input.customerPhone,
            input.customerEmail || null,
            input.address,
            input.province,
            input.city,
            input.district,
            input.postalCode || null,
            input.warehouseId || null,
            totalAmount,
            input.shippingCost,
            codFee.serviceFee,
            codFee.vat,
            codFeeBearer,
            input.paymentMethod,
            paymentStatus,
            input.destinationAreaId || null,
            input.courierCode || null,
            input.courierService || null,
            input.adClickIds || null,
            sellerBankAccount?.id || null,
            sellerBankAccount?.bank_code || null,
            sellerBankAccount
              ? paymentBrandLabel(sellerBankAccount.bank_code)
              : null,
            sellerBankAccount?.account_holder || null,
            sellerBankAccount?.account_number || null,
            abandonedOrder.id,
            input.customerPhone,
          )
      : database
          .prepare(
            `INSERT INTO orders (
              order_number, submit_token, public_status_token, store_id, warehouse_id,
              customer_name, customer_phone, customer_email, address, province, city, district, postal_code,
              total_amount, shipping_cost, cod_service_fee, cod_service_fee_vat,
              cod_fee_bearer, payment_method, payment_status, shipping_status,
              destination_area_id, courier_code, courier_service, ad_click_ids,
              seller_bank_account_id, seller_bank_code, seller_bank_name,
              seller_account_holder, seller_account_number, created_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending',
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )`,
          )
          .bind(
            orderNumber,
            input.submitToken,
            publicStatusToken,
            store.id,
            input.warehouseId || null,
            input.customerName,
            input.customerPhone,
            input.customerEmail || null,
            input.address,
            input.province,
            input.city,
            input.district,
            input.postalCode || null,
            totalAmount,
            input.shippingCost,
            codFee.serviceFee,
            codFee.vat,
            codFeeBearer,
            input.paymentMethod,
            paymentStatus,
            input.destinationAreaId || null,
            input.courierCode || null,
            input.courierService || null,
            input.adClickIds || null,
            sellerBankAccount?.id || null,
            sellerBankAccount?.bank_code || null,
            sellerBankAccount
              ? paymentBrandLabel(sellerBankAccount.bank_code)
              : null,
            sellerBankAccount?.account_holder || null,
            sellerBankAccount?.account_number || null,
            createdAt,
          );

    const identityPredicate = abandonedOrder
      ? "id = ? AND submit_token = ?"
      : "order_number = ? AND submit_token = ?";
    const identityBindings: [number | string, string] = [
      abandonedOrder?.id || orderNumber,
      input.submitToken,
    ];
    const statements = [orderStatement];
    if (abandonedOrder) {
      statements.push(
        database
          .prepare(
            `DELETE FROM order_items
             WHERE order_id IN (
               SELECT id FROM orders WHERE ${identityPredicate}
             )`,
          )
          .bind(...identityBindings),
      );
    }
    statements.push(
      database
        .prepare(
          `INSERT INTO order_items (order_id, variant_id, quantity, unit_price)
           SELECT id, ?, ?, ?
           FROM orders
           WHERE ${identityPredicate}`,
        )
        .bind(
          variant.id,
          input.quantity,
          unitPrice,
          ...identityBindings,
        ),
      database
        .prepare(
          `UPDATE product_variants
           SET stock = stock - ?
           WHERE id = ?
             AND stock IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM orders WHERE ${identityPredicate}
             )`,
        )
        .bind(
          input.quantity,
          variant.id,
          ...identityBindings,
        ),
      database
        .prepare(
          `SELECT id FROM orders
           WHERE ${identityPredicate}
           LIMIT 1`,
        )
        .bind(...identityBindings),
    );
    const results = await database.batch(statements);
    const row = results.at(-1)?.results?.[0] as { id?: number } | undefined;
    if (!row?.id) throw new Error("Order gagal disimpan.");
    return {
      id: row.id,
      orderNumber,
      publicStatusToken,
      totalAmount,
      unitPrice,
      codServiceFee: codFee.serviceFee,
      codServiceFeeVat: codFee.vat,
      codFeeBearer,
      sellerBankAccountId: sellerBankAccount?.id,
      sellerBankCode: sellerBankAccount?.bank_code,
      sellerBankName: sellerBankAccount
        ? paymentBrandLabel(sellerBankAccount.bank_code)
        : undefined,
      sellerAccountHolder: sellerBankAccount?.account_holder,
      sellerAccountNumber: sellerBankAccount?.account_number,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("orders.submit_token") ||
      message.includes("orders_submit_token_unique")
    ) {
      throw new DuplicateSubmissionError(
        "Permintaan duplikat terdeteksi. Pesanan sudah diproses.",
      );
    }
    if (message.includes("INSUFFICIENT_STOCK")) {
      throw new OrderInputError("Stok produk tidak mencukupi.");
    }
    throw error;
  }
}
