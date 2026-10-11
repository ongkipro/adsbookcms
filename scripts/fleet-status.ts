// Which product version each install is on, without opening its repository
// (A-51). Read-only: git fetch, `wrangler deployments list`, and one SELECT
// against each install's D1. The product holds no list of installs (ADR-012),
// so the operator passes the install checkouts:
//
//   npm run fleet:status -- ~/Projects/toko-a ~/Projects/toko-b
//   npm run fleet:status -- --offline ~/Projects/toko-a   # git only
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const dirs = args.filter((arg) => arg !== "--offline");
if (dirs.length === 0) {
  console.error("usage: npm run fleet:status -- [--offline] <install-dir>...");
  process.exit(1);
}

const run = (cwd: string, cmd: string, cmdArgs: string[]) => {
  try {
    return execFileSync(cmd, cmdArgs, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const git = (cwd: string, ...gitArgs: string[]) => run(cwd, "git", gitArgs);
const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "");
const field = (text: string, pattern: RegExp) => text.match(pattern)?.[1] ?? "?";

type Row = Record<string, string>;
const rows: Row[] = [];

for (const dir of dirs) {
  const root = path.resolve(dir.replace(/^~(?=\/)/, process.env.HOME ?? "~"));
  const wrangler = read(path.join(root, "wrangler.jsonc"));
  const versionTs = read(path.join(root, "src/lib/version.ts"));
  const row: Row = {
    install: path.basename(root),
    version: field(versionTs, /version:\s*"([^"]+)"/),
    head: git(root, "rev-parse", "--short", "HEAD") ?? "?",
  };

  git(root, "fetch", "-q", "--all");
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD") ?? "?";
  const counts = git(root, "rev-list", "--left-right", "--count", `HEAD...origin/${branch}`);
  const [ahead, behind] = (counts ?? "").split(/\s+/);
  row.origin = counts === null ? "no upstream" : ahead === "0" && behind === "0" ? "synced" : `+${ahead}/-${behind}`;
  row.dirty = String((git(root, "status", "--porcelain") ?? "").split("\n").filter(Boolean).length);

  // Installs that share history with the product report how far behind it
  // they are; a tree-synced one has no merge base to count from.
  row.product = git(root, "merge-base", "HEAD", "product/main") === null
    ? "no shared history"
    : `${git(root, "rev-list", "--count", "HEAD..product/main")} behind`;

  if (!offline) {
    const worker = field(wrangler, /"name":\s*"([^"]+)"/);
    const database = field(wrangler, /"database_name":\s*"([^"]+)"/);
    const deployments = run(root, "npx", ["wrangler", "deployments", "list", "--name", worker, "--json"]);
    try {
      const list = JSON.parse(deployments ?? "[]") as Array<{ created_on?: string }>;
      row.deployed = list.at(-1)?.created_on?.slice(0, 16).replace("T", " ") ?? "?";
    } catch {
      row.deployed = "?";
    }
    const migrations = run(root, "npx", [
      "wrangler", "d1", "execute", database, "--remote", "--json",
      "--command", "SELECT COUNT(*) AS n FROM d1_migrations",
    ]);
    const applied = migrations?.match(/"n":\s*(\d+)/)?.[1] ?? "?";
    row.schema = `${applied}/${field(versionTs, /schemaVersion:\s*(\d+)/)}`;
  }
  rows.push(row);
}

const columns = Object.keys(rows[0]);
const width = (col: string) => Math.max(col.length, ...rows.map((row) => (row[col] ?? "").length));
const line = (cells: Record<string, string>) => columns.map((col) => (cells[col] ?? "").padEnd(width(col))).join("  ");
console.log(line(Object.fromEntries(columns.map((col) => [col, col]))));
for (const row of rows) console.log(line(row));
