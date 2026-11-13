import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STORE = "pep-atlas-studio-v4";

export const appUrl = () => process.env.E2E_BASE_URL || `file://${root}/dist/index.html`;

const readFixture = (name) => fs.readFileSync(path.join(root, "tests/e2e/fixtures", name), "utf8");

// O canvas nasce limpo: os roteiros que precisam de um mapa gravam a massa sintética antes da carga, sem sobrescrever o que o próprio roteiro já salvou.
export async function openApp(page, { fixture = "oficina-sintetica.json", url = appUrl() } = {}) {
  await page.addInitScript(([key, raw]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
  }, [STORE, readFixture(fixture)]);
  await page.goto(url);
}
