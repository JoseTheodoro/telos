// Roda todos os roteiros contra ../../dist/index.html (faça `npm run build` na raiz antes) ou contra E2E_BASE_URL.
// Cada roteiro imprime um JSON de verificações; falha = linha "FAILED" ou erros de console.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
const SHOTS = path.join(here, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const only = process.argv.slice(2);
const scripts = fs
  .readdirSync(here)
  .filter((f) => f.endsWith(".mjs") && f !== "run-all.mjs" && f !== "target.mjs")
  .filter((f) => !only.length || only.includes(f.replace(".mjs", "")));

let bad = 0;
for (const f of scripts) {
  const args = f === "promote.mjs" ? [ROOT, path.join(here, "fixtures/with-hotspot-box.json")] : [ROOT, SHOTS];
  let out = "";
  let crashed = false;
  try {
    out = execFileSync("node", [path.join(here, f), ...args], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    crashed = true;
    out = String(e.stdout || "") + String(e.stderr || "") + String(e.message);
  }
  // Erro esperado: notes.mjs injeta <img src=x> para testar a sanitização (imagem quebrada).
  const consoleErrors = (out.match(/errors: \[(.*?)\]/s)?.[1] || "")
    .replace(/'Failed to load resource: (net::ERR_FILE_NOT_FOUND|the server responded with a status of 404 \(Not Found\))',?/g, "")
    .trim();
  const failed = crashed || /FAILED|Error:/.test(out) || consoleErrors.length > 0;
  if (failed) bad++;
  console.log(`${failed ? "✗" : "✓"} ${f}`);
  if (failed || process.env.VERBOSE) console.log(out);
}
console.log(bad ? `\n${bad} roteiro(s) com falha` : "\nTodos os roteiros passaram");
process.exit(bad ? 1 : 0);
