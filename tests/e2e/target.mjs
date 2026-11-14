import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const STORE = "pep-atlas-studio-v4";

export const appUrl = () => process.env.E2E_BASE_URL || `file://${root}/dist/portable/index.html`;

const readFixture = (name) => fs.readFileSync(path.join(root, "tests/e2e/fixtures", name), "utf8");

// Sob CSP (servidor), toda violação vira falha: o init script registra a linha no console e o roteiro imprime FAILED, que o run-all reconhece.
export async function watchCspViolations(page, { allowedDirectives = [] } = {}) {
  await page.addInitScript(
    (allowed) => {
      document.addEventListener("securitypolicyviolation", (event) => {
        if (!allowed.includes(event.violatedDirective)) console.error(`[CSP] ${event.violatedDirective} bloqueou ${event.blockedURI || "inline"}`);
      });
    },
    allowedDirectives,
  );
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().startsWith("[CSP] ")) console.log(`FAILED: violação de CSP ${message.text()}`);
  });
}

// Mensagem nativa do Chrome para o handler inline do payload de XSS bloqueado pela CSP; os roteiros de XSS a descartam junto com allowedCspDirectives.
export const isBlockedInlineHandlerMessage = (text) => text.startsWith("Executing inline event handler violates the following Content Security Policy");

// O canvas nasce limpo: os roteiros que precisam de um mapa gravam a massa sintética antes da carga, sem sobrescrever o que o próprio roteiro já salvou.
//
// allowedCspDirectives existe para os roteiros de XSS: o payload hostil com onerror="..." faz o Chrome reportar script-src-attr já no parse inerte do DOMPurify, e é exatamente a violação que a CSP deve produzir; o roteiro continua afirmando que o handler nunca roda.
export async function openApp(page, { fixture = "oficina-sintetica.json", url = appUrl(), allowedCspDirectives = [] } = {}) {
  await watchCspViolations(page, { allowedDirectives: allowedCspDirectives });
  await page.addInitScript(([key, raw]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
  }, [STORE, readFixture(fixture)]);
  await page.goto(url);
}
