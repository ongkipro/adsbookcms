import assert from "node:assert/strict";
import test, { after } from "node:test";
import path from "node:path";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as esbuild from "esbuild";
import React from "react";
import { renderToString } from "react-dom/server";

/**
 * A-172: `npm test` globs `src/lib/*.test.ts`, so no admin React island was
 * ever executed by the suite — a throw during render returned a blank 200
 * that `check`, `test` and `build` all called healthy (A-171, then A-208's
 * `ProductForm` case). Each island named here carries money or state, is
 * bundled with esbuild the same way Astro's own Vite pipeline resolves JSX
 * and the `@/*` alias, and is rendered through `react-dom/server` — the
 * cheapest version of a smoke check, no browser required.
 *
 * CJS, not ESM: esbuild's ESM+node output leaves a `require("react")` inside
 * some transitively bundled dependency, which throws "Dynamic require of
 * react is not supported" at import time. CJS output lets Node's own
 * `require` resolve the externalized `react`/`react-dom` normally.
 */

const require = createRequire(import.meta.url);
const TMP_DIR = path.join(process.cwd(), "node_modules", ".admin-islands-render-test");

async function renderIsland(
  fileName: string,
  exportName: string,
  props: Record<string, unknown>,
) {
  const entry = path.resolve("src/components/admin", fileName);
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    jsxImportSource: "react",
    write: false,
    external: ["react", "react-dom", "react-dom/*"],
    alias: { "@": path.resolve("src") },
    logLevel: "silent",
  });

  const outFile = path.join(TMP_DIR, `${fileName}.cjs`);
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(outFile, result.outputFiles[0].text);
  delete require.cache[outFile];
  const mod = require(outFile);
  const Component = exportName === "default" ? mod.default : mod[exportName];
  if (typeof Component !== "function") {
    throw new Error(`${fileName}: export "${exportName}" is not a component`);
  }
  return renderToString(React.createElement(Component, props));
}

after(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

test("OrdersTable renders its loading skeleton without initial data", async () => {
  const html = await renderIsland("OrdersTable.tsx", "OrdersTable", {});
  assert.match(html, /aria-busy="true"/);
});

test("OrdersTable renders a real order row without throwing", async () => {
  // `initialOrders` takes the already-mapped `OrderItem` shape (camelCase),
  // the same one `mapOrder` produces from a raw DB row — not the raw row
  // itself. `paymentInstructionStatus` is deliberately omitted here: it is
  // optional precisely because the server-rendered first paint
  // (`src/pages/admin/orders/index.astro`) doesn't supply it (see the type's
  // own comment), so a fixture that always included it would miss that case.
  const order = {
    id: "1",
    orderNumber: "ORD-TEST-1",
    customerName: "Budi Santoso",
    customerPhone: "081234567890",
    address: "Jl. Test No. 1",
    productName: "Produk Uji",
    variantName: "Default",
    productPrice: 100_000,
    shippingCost: 15_000,
    district: "Kec. Test",
    city: "Jakarta",
    province: "DKI Jakarta",
    totalAmount: 115_000,
    paymentMethod: "cod",
    paymentStatus: "unpaid",
    shippingStatus: "pending",
    courierCode: "jne",
    cnoteNo: "",
    sellerName: "",
    bankAccounts: "",
    epaymentLink: "",
    receiverDeliveryRate: -1,
    receiverRiskLabel: "UNKNOWN",
    createdAt: new Date().toISOString(),
    dispatchEligible: false,
    dispatchReason: "",
    providerDispatchError: null,
    providerOrderId: null,
  };
  const html = await renderIsland("OrdersTable.tsx", "OrdersTable", {
    initialOrders: [order],
  });
  assert.match(html, /Budi Santoso/);
  assert.match(html, /ORD-TEST-1/);
});

test("OrderDetail renders for a given invoice without throwing", async () => {
  const html = await renderIsland("OrderDetail.tsx", "OrderDetail", {
    invoice: "INV-TEST-1",
  });
  assert.ok(html.length > 0);
});

test("PaymentReconciliationQueue renders without throwing", async () => {
  const html = await renderIsland(
    "PaymentReconciliationQueue.tsx",
    "default",
    {},
  );
  assert.ok(html.length > 0);
});

test("ProductForm renders in create mode without throwing", async () => {
  const html = await renderIsland("ProductForm.tsx", "ProductForm", {});
  assert.ok(html.length > 0);
});

test("LandingPageEditor renders in create mode without throwing", async () => {
  const html = await renderIsland("LandingPageEditor.tsx", "default", {});
  assert.ok(html.length > 0);
});

test("RateCheckTools renders with the warehouse as the default origin", async () => {
  const html = await renderIsland("RateCheckTools.tsx", "default", {
    defaultOrigin: { id: "area-1", label: "Menteng, Jakarta Pusat" },
    warehouseName: "Gudang Uji",
  });
  assert.match(html, /value="Menteng, Jakarta Pusat"/);
  assert.match(html, /Default: Gudang Uji/);
});

test("RateCheckTools renders without a warehouse", async () => {
  const html = await renderIsland("RateCheckTools.tsx", "default", { defaultOrigin: null, warehouseName: "" });
  assert.match(html, /Cek tarif kurir/);
});
