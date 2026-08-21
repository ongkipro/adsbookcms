import assert from "node:assert/strict";
import test from "node:test";
import { PUT as updateSettings } from "../pages/api/admin/settings.ts";

type RecordedWrite = {
  query: string;
  values: unknown[];
};

const WAREHOUSE = {
  name: "Gudang Utama",
  contact_name: "Rini",
  contact_phone: "6285854117766",
  origin_area_id: "area-123",
  origin_label: "Sukaraja, Bogor",
  pickup_address_id: "",
  address: "Jl. Branjangan 18A",
  city: "Bogor",
  province: "Jawa Barat",
} as const;

function createDatabase(warehouseId: number | null) {
  const writes: RecordedWrite[] = [];
  const database = {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...nextValues: unknown[]) {
          values = nextValues;
          return statement;
        },
        async first() {
          if (query.includes("SELECT mengantar_api_key")) {
            return {
              mengantar_api_key: null,
              mengantar_base_url: null,
              autolaris_api_key: null,
              autolaris_base_url: null,
            };
          }
          assert.match(query, /FROM stores s\s+LEFT JOIN warehouses/);
          return {
            store_id: 7,
            warehouse_id: warehouseId,
          };
        },
        async run() {
          writes.push({ query, values });
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { database, writes };
}

async function saveWarehouse(database: unknown) {
  return updateSettings({
    request: new Request("https://store.example.test/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save-warehouse", warehouse: WAREHOUSE }),
    }),
    locals: { runtimeEnv: { OMS_DB: database } },
  } as never);
}

test("the first warehouse save creates the missing fresh-install warehouse", async () => {
  const { database, writes } = createDatabase(null);

  const response = await saveWarehouse(database);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: "Gudang berhasil dibuat.",
    data: { pickup_address_id: "" },
  });
  assert.equal(writes.length, 1);
  assert.match(writes[0].query, /INSERT INTO warehouses/);
  assert.deepEqual(writes[0].values, [
    7,
    WAREHOUSE.name,
    WAREHOUSE.contact_name,
    WAREHOUSE.contact_phone,
    WAREHOUSE.origin_area_id,
    WAREHOUSE.origin_label,
    WAREHOUSE.pickup_address_id,
    WAREHOUSE.address,
    WAREHOUSE.city,
    WAREHOUSE.province,
  ]);
});

test("later warehouse saves update the existing warehouse", async () => {
  const { database, writes } = createDatabase(23);

  const response = await saveWarehouse(database);

  assert.equal(response.status, 200);
  assert.equal((await response.json() as { message: string }).message, "Konfigurasi gudang berhasil disimpan.");
  assert.equal(writes.length, 1);
  assert.match(writes[0].query, /UPDATE warehouses/);
  assert.equal(writes[0].values.at(-1), 23);
});
