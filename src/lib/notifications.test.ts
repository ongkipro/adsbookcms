import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildLeadNotification,
  buildOrderNotification,
  buildPaymentNotification,
  canReceiveCommerceNotifications,
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationHref,
  recordNotification,
} from "./notifications.ts";
import { GET, POST } from "../pages/api/admin/notifications.ts";

type QueryValue = null | number | string | Uint8Array;

class SqliteStatement {
  private readonly sqlite: DatabaseSync;
  readonly sql: string;
  readonly values: QueryValue[];
  private readonly shouldFail?: (sql: string) => boolean;

  constructor(
    sqlite: DatabaseSync,
    sql: string,
    values: QueryValue[] = [],
    shouldFail?: (sql: string) => boolean,
  ) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.values = values;
    this.shouldFail = shouldFail;
  }

  bind(...values: QueryValue[]) {
    return new SqliteStatement(this.sqlite, this.sql, values, this.shouldFail);
  }

  async first<T>() {
    if (this.shouldFail?.(this.sql)) throw new Error("injected failure");
    return (this.sqlite.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>() {
    if (this.shouldFail?.(this.sql)) throw new Error("injected failure");
    return {
      success: true,
      results: this.sqlite.prepare(this.sql).all(...this.values) as T[],
      meta: { changes: 0, last_row_id: 0 },
    };
  }

  async run() {
    if (this.shouldFail?.(this.sql)) throw new Error("injected failure");
    const result = this.sqlite.prepare(this.sql).run(...this.values);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }
}

class NotificationDatabase {
  readonly sqlite = new DatabaseSync(":memory:");
  failOnSql = "";

  constructor() {
    this.sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE stores (id INTEGER PRIMARY KEY);
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        store_id INTEGER NOT NULL,
        order_number TEXT NOT NULL,
        shipping_status TEXT NOT NULL
      );
      INSERT INTO stores VALUES (1);
      INSERT INTO orders VALUES (5, 1, 'INV-10005', 'pending');
      INSERT INTO orders VALUES (6, 1, 'ABN-10006', 'abandoned');
    `);
    this.sqlite.exec(
      readFileSync(
        new URL("../db/migrations/0045_operator_notifications.sql", import.meta.url),
        "utf8",
      ).replaceAll("--> statement-breakpoint", ""),
    );
  }

  prepare(sql: string) {
    return new SqliteStatement(
      this.sqlite,
      sql,
      [],
      (candidate) => Boolean(this.failOnSql && candidate.includes(this.failOnSql)),
    );
  }
}

const asD1 = (database: NotificationDatabase) => database as unknown as D1Database;

const orderInput = (overrides: Record<string, unknown> = {}) => ({
  type: "order" as const,
  orderId: 5,
  orderNumber: "INV-10005",
  title: "Order baru INV-10005",
  body: "Budi · Rp 118.400 · Menteng, Jakarta Pusat",
  ...overrides,
});

test("one order records one notification, and a replay records none", async () => {
  const database = new NotificationDatabase();
  assert.equal(await recordNotification(asD1(database), orderInput()), true);
  assert.equal(await recordNotification(asD1(database), orderInput()), false);

  const rows = await listNotifications(asD1(database), "owner.one");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Order baru INV-10005");
});

test("the same order can carry one notification of each type", async () => {
  const database = new NotificationDatabase();
  await recordNotification(asD1(database), orderInput());
  await recordNotification(
    asD1(database),
    orderInput({ type: "payment", title: "Pembayaran lunas INV-10005" }),
  );

  const rows = await listNotifications(asD1(database), "owner.one");
  assert.deepEqual(rows.map((row) => row.type), ["payment", "order"]);
});

test("a failing notification store is swallowed, not thrown at the caller", async () => {
  const database = new NotificationDatabase();
  database.failOnSql = "INSERT OR IGNORE INTO notifications";
  assert.equal(await recordNotification(asD1(database), orderInput()), false);
  assert.equal(await countUnreadNotifications(asD1(database), "owner.one"), 0);
});

test("read state is per operator", async () => {
  const database = new NotificationDatabase();
  await recordNotification(asD1(database), orderInput());
  assert.equal(await countUnreadNotifications(asD1(database), "owner.one"), 1);
  assert.equal(await countUnreadNotifications(asD1(database), "cs.one"), 1);

  const [row] = await listNotifications(asD1(database), "owner.one");
  await markNotificationRead(asD1(database), row.id, "owner.one");

  assert.equal(await countUnreadNotifications(asD1(database), "owner.one"), 0);
  assert.equal(await countUnreadNotifications(asD1(database), "cs.one"), 1);
});

test("marking read twice stays read and does not throw", async () => {
  const database = new NotificationDatabase();
  await recordNotification(asD1(database), orderInput());
  const [row] = await listNotifications(asD1(database), "owner.one");
  await markNotificationRead(asD1(database), row.id, "owner.one");
  await markNotificationRead(asD1(database), row.id, "owner.one");
  assert.equal(await countUnreadNotifications(asD1(database), "owner.one"), 0);
});

test("mark all read clears only the requesting operator", async () => {
  const database = new NotificationDatabase();
  await recordNotification(asD1(database), orderInput());
  await recordNotification(
    asD1(database),
    orderInput({ type: "lead", orderId: 6, orderNumber: "ABN-10006" }),
  );

  await markAllNotificationsRead(asD1(database), "owner.one");
  assert.equal(await countUnreadNotifications(asD1(database), "owner.one"), 0);
  assert.equal(await countUnreadNotifications(asD1(database), "cs.one"), 2);
});

test("the list is newest first and carries a usable link per type", async () => {
  const database = new NotificationDatabase();
  await recordNotification(asD1(database), orderInput());
  await recordNotification(
    asD1(database),
    orderInput({ type: "lead", orderId: 6, orderNumber: "ABN-10006" }),
  );

  const rows = await listNotifications(asD1(database), "owner.one");
  assert.deepEqual(rows.map((row) => row.type), ["lead", "order"]);
  assert.equal(rows[0].href, "/admin/orders/abandoned");
  assert.equal(rows[1].href, "/admin/orders/INV-10005");
  assert.ok(rows.every((row) => row.unread));
});

test("a converted lead's link follows the order instead of the workspace", async () => {
  const database = new NotificationDatabase();
  await recordNotification(
    asD1(database),
    orderInput({ type: "lead", orderId: 6, orderNumber: "ABN-10006" }),
  );
  // Conversion reuses the same row: renumbered, no longer abandoned.
  database.sqlite.exec(
    "UPDATE orders SET order_number = 'INV-10006', shipping_status = 'pending' WHERE id = 6;",
  );

  const [row] = await listNotifications(asD1(database), "owner.one");
  assert.equal(row.href, "/admin/orders/INV-10006");
  // The recorded copy still says what it said when the lead came in.
  assert.equal(row.order_number, "ABN-10006");
});

test("deleting the order takes its notifications and read state with it", async () => {
  const database = new NotificationDatabase();
  await recordNotification(asD1(database), orderInput());
  const [row] = await listNotifications(asD1(database), "owner.one");
  await markNotificationRead(asD1(database), row.id, "owner.one");

  database.sqlite.exec("DELETE FROM orders WHERE id = 5;");
  assert.equal((await listNotifications(asD1(database), "owner.one")).length, 0);
  assert.equal(
    database.sqlite.prepare("SELECT COUNT(*) AS n FROM notification_reads").get()?.n,
    0,
  );
});

test("advertiser is the only role excluded from commerce notifications", () => {
  assert.equal(canReceiveCommerceNotifications("owner"), true);
  assert.equal(canReceiveCommerceNotifications("admin"), true);
  assert.equal(canReceiveCommerceNotifications("customer_service"), true);
  assert.equal(canReceiveCommerceNotifications("advertiser"), false);
});

test("a lead links to the workspace only while it is still a lead", () => {
  assert.equal(
    notificationHref("lead", "ABN-10006", true),
    "/admin/orders/abandoned",
  );
  // Converted: the row was renumbered and left the abandoned workspace, so the
  // link has to follow it to the order detail instead.
  assert.equal(
    notificationHref("lead", "INV-10006", false),
    "/admin/orders/INV-10006",
  );
  assert.equal(
    notificationHref("order", "INV-10005", false),
    "/admin/orders/INV-10005",
  );
});

const asLocals = (database: NotificationDatabase, username: string, role: string) =>
  ({
    admin: { username, role },
    runtimeEnv: { OMS_DB: asD1(database) },
  }) as never;

const getRequest = (query = "") =>
  new Request(`https://cms.test/api/admin/notifications${query}`);

test("advertiser is refused the notification endpoints entirely", async () => {
  const database = new NotificationDatabase();
  await recordNotification(asD1(database), orderInput());

  const read = await GET({
    request: getRequest(),
    locals: asLocals(database, "ads.one", "advertiser"),
  } as never);
  assert.equal(read.status, 403);

  const write = await POST({
    request: new Request("https://cms.test/api/admin/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read-all" }),
    }),
    locals: asLocals(database, "ads.one", "advertiser"),
  } as never);
  assert.equal(write.status, 403);
});

