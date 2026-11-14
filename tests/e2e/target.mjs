import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STORE = "pep-atlas-studio-v4";

export const appUrl = () => process.env.E2E_BASE_URL || `file://${root}/dist/portable/index.html`;

const readFixture = (name) => fs.readFileSync(path.join(root, "tests/e2e/fixtures", name), "utf8");

const INLINE_HANDLER_DIRECTIVE = "script-src-attr";
const INLINE_HANDLER_CONSOLE_PREFIX = "Executing inline event handler violates the following Content Security Policy";
const cspWindows = new WeakMap();

function cspStateOf(page) {
  if (!cspWindows.has(page)) cspWindows.set(page, { open: false, blocked: 0 });
  return cspWindows.get(page);
}

// Sob CSP (servidor), toda violação vira falha: o init script registra a linha no console e o roteiro imprime FAILED, que o run-all reconhece.
// A única exceção é a janela aberta por expectInlineHandlerBlocks, restrita a script-src-attr.
export async function watchCspViolations(page) {
  const state = cspStateOf(page);
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`[CSP] ${event.violatedDirective} bloqueou ${event.blockedURI || "inline"}`);
    });
  });
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() !== "error" || !text.startsWith("[CSP] ")) return;
    if (state.open && text.split(" ")[1] === INLINE_HANDLER_DIRECTIVE) state.blocked++;
    else console.log(`FAILED: violação de CSP ${text}`);
  });
}

// Os roteiros de XSS injetam um payload com onerror="...": o Chrome reporta script-src-attr já no parse inerte do DOMPurify, e é a violação que a CSP deve produzir.
// A tolerância vale só dentro de during(), em torno do passo que renderiza o payload; fora dele qualquer violação (script-src-attr inclusive) falha.
export function expectInlineHandlerBlocks(page) {
  const state = cspStateOf(page);
  return {
    async during(action) {
      state.open = true;
      try {
        await action();
        await page.evaluate(() => 0);
      } finally {
        state.open = false;
      }
    },
    isExpectedConsoleError: (text) => state.open && (text.startsWith(INLINE_HANDLER_CONSOLE_PREFIX) || text.startsWith(`[CSP] ${INLINE_HANDLER_DIRECTIVE} `)),
    verdict: () => (new URL(appUrl()).protocol === "http:" && state.blocked === 0 ? "a CSP deveria bloquear o handler inline do payload (nenhum script-src-attr visto)" : ""),
  };
}

// O canvas nasce limpo: os roteiros que precisam de um mapa gravam a massa sintética antes da carga, sem sobrescrever o que o próprio roteiro já salvou.
export async function openApp(page, { fixture = "oficina-sintetica.json", url = appUrl() } = {}) {
  await watchCspViolations(page);
  await page.addInitScript(([key, raw]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
  }, [STORE, readFixture(fixture)]);
  await page.goto(url);
}
