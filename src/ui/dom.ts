// Utilitários de DOM e de templates HTML.

export const $ = <T extends HTMLElement = HTMLElement>(selector: string): T =>
  document.querySelector(selector) as T;

export const $$ = <T extends HTMLElement = HTMLElement>(selector: string): T[] =>
  Array.from(document.querySelectorAll<T>(selector));

export const esc = (s: unknown): string =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

let toastTimer: number | undefined;
export function notify(msg: string): void {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 2800);
}

export function saveFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Alvo do evento como HTMLElement (eventos delegados). */
export const target = (e: Event): HTMLElement => e.target as HTMLElement;

// ---------- Campos de formulário (inspetor e modal) ----------

export function field(label: string, id: string, value: unknown, textarea = false, placeholder = ""): string {
  const control = textarea
    ? `<textarea class="input area" data-field="${esc(id)}" id="f-${esc(id)}" placeholder="${esc(placeholder)}">${esc(value || "")}</textarea>`
    : `<input class="input" data-field="${esc(id)}" id="f-${esc(id)}" value="${esc(value || "")}" placeholder="${esc(placeholder)}">`;
  return `<div class="field"><label for="f-${esc(id)}">${esc(label)}</label>${control}</div>`;
}

export function options(label: string, id: string, value: unknown, arr: [string, string][]): string {
  const opts = arr
    .map(([v, n]) => `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(n)}</option>`)
    .join("");
  return `<div class="field"><label for="f-${esc(id)}">${esc(label)}</label><select class="input" data-field="${esc(id)}" id="f-${esc(id)}">${opts}</select></div>`;
}
