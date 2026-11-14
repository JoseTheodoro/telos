// Sobe o servidor compilado (exige `npm run build` feito antes) numa porta livre e roda todos os roteiros contra ele.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverDir = path.join(root, "server");
const HEALTH_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 15_000;

for (const required of [path.join(serverDir, "dist/main.js"), path.join(root, "dist/web/index.html")]) {
  if (!fs.existsSync(required)) {
    console.error(`Build ausente: ${required}. Rode "npm run build" na raiz antes.`);
    process.exit(1);
  }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

async function waitForHealth(baseUrl, server) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`o servidor encerrou antes de ficar saudável (código ${server.exitCode})`);
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch {
      // o servidor ainda não aceita conexões
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`o servidor não respondeu /health em ${HEALTH_TIMEOUT_MS / 1000} s`);
}

const stop = (server) =>
  new Promise((resolve) => {
    if (server.exitCode !== null) return resolve();
    const killer = setTimeout(() => server.kill("SIGKILL"), STOP_TIMEOUT_MS);
    server.once("exit", () => {
      clearTimeout(killer);
      resolve();
    });
    server.kill("SIGTERM");
  });

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["--import", "./dist/Infrastructure/Observability/instrumentation.js", "./dist/main.js"],
  { cwd: serverDir, env: { ...process.env, NODE_ENV: "production", PORT: String(port), HOST: "127.0.0.1" }, stdio: ["ignore", "ignore", "inherit"] },
);

let exitCode = 1;
try {
  await waitForHealth(baseUrl, server);
  const run = spawn(process.execPath, [path.join(root, "tests/e2e/run-all.mjs"), ...process.argv.slice(2)], {
    env: { ...process.env, E2E_BASE_URL: baseUrl },
    stdio: "inherit",
  });
  exitCode = await new Promise((resolve) => run.once("exit", (code) => resolve(code ?? 1)));
} catch (error) {
  console.error(error.message);
} finally {
  await stop(server);
}
process.exit(exitCode);