test("the endpoint serves the badge and the panel, and marking read is per operator", async () => {
  const database = new NotificationDatabase();
  await recordNotification(asD1(database), orderInput());
  await recordNotification(
    asD1(database),
    orderInput({ type: "lead", orderId: 6, orderNumber: "ABN-10006" }),
  );

  const countOnly = await GET({
    request: getRequest("?count_only=true"),
    locals: asLocals(database, "cs.one", "customer_service"),
  } as never);
  const countBody = (await countOnly.json()) as Record<string, unknown>;
  assert.equal(countBody.unread, 2);
  assert.equal(countBody.notifications, undefined);

  const listed = await GET({
    request: getRequest(),
    locals: asLocals(database, "cs.one", "customer_service"),
  } as never);
  const listBody = (await listed.json()) as {
    notifications: Array<{ type: string }>;
  };
  assert.deepEqual(listBody.notifications.map((row) => row.type), ["lead", "order"]);

  const cleared = await POST({
    request: new Request("https://cms.test/api/admin/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read-all" }),
    }),
    locals: asLocals(database, "cs.one", "customer_service"),
  } as never);
  assert.equal(((await cleared.json()) as { unread: number }).unread, 0);
  assert.equal(await countUnreadNotifications(asD1(database), "owner.one"), 2);
});

