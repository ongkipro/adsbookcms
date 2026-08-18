import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync } from "node:sqlite";
import type { StatementSync } from "node:sqlite";
import test from "node:test";
import {
  applyOrderLifecycleMutation,
  deleteOrdersRestoringStock,
  OrderLifecycleError,
  releasesReservedStock,
  resolveAdminOrderTransition,
  updateAdminOrderShippingStatuses,
} from "./order-lifecycle.ts";
import type { OrderLifecycleState } from "./order-lifecycle.ts";

type TestOrder = OrderLifecycleState & {
  order_number: string;
  customer_name?: string;
  customer_phone?: string;
  provider_dispatch_claimed_at?: string | null;
  receiver_rts_score?: number | null;
  rts_risk_label?: string | null;
  receiver_performance_json?: string | null;
  receiver_performance_checked_at?: string | null;
};
type TestItem = { order_id: number; variant_id: number; quantity: number };
type TestPayment = { order_id: number; reference_id: string };
type TestState = {
  orders: Map<number, TestOrder>;
  items: TestItem[];
  payments: TestPayment[];
  variants: Map<number, number>;
};

type StatementResult = {
  success: true;
  meta: { changes: number };
  results: unknown[];
};

const result = (changes = 0, results: unknown[] = []): StatementResult => ({
  success: true,
  meta: { changes },
  results,
});

function order(
  id: number,
  shippingStatus = "pending",
  overrides: Partial<TestOrder> = {},
): TestOrder {
  return {
    id,
    order_number: `INV-${10000 + id}`,
    payment_method: "cod",
    payment_status: "unpaid",
    shipping_status: shippingStatus,
    courier_code: null,
    cnote_no: null,
    provider_order_id: null,
    stock_restored_at: null,
    ...overrides,
  };
}

function cloneState(state: TestState): TestState {
  return {
    orders: new Map(
      Array.from(state.orders, ([id, value]) => [id, { ...value }]),
    ),
    items: state.items.map((item) => ({ ...item })),
    payments: state.payments.map((payment) => ({ ...payment })),
    variants: new Map(state.variants),
  };
}

class FakeStatement {
  readonly database: FakeD1Database;
  readonly sql: string;
  readonly args: unknown[];

  constructor(database: FakeD1Database, sql: string, args: unknown[] = []) {
    this.database = database;
    this.sql = sql;
    this.args = args;
  }

  bind(...args: unknown[]) {
    return new FakeStatement(this.database, this.sql, args);
  }

  async run() {
    return this.database.execute(this);
  }

  async all<T>() {
    const ids = this.args.map(Number);
    const rows = ids
      .map((id) => this.database.state.orders.get(id))
      .filter((value): value is TestOrder => Boolean(value))
      .map((value) => ({ ...value })) as T[];
    return { ...result(rows.length, rows), results: rows };
  }

  async first<T>() {
    const numericArgs = this.args
      .map(Number)
      .filter((value) => Number.isInteger(value) && value > 0);
    const id = numericArgs.at(-1);
    const value = id == null ? undefined : this.database.state.orders.get(id);
    if (!value) return null;
    return {
      ...value,
      warehouse_id: null,
      pickup_schedule_id: null,
      customer_name: value.customer_name ?? "Customer",
      customer_phone: value.customer_phone ?? "081234567890",
      address: "Jalan Pengujian Nomor 1",
      province: "Sumatera Utara",
      city: "Medan",
      district: "Medan Kota",
      postal_code: "20111",
      destination_area_id: "area-1",
      total_amount: 100000,
      shipping_cost: 10000,
      discount_amount: 0,
      cod_service_fee: 0,
      cod_service_fee_vat: 0,
      cod_fee_bearer: "buyer",
      confirmed_at: null,
      courier_service: null,
      provider_dispatch_error: null,
      provider_dispatch_claimed_at: value.provider_dispatch_claimed_at ?? null,
      receiver_delivery_rate: value.receiver_rts_score ?? null,
      receiver_risk_label: value.rts_risk_label ?? null,
      receiver_performance_json: value.receiver_performance_json ?? null,
      receiver_performance_checked_at: value.receiver_performance_checked_at ?? null,
      ad_click_ids: null,
      created_at: "2026-08-17T00:00:00.000Z",
      warehouse_name: null,
      pickup_address_id: null,
      pickup_scheduled_at: null,
      pickup_status: null,
    } as T;
  }
}

