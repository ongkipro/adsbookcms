/**
 * `npm run dev:local` — a complete store on this machine, one command.
 *
 *   build → local Mengantar/AutoLaris stand-ins → `wrangler dev --local`
 *
 * The Worker runs exactly as it would on Cloudflare (workerd, D1/KV/R2 in
 * `.wrangler/dev-local-state`), applies its own migrations on the first
 * request, and redirects to /install. Provider calls go to
 * `scripts/dev-providers.ts` on 127.0.0.1, so checkout, dispatch and QRIS/VA
 * all work without an account anywhere.
 *
 *   --reset      wipe the local store first (only .wrangler/dev-local-state)
 *   --no-build   reuse the last `astro build`
 *   --port=8787  Worker port (providers use port + 1)
 *   --ip=<addr>  listen on this address instead of localhost — e.g. the
 *                machine's Tailscale IP, to open the store from another
 *                device on the tailnet. Providers stay on 127.0.0.1.
 *
 * Nothing here is read by a deploy: the env file lives under `.wrangler/`
 * (ignored), and `.dev.vars.example` — what the Deploy button reads — keeps
 * asking for `INSTALL_TOKEN` alone.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startDevProviders } from "./dev-providers.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = new Set(process.argv.slice(2));
const portArg = process.argv.slice(2).find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1]) || 8787;
const host = process.argv.slice(2).find((arg) => arg.startsWith("--ip="))?.split("=")[1] || "";
const providerPort = port + 1;
const stateDir = `${root}.wrangler/dev-local-state`;
const envFile = `${root}.wrangler/dev-local.env`;
const INSTALL_TOKEN = "dev-local-install-token";

// A second run while the first is still up used to die inside wrangler with
// "Address already in use" — after --reset had already wiped the state the
// running store was using. Refuse before touching anything.
async function portInUse(candidate: number) {
  const { createConnection } = await import("node:net");
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ port: candidate, host: candidate === port && host ? host : "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}
for (const candidate of [port, providerPort]) {
  if (await portInUse(candidate)) {
    console.error(`[dev:local] port ${candidate} is already in use — is another dev:local still running? Stop it, or pass --port=<n>.`);
    process.exit(1);
  }
}

if (args.has("--reset")) {
  rmSync(stateDir, { recursive: true, force: true });
  console.log("[dev:local] local store wiped");
}

if (!args.has("--no-build")) {
  const build = spawnSync("npx", ["astro", "build"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const providers = await startDevProviders(providerPort);
const providerBase = `http://127.0.0.1:${providerPort}`;

mkdirSync(`${root}.wrangler`, { recursive: true });
writeFileSync(envFile, `INSTALL_TOKEN=${INSTALL_TOKEN}\n`);

// Passed as plain vars, not through the env file: with `secrets.required` in
// wrangler.jsonc, Wrangler loads only the declared secret names from an env
// file and silently drops the rest — which left the stand-ins unused.
const providerVars = {
  MENGANTAR_API_KEY: "dev",
  MENGANTAR_BASE_URL: providerBase,
  AUTOLARIS_API_KEY: "dev",
  AUTOLARIS_BASE_URL: providerBase,
  // AutoLaris' own area ids; any positive integers satisfy the stand-in.
  AUTOLARIS_ORDER_ORIGIN_ID: "1",
  AUTOLARIS_ORDER_DESTINATION_ID: "2",
};

const worker = spawn(
  "npx",
  [
    "wrangler", "dev", "--local",
    "--port", String(port),
    ...(host ? ["--ip", host] : []),
    "--persist-to", stateDir,
    "--env-file", envFile,
    ...Object.entries(providerVars).flatMap(([key, value]) => ["--var", `${key}:${value}`]),
    // Exposes /cdn-cgi/handler/scheduled?cron=7+*+*+*+* to run the hourly job by hand.
    "--test-scheduled",
    "--show-interactive-dev-session=false",
  ],
  { cwd: root, stdio: "inherit" },
);

console.log(`
  AdsBookCMS local store
  ─────────────────────────────────────────────
  Store      http://${host || "localhost"}:${port}   (redirects to /install until installed)
  Token      ${INSTALL_TOKEN}
  Providers  ${providerBase}   (Mengantar + AutoLaris stand-ins)
  Cron       http://${host || "localhost"}:${port}/cdn-cgi/handler/scheduled?cron=7+*+*+*+*
  Settle     curl -X POST '${providerBase}/__dev/autolaris/pay?transaction_id=<id>'
  Reset      npm run dev:local -- --reset
`);

const stop = () => {
  worker.kill("SIGINT");
  providers.close();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
worker.on("exit", (code) => {
  providers.close();
  process.exit(code ?? 0);
});