test("an unknown notification action is refused rather than guessed at", async () => {
  const database = new NotificationDatabase();
  const response = await POST({
    request: new Request("https://cms.test/api/admin/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete-everything" }),
    }),
    locals: asLocals(database, "owner.one", "owner"),
  } as never);
  assert.equal(response.status, 422);
});

test("notification copy states the money and the destination", () => {
  const order = buildOrderNotification({
    orderNumber: "INV-10041",
    customerName: "Budi Santoso",
    totalAmount: 118400,
    district: "Menteng",
    city: "Jakarta Pusat",
  });
  assert.equal(order.title, "Order baru INV-10041");
  assert.match(order.body, /Budi Santoso/);
  assert.match(order.body, /Rp 118\.400/);
  assert.match(order.body, /Menteng, Jakarta Pusat/);

  const lead = buildLeadNotification({
    orderNumber: "ABN-10042",
    customerName: "",
    productTitle: "Pupuk Sawit",
  });
  assert.match(lead.body, /Tanpa nama/);
  assert.match(lead.body, /Perlu follow-up/);

  const payment = buildPaymentNotification({
    orderNumber: "INV-10041",
    customerName: "Budi Santoso",
    totalAmount: 118400,
  });
  assert.equal(payment.title, "Pembayaran lunas INV-10041");
  assert.match(payment.body, /Rp 118\.400/);
});