class FakeD1Database {
  state: TestState;
  failOnSql: string | null = null;
  beforeCustomerUpdate: ((order: TestOrder) => void) | null = null;

  constructor(state: TestState) {
    this.state = cloneState(state);
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]) {
    const before = cloneState(this.state);
    try {
      const results = [];
      for (const statement of statements) {
        results.push(await this.execute(statement as unknown as FakeStatement));
      }
      return results as D1Result<unknown>[];
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  async execute(statement: FakeStatement): Promise<StatementResult> {
    const { sql, args } = statement;
    if (this.failOnSql && sql.includes(this.failOnSql)) {
      throw new Error("injected D1 statement failure");
    }
    const ids = args.map(Number).filter((id) => Number.isInteger(id) && id > 0);

    if (sql.includes("UPDATE product_variants")) {
      const releaseStateRequired = sql.includes("o.shipping_status IN");
      const excludesAbandoned = sql.includes("o.shipping_status <> 'abandoned'");
      const quantities = new Map<number, number>();
      for (const id of ids) {
        const current = this.state.orders.get(id);
        if (!current || current.stock_restored_at) continue;
        if (excludesAbandoned && current.shipping_status === "abandoned") continue;
        if (
          releaseStateRequired &&
          !releasesReservedStock(
            current.payment_status,
            current.shipping_status,
          )
        ) {
          continue;
        }
        for (const item of this.state.items.filter((row) => row.order_id === id)) {
          quantities.set(
            item.variant_id,
            (quantities.get(item.variant_id) || 0) + item.quantity,
          );
        }
      }
      let changes = 0;
      for (const [variantId, quantity] of quantities) {
        const stock = this.state.variants.get(variantId);
        if (stock == null) continue;
        this.state.variants.set(variantId, stock + quantity);
        changes += 1;
      }
      return result(changes);
    }

    if (
      sql.includes("UPDATE orders") &&
      (sql.includes("customer_phone = ?") || sql.includes("customer_name = ?"))
    ) {
      const targetId = Number(args.at(-1));
      const current = this.state.orders.get(targetId);
      if (!current) return result();
      this.beforeCustomerUpdate?.(current);
      if (
        sql.includes("provider_order_id IS NULL") &&
        (current.provider_order_id ||
          current.provider_dispatch_claimed_at ||
          current.shipping_status !== "pending")
      ) {
        return result();
      }
      const setClause = sql.match(/SET([\s\S]+?)WHERE/i)?.[1] || "";
      const columns = setClause
        .split(",")
        .map((entry) => entry.match(/^\s*([a-z_]+)\s*=\s*\?/i)?.[1])
        .filter((value): value is string => Boolean(value));
      columns.forEach((column, index) => {
        (current as unknown as Record<string, unknown>)[column] = args[index];
      });
      return result(1);
    }

    if (sql.includes("UPDATE orders AS o") && sql.includes("stock_restored_at")) {
      const releaseStateRequired = sql.includes("o.shipping_status IN");
      const excludesAbandoned = sql.includes("o.shipping_status <> 'abandoned'");
      let changes = 0;
      for (const id of ids) {
        const current = this.state.orders.get(id);
        if (!current || current.stock_restored_at) continue;
        if (excludesAbandoned && current.shipping_status === "abandoned") continue;
        if (
          releaseStateRequired &&
          !releasesReservedStock(
            current.payment_status,
            current.shipping_status,
          )
        ) {
          continue;
        }
        current.stock_restored_at = "2026-08-17T00:00:00.000Z";
        changes += 1;
      }
      return result(changes);
    }

    if (sql.includes("UPDATE orders") && sql.includes("shipping_status")) {
      const literalStatus = sql.match(/SET shipping_status = '([^']+)'/)?.[1];
      const status = literalStatus || String(args[0]);
      const targetIds = literalStatus ? ids : [Number(args.at(-1))];
      let changes = 0;
      for (const id of targetIds) {
        const current = this.state.orders.get(id);
        if (!current) continue;
        current.shipping_status = status;
        changes += 1;
      }
      return result(changes);
    }

    if (sql.includes("DELETE FROM order_items")) {
      const before = this.state.items.length;
      this.state.items = this.state.items.filter((item) => !ids.includes(item.order_id));
      return result(before - this.state.items.length);
    }

    if (sql.includes("DELETE FROM payment_transactions")) {
      const orderNumbers = new Set(
        ids
          .map((id) => this.state.orders.get(id)?.order_number)
          .filter((value): value is string => Boolean(value)),
      );
      const before = this.state.payments.length;
      this.state.payments = this.state.payments.filter(
        (payment) =>
          !ids.includes(payment.order_id) &&
          !orderNumbers.has(payment.reference_id),
      );
      return result(before - this.state.payments.length);
    }

    if (sql.includes("DELETE FROM orders")) {
      const deleted = [];
      for (const id of ids) {
        const current = this.state.orders.get(id);
        if (!current) continue;
        deleted.push({ id: current.id, order_number: current.order_number });
        this.state.orders.delete(id);
      }
      return result(deleted.length, deleted);
    }

    throw new Error(`Unhandled test SQL: ${sql}`);
  }
}

type SqlValue = null | number | string | Uint8Array;

class SqliteStatement {
  readonly database: DatabaseSync;
  readonly sql: string;
  readonly values: SqlValue[];

  constructor(database: DatabaseSync, sql: string, values: SqlValue[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: SqlValue[]) {
    return new SqliteStatement(this.database, this.sql, values);
  }

  execute() {
    const statement = this.prepare();
    if (/\bRETURNING\b/i.test(this.sql)) {
      const rows = statement.all(...this.values) as Record<string, unknown>[];
      return result(rows.length, rows);
    }
    const execution = statement.run(...this.values);
    return result(Number(execution.changes));
  }

  prepare(): StatementSync {
    return this.database.prepare(this.sql);
  }
}

class SqliteD1Database {
  readonly database = new DatabaseSync(":memory:");

  constructor() {
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE product_variants (
        id INTEGER PRIMARY KEY,
        stock INTEGER
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        order_number TEXT NOT NULL UNIQUE,
        payment_method TEXT NOT NULL,
        payment_status TEXT NOT NULL,
        shipping_status TEXT NOT NULL,
        courier_code TEXT,
        cnote_no TEXT,
        provider_order_id TEXT,
        stock_restored_at TEXT
      );
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        variant_id INTEGER NOT NULL REFERENCES product_variants(id),
        quantity INTEGER NOT NULL
      );
      CREATE TABLE payment_transactions (
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        reference_id TEXT NOT NULL
      );
    `);
  }

  prepare(sql: string) {
    return new SqliteStatement(this.database, sql) as unknown as D1PreparedStatement;
  }

  async batch(statements: D1PreparedStatement[]) {
    this.database.exec("BEGIN");
    try {
      const results = statements.map((statement) =>
        (statement as unknown as SqliteStatement).execute(),
      );
      this.database.exec("COMMIT");
      return results as D1Result<unknown>[];
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  exec(sql: string) {
    this.database.exec(sql);
  }

  get<T>(sql: string) {
    return this.database.prepare(sql).get() as T | undefined;
  }
}

function databaseWithOrders(...orders: TestOrder[]) {
  return new FakeD1Database({
    orders: new Map(orders.map((value) => [value.id, value])),
    items: orders.map((value) => ({
      order_id: value.id,
      variant_id: 501,
      quantity: value.id,
    })),
    payments: orders.map((value) => ({
      order_id: value.id,
      reference_id: value.order_number,
    })),
    variants: new Map([[501, 10]]),
  });
}

const extensionResolver = registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      const isRelativeWithoutExtension =
        specifier.startsWith(".") && !/\.[a-z0-9]+$/i.test(specifier);
      if (!isRelativeWithoutExtension) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
const detailRoute = await import("../pages/api/admin/orders/[id].ts");
const bulkRoute = await import("../pages/api/admin/orders/index.ts");
extensionResolver.deregister();

function locals(database: FakeD1Database) {
  return {
    admin: { id: "admin-1", role: "owner" },
    runtimeEnv: { OMS_DB: database as unknown as D1Database },
  };
}

test("canonical policy preserves dispatch, payment, waybill, and stock guards", () => {
  const pending = order(1);
  assert.deepEqual(resolveAdminOrderTransition(pending, { shippingStatus: "cancelled" }), {
    paymentStatus: "unpaid",
    shippingStatus: "cancelled",
    releasesStock: true,
  });

  const dispatched = order(2, "processing", {
    provider_order_id: "provider-2",
    courier_code: "jne",
    cnote_no: "WAYBILL-2",
  });
  assert.equal(
    resolveAdminOrderTransition(dispatched, { shippingStatus: "shipped" })
      .shippingStatus,
    "shipped",
  );

  assert.throws(
    () => resolveAdminOrderTransition(pending, { shippingStatus: "processing" }),
    /Push\/Arrange Shipping/,
  );
  assert.throws(
    () =>
      resolveAdminOrderTransition(
        order(3, "processing", { provider_order_id: "provider-3" }),
        { shippingStatus: "shipped" },
      ),
    /kurir, dan nomor resi/,
  );
  assert.throws(
    () =>
      resolveAdminOrderTransition(
        order(4, "processing", {
          payment_method: "bank_transfer",
          provider_order_id: "provider-4",
          courier_code: "jne",
          cnote_no: "WAYBILL-4",
        }),
        { shippingStatus: "delivered" },
      ),
    /sebelum berstatus paid/,
  );
  for (const paidStatus of ["paid", "settled", "success"]) {
    assert.throws(
      () =>
        resolveAdminOrderTransition(
          order(5, "pending", { payment_method: "bank_transfer" }),
          { paymentStatus: paidStatus },
        ),
      /rekonsiliasi AutoLaris/,
    );
  }

  for (const terminalStatus of ["cancelled", "returned"] as const) {
    assert.throws(
      () =>
        resolveAdminOrderTransition(order(6, terminalStatus), {
          shippingStatus: "processing",
        }),
      /reservasi stok baru/,
    );
  }
  assert.throws(
    () =>
      resolveAdminOrderTransition(order(6, "returned"), {
        paymentStatus: "refunded",
        shippingStatus: "processing",
      }),
    /reservasi stok baru/,
  );
  assert.throws(
    () =>
      resolveAdminOrderTransition(
        order(7, "processing", {
          provider_order_id: "provider-7",
          stock_restored_at: "2026-08-17T00:00:00.000Z",
        }),
        { shippingStatus: "shipped" },
      ),
    /reservasi stok baru/,
  );
});

test("detail and bulk status routes share the terminal-state rejection", async () => {
  const detailDatabase = databaseWithOrders(order(11, "cancelled"));
  const detailResponse = await detailRoute.PATCH({
    params: { id: "11" },
    request: new Request("https://example.test/api/admin/orders/11", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shipping_status: "processing" }),
    }),
    locals: locals(detailDatabase),
  } as never);
  assert.equal(detailResponse.status, 409);
  assert.equal(detailDatabase.state.orders.get(11)?.shipping_status, "cancelled");

  const bulkDatabase = databaseWithOrders(
    order(12, "processing", {
      provider_order_id: "provider-12",
      courier_code: "jne",
      cnote_no: "WAYBILL-12",
    }),
    order(13, "returned", {
      provider_order_id: "provider-13",
      courier_code: "jne",
      cnote_no: "WAYBILL-13",
    }),
  );
  const bulkResponse = await bulkRoute.POST({
    request: new Request("https://example.test/api/admin/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_ids: ["12", "13"], status: "shipped" }),
    }),
    locals: locals(bulkDatabase),
  } as never);
  assert.equal(bulkResponse.status, 409);
  assert.equal(bulkDatabase.state.orders.get(12)?.shipping_status, "processing");
  assert.equal(bulkDatabase.state.orders.get(13)?.shipping_status, "returned");
});

test("detail cancellation restores stock exactly once", async () => {
  const database = databaseWithOrders(order(14));
  const invoke = () =>
    detailRoute.PATCH({
      params: { id: "14" },
      request: new Request("https://example.test/api/admin/orders/14", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shipping_status: "cancelled" }),
      }),
      locals: locals(database),
    } as never);

  const first = await invoke();
  assert.equal(first.status, 200);
  assert.equal(database.state.orders.get(14)?.shipping_status, "cancelled");
  assert.equal(database.state.variants.get(501), 24);

  const repeat = await invoke();
  assert.equal(repeat.status, 200);
  assert.equal(database.state.variants.get(501), 24);
});

test("editing a customer phone invalidates receiver scoring before refresh", async () => {
  const database = databaseWithOrders(order(15, "pending", {
    customer_phone: "081234567890",
    receiver_rts_score: 92,
    rts_risk_label: "LOW",
    receiver_performance_json: JSON.stringify({ deliveryRate: 92 }),
    receiver_performance_checked_at: "2026-08-17T00:00:00.000Z",
  }));
  const response = await detailRoute.PATCH({
    params: { id: "15" },
    request: new Request("https://example.test/api/admin/orders/15", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer_phone: "081298765432" }),
    }),
    locals: locals(database),
  } as never);
  const payload = await response.json() as {
    data: {
      customer_phone: string;
      receiver_delivery_rate: number | null;
      receiver_risk_label: string | null;
      receiver_performance: unknown;
      receiver_performance_checked_at: string | null;
    };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.data.customer_phone, "6281298765432");
  assert.equal(payload.data.receiver_delivery_rate, null);
  assert.equal(payload.data.receiver_risk_label, null);
  assert.equal(payload.data.receiver_performance, null);
  assert.equal(payload.data.receiver_performance_checked_at, null);
});

test("a buyer edit loses atomically when Mengantar dispatch claims the order", async () => {
  const database = databaseWithOrders(order(16, "pending", {
    customer_name: "Customer",
    customer_phone: "081234567890",
  }));
  database.beforeCustomerUpdate = (current) => {
    current.provider_dispatch_claimed_at = "2026-08-18T00:00:00.000Z";
  };

  const response = await detailRoute.PATCH({
    params: { id: "16" },
    request: new Request("https://example.test/api/admin/orders/16", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer_name: "Changed after claim" }),
    }),
    locals: locals(database),
  } as never);
  const payload = await response.json() as { error?: string };

  assert.equal(response.status, 409);
  assert.match(payload.error || "", /sedang atau sudah diproses ke Mengantar/);
  assert.equal(database.state.orders.get(16)?.customer_name, "Customer");
});

test("changing a destination cannot retain a stale courier quote", async () => {
  const database = databaseWithOrders(order(17));
  const response = await detailRoute.PATCH({
    params: { id: "17" },
    request: new Request("https://example.test/api/admin/orders/17", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ destination_area_id: "area-2" }),
    }),
    locals: locals(database),
  } as never);

  assert.equal(response.status, 422);
  assert.equal(database.state.orders.get(17)?.shipping_status, "pending");
});

test("bulk cancellation restores stock once across repeat attempts", async () => {
  const database = databaseWithOrders(order(21), order(22));
  assert.equal(
    await updateAdminOrderShippingStatuses(
      database as unknown as D1Database,
      [21, 22],
      "cancelled",
    ),
    2,
  );
  assert.equal(database.state.variants.get(501), 53);

  assert.equal(
    await updateAdminOrderShippingStatuses(
      database as unknown as D1Database,
      [21, 22],
      "cancelled",
    ),
    2,
  );
  assert.equal(database.state.variants.get(501), 53);
});

test("single delete route restores once and repeat delete cannot inflate stock", async () => {
  const database = databaseWithOrders(order(31));
  const invoke = () =>
    detailRoute.DELETE({
      params: { id: "31" },
      locals: locals(database),
    } as never);

  const first = await invoke();
  assert.equal(first.status, 200);
  assert.equal(database.state.variants.get(501), 41);
  assert.equal(database.state.orders.size, 0);
  assert.equal(database.state.items.length, 0);
  assert.equal(database.state.payments.length, 0);

  const repeat = await invoke();
  assert.equal(repeat.status, 404);
  assert.equal(database.state.variants.get(501), 41);
});

test("deleting an abandoned lead never restores stock it did not reserve", async () => {
  const database = databaseWithOrders(order(32, "abandoned"));
  const stockBefore = database.state.variants.get(501);

  const response = await detailRoute.DELETE({
    params: { id: "32" },
    locals: locals(database),
  } as never);

  assert.equal(response.status, 200);
  assert.equal(database.state.variants.get(501), stockBefore);
  assert.equal(database.state.orders.has(32), false);
});

test("bulk delete route restores only still-reserved orders and reports actual deletes", async () => {
  const database = databaseWithOrders(
    order(41),
    order(42, "cancelled", {
      stock_restored_at: "2026-08-16T00:00:00.000Z",
    }),
  );
  const response = await bulkRoute.DELETE({
    request: new Request("https://example.test/api/admin/orders", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [41, 42, 999] }),
    }),
    locals: locals(database),
  } as never);
  const payload = (await response.json()) as {
    deleted_count: number;
    deleted_ids: number[];
  };

  assert.equal(response.status, 200);
  assert.equal(database.state.variants.get(501), 51);
  assert.equal(database.state.orders.size, 0);
  assert.deepEqual(payload.deleted_ids.sort((a, b) => a - b), [41, 42]);
  assert.equal(payload.deleted_count, 2);
});

for (const [name, invoke] of [
  [
    "single",
    async (database: FakeD1Database) =>
      detailRoute.DELETE({
        params: { id: "51" },
        locals: locals(database),
      } as never),
  ],
  [
    "bulk",
    async (database: FakeD1Database) =>
      bulkRoute.DELETE({
        request: new Request("https://example.test/api/admin/orders", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: [51] }),
        }),
        locals: locals(database),
      } as never),
  ],
] as const) {
  test(`${name} delete rolls stock restoration back when a later delete fails`, async () => {
    const database = databaseWithOrders(order(51));
    database.failOnSql = "DELETE FROM payment_transactions";

    const response = await invoke(database);
    assert.equal(response.status, 500);
    assert.equal(database.state.variants.get(501), 10);
    assert.equal(database.state.orders.size, 1);
    assert.equal(database.state.items.length, 1);
    assert.equal(database.state.payments.length, 1);
    assert.equal(database.state.orders.get(51)?.stock_restored_at, null);
  });
}

test("canonical delete helper returns no rows on a repeat attempt", async () => {
  const database = databaseWithOrders(order(61));
  const first = await deleteOrdersRestoringStock(
    database as unknown as D1Database,
    [61],
  );
  const repeat = await deleteOrdersRestoringStock(
    database as unknown as D1Database,
    [61],
  );
  assert.deepEqual(first, [{ id: 61, order_number: "INV-10061" }]);
  assert.deepEqual(repeat, []);
  assert.equal(database.state.variants.get(501), 71);
});

test("delete SQL restores and rolls back atomically on a real SQLite engine", async () => {
  const successful = new SqliteD1Database();
  successful.exec(`
    INSERT INTO product_variants (id, stock) VALUES (501, 10);
    INSERT INTO orders (
      id, order_number, payment_method, payment_status, shipping_status
    ) VALUES (81, 'INV-10081', 'cod', 'unpaid', 'pending');
    INSERT INTO order_items (order_id, variant_id, quantity)
      VALUES (81, 501, 3);
    INSERT INTO payment_transactions (order_id, reference_id)
      VALUES (81, 'INV-10081');
  `);
  const deleted = await deleteOrdersRestoringStock(
    successful as unknown as D1Database,
    [81],
  );
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0]?.id, 81);
  assert.equal(deleted[0]?.order_number, "INV-10081");
  assert.equal(
    successful.get<{ stock: number }>(
      "SELECT stock FROM product_variants WHERE id = 501",
    )?.stock,
    13,
  );
  assert.equal(
    successful.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM orders",
    )?.count,
    0,
  );

  const failing = new SqliteD1Database();
  failing.exec(`
    INSERT INTO product_variants (id, stock) VALUES (501, 10);
    INSERT INTO orders (
      id, order_number, payment_method, payment_status, shipping_status
    ) VALUES (82, 'INV-10082', 'cod', 'unpaid', 'pending');
    INSERT INTO order_items (order_id, variant_id, quantity)
      VALUES (82, 501, 4);
    INSERT INTO payment_transactions (order_id, reference_id)
      VALUES (82, 'INV-10082');
    CREATE TRIGGER reject_payment_delete
    BEFORE DELETE ON payment_transactions
    BEGIN
      SELECT RAISE(ABORT, 'injected payment delete failure');
    END;
  `);
  await assert.rejects(
    deleteOrdersRestoringStock(failing as unknown as D1Database, [82]),
    /injected payment delete failure/,
  );
  assert.equal(
    failing.get<{ stock: number }>(
      "SELECT stock FROM product_variants WHERE id = 501",
    )?.stock,
    10,
  );
  assert.equal(
    failing.get<{ stock_restored_at: string | null }>(
      "SELECT stock_restored_at FROM orders WHERE id = 82",
    )?.stock_restored_at,
    null,
  );
  assert.equal(
    failing.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM order_items WHERE order_id = 82",
    )?.count,
    1,
  );
  assert.equal(
    failing.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM payment_transactions WHERE order_id = 82",
    )?.count,
    1,
  );
});

test("lifecycle mutation and restoration are atomic on D1 batch failure", async () => {
  const current = order(71);
  const database = databaseWithOrders(current);
  database.failOnSql = "UPDATE product_variants";

  await assert.rejects(
    applyOrderLifecycleMutation(
      database as unknown as D1Database,
      current,
      { shippingStatus: "cancelled" },
      database
        .prepare("UPDATE orders SET shipping_status = ? WHERE id = ?")
        .bind("cancelled", 71),
    ),
    (error: unknown) =>
      error instanceof Error && error.message === "injected D1 statement failure",
  );
  assert.equal(database.state.orders.get(71)?.shipping_status, "pending");
  assert.equal(database.state.orders.get(71)?.stock_restored_at, null);
  assert.equal(database.state.variants.get(501), 10);
});

test("lifecycle errors retain route-safe status codes", async () => {
  await assert.rejects(
    updateAdminOrderShippingStatuses(
      databaseWithOrders() as unknown as D1Database,
      [],
      "pending",
    ),
    (error: unknown) =>
      error instanceof OrderLifecycleError && error.status === 400,
  );
});
