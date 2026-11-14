// #21 Caderno: notas em Markdown, cada uma opcionalmente vinculada a uma jornada ou capítulo.
// Área própria (aba "Caderno" no topo), ao lado do canvas; o recorte da barra lateral filtra as notas.
import { newId, type DocNote } from "@telos/domain";
import { change, pushSnapshot } from "../core/history";
import { persistViewNow, queuePersist } from "../core/persistence";
import { get, state } from "../core/state";
import { $, esc, notify, saveFile, target } from "./dom";
import { renderMarkdown } from "./rich";

export type DocsFilter = "scope" | "all" | "unlinked";
export type DocsMode = "edit" | "split" | "view";

const nowIso = () => new Date().toISOString();

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/** Capítulos de uma jornada, com o número na jornada (01, 02…). */
const chapterNo = (chapterId: string): string => {
  const c = state.ws.chapters.find((x) => x.id === chapterId);
  if (!c) return "";
  return String(state.ws.chapters.filter((x) => x.journeyId === c.journeyId).indexOf(c) + 1).padStart(2, "0");
};

/** Rótulo curto do vínculo ("Cap. 02 · A consulta", "Jornada · …"). */
export function linkLabel(link: string): { text: string; broken: boolean } {
  if (!link) return { text: "Sem vínculo", broken: false };
  const [kind, ...rest] = link.split(":");
  const id = rest.join(":");
  if (kind === "chapter") {
    const c = get("chapter", id);
    return c ? { text: `Cap. ${chapterNo(id)} · ${c.label}`, broken: false } : { text: "Capítulo removido", broken: true };
  }
  if (kind === "journey") {
    const j = get("journey", id);
    return j ? { text: `Jornada · ${j.name}`, broken: false } : { text: "Jornada removida", broken: true };
  }
  return { text: link, broken: true };
}

/** Vínculo sugerido para uma nota nova: o recorte atual (capítulo > jornada). */
function scopeLink(): string {
  const ws = state.ws;
  if (state.focusScene) {
    const s = ws.scenes.find((x) => x.id === state.focusScene);
    if (s) return "chapter:" + s.chapter;
  }
  if (state.focusChapter) return "chapter:" + state.focusChapter;
  if (state.focusJourney) return "journey:" + state.focusJourney;
  return "";
}

/** Vínculos que pertencem ao recorte atual (capítulo → também sua jornada; jornada → também seus capítulos). */
function scopeLinks(): { links: Set<string>; label: string } | null {
  const ws = state.ws;
  let chapterId = state.focusChapter;
  if (state.focusScene) chapterId = ws.scenes.find((x) => x.id === state.focusScene)?.chapter || chapterId;
  if (chapterId) {
    const c = ws.chapters.find((x) => x.id === chapterId);
    if (c) return { links: new Set(["chapter:" + c.id, "journey:" + c.journeyId]), label: `Cap. ${chapterNo(c.id)} · ${c.label}` };
  }
  if (state.focusJourney) {
    const j = ws.journeys.find((x) => x.id === state.focusJourney);
    if (j)
      return {
        links: new Set(["journey:" + j.id, ...ws.chapters.filter((c) => c.journeyId === j.id).map((c) => "chapter:" + c.id)]),
        label: j.name,
      };
  }
  return null;
}

/** Notas ligadas a um nó (inspetor da jornada/capítulo). */
export const docsLinkedTo = (link: string): DocNote[] => state.ws.docs.filter((d) => d.link === link);

function filtered(): DocNote[] {
  const q = state.docsSearch.trim().toLowerCase();
  let list = [...state.ws.docs];
  if (state.docsFilter === "unlinked") list = list.filter((d) => !d.link || linkLabel(d.link).broken);
  if (state.docsFilter === "scope") {
    const sc = scopeLinks();
    if (sc) list = list.filter((d) => sc.links.has(d.link));
  }
  if (q) list = list.filter((d) => (d.title + "\n" + d.body).toLowerCase().includes(q));
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const current = (): DocNote | undefined => state.ws.docs.find((d) => d.id === state.docId);

function excerpt(body: string): string {
  const line = body
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#>*\-\s`|]+/, "").trim())
    .find(Boolean);
  return line ? (line.length > 90 ? line.slice(0, 89) + "…" : line) : "Nota vazia";
}

function linkOptions(cur: string): string {
  const ws = state.ws;
  const opt = (v: string, text: string) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(text)}</option>`;
  let html = opt("", "Sem vínculo");
  for (const j of ws.journeys) {
    html += `<optgroup label="${esc(j.name)}">${opt("journey:" + j.id, "Jornada inteira")}`;
    for (const c of ws.chapters.filter((x) => x.journeyId === j.id)) html += opt("chapter:" + c.id, `Cap. ${chapterNo(c.id)} · ${c.label}`);
    html += `</optgroup>`;
  }
  if (cur && linkLabel(cur).broken) html += opt(cur, linkLabel(cur).text);
  return html;
}

const TOOLS: [string, string, string][] = [
  ["bold", "B", "Negrito (Ctrl+B)"],
  ["italic", "I", "Itálico (Ctrl+I)"],
  ["h2", "H", "Título"],
  ["ul", "•", "Lista"],
  ["ol", "1.", "Lista numerada"],
  ["task", "☐", "Tarefa"],
  ["quote", "❝", "Citação"],
  ["code", "`", "Código na linha"],
  ["link", "↗", "Link"],
  ["table", "▦", "Tabela"],
  ["hr", "—", "Separador"],
];

const BLOCK_LANGS = ["sql", "json", "bash", "javascript", "typescript", "python", "yaml", "xml", "http", "java", "csharp", "go", ""];

function listHtml(): string {
  const items = filtered();
  const sc = scopeLinks();
  const seg = (id: DocsFilter, text: string) =>
    `<button type="button" class="seg-btn${state.docsFilter === id ? " active" : ""}" data-docs-filter="${id}" aria-pressed="${state.docsFilter === id}">${text}</button>`;
  const rows =
    items
      .map((d) => {
        const l = linkLabel(d.link);
        return `<button type="button" class="doc-row${d.id === state.docId ? " active" : ""}" data-doc="${esc(d.id)}"><strong>${esc(d.title || "Sem título")}</strong><small>${esc(excerpt(d.body))}</small><span class="doc-row-meta"><i class="doc-link${l.broken ? " broken" : d.link ? "" : " none"}">${esc(l.text)}</i><time>${esc(fmtDate(d.updatedAt))}</time></span></button>`;
      })
      .join("") ||
    `<div class="emptymsg">${state.ws.docs.length ? "Nenhuma nota neste filtro." : "Nenhuma nota ainda.<br>Crie a primeira com ＋ Nova nota."}</div>`;
  return `<div class="docs-list-head"><div><div class="eyebrow">Caderno</div><h2>Notas em Markdown</h2></div><button type="button" class="btn primary sm" data-doc-new>＋ Nova nota</button></div>
<input class="lookup" id="docsSearch" value="${esc(state.docsSearch)}" placeholder="Buscar no caderno…">
<div class="seg docs-filter" role="group" aria-label="Filtrar notas">${seg("scope", sc ? "Recorte" : "Recorte · tudo")}${seg("all", "Todas")}${seg("unlinked", "Sem vínculo")}</div>
${state.docsFilter === "scope" ? `<p class="filter-help">${sc ? `Recorte: <b>${esc(sc.label)}</b> (escolha na barra lateral)` : "Mapa completo: mostrando todas"}</p>` : ""}
<div class="docs-rows">${rows}</div>
<div class="docs-list-foot"><span>${items.length} de ${state.ws.docs.length} nota${state.ws.docs.length === 1 ? "" : "s"}</span>${items.length ? `<button type="button" class="btn sm" data-doc-export-all title="Exporta as notas deste filtro num único .md">↓ .md do filtro</button>` : ""}</div>`;
}

function editorHtml(): string {
  const d = current();
  if (!d)
    return `<div class="docs-empty"><div class="empty-icon">✎</div><h3>Caderno da descoberta</h3><p>Anotações em Markdown: atas, decisões, consultas SQL, payloads JSON, comandos… Cada nota pode ficar vinculada a uma jornada ou a um capítulo e aparece no inspetor dele no canvas.</p><button type="button" class="btn primary" data-doc-new>＋ Nova nota</button></div>`;
  const mode = state.docsMode;
  const seg = (id: DocsMode, text: string) =>
    `<button type="button" class="seg-btn${mode === id ? " active" : ""}" data-docs-mode="${id}" aria-pressed="${mode === id}">${text}</button>`;
  const tools =
    TOOLS.map(([id, text, title]) => `<button type="button" class="md-tool" data-md="${id}" title="${title}">${text}</button>`).join("") +
    `<span class="md-sep"></span><select class="md-lang" id="mdLang" title="Linguagem do bloco de código">${BLOCK_LANGS.map((l) => `<option value="${l}">${l || "texto"}</option>`).join("")}</select><button type="button" class="md-tool wide" data-md="codeblock" title="Bloco de código com destaque">{ } Bloco</button>`;
  const l = linkLabel(d.link);
  return `<div class="doc-head"><input class="doc-title" id="docTitle" value="${esc(d.title)}" placeholder="Título da nota" aria-label="Título da nota"><div class="doc-actions"><div class="seg" role="group" aria-label="Modo do editor">${seg("edit", "✎ Editar")}${seg("split", "◫ Dividir")}${seg("view", "◉ Ver")}</div><button type="button" class="btn sm" data-doc-export title="Baixar esta nota como .md">↓ .md</button><button type="button" class="btn sm danger" data-doc-delete>✕</button></div></div>
<div class="doc-meta"><label>Vínculo <select id="docLink" class="doc-link-select">${linkOptions(d.link)}</select></label>${d.link && !l.broken ? `<button type="button" class="btn sm" data-doc-goto title="Abrir este recorte no canvas">◇ Ver no canvas</button>` : ""}<small>Criada ${esc(fmtDate(d.createdAt))} · editada ${esc(fmtDate(d.updatedAt))}</small></div>
${mode !== "view" ? `<div class="md-toolbar" role="toolbar" aria-label="Formatação Markdown">${tools}</div>` : ""}
<div class="doc-panes mode-${mode}">${mode !== "view" ? `<textarea id="docBody" class="doc-src" spellcheck="true" placeholder="Escreva em Markdown…&#10;&#10;## Decisões&#10;- [ ] validar com a TI&#10;&#10;\`\`\`sql&#10;select * from atendimento where …&#10;\`\`\`">${esc(d.body)}</textarea>` : ""}${mode !== "edit" ? `<div class="doc-preview md" id="docPreview">${preview(d.body)}</div>` : ""}</div>`;
}

const preview = (body: string) => (body.trim() ? renderMarkdown(body) : `<p class="note-placeholder">Nada para visualizar ainda.</p>`);

/** Checkboxes de tarefa clicáveis na pré-visualização (alternam [ ] ↔ [x] no texto). */
function enableTasks(): void {
  document.querySelectorAll<HTMLInputElement>("#docPreview input[type=checkbox]").forEach((i) => (i.disabled = false));
}

export function renderDocs(): void {
  const view = $("#docsView");
  const on = state.area === "docs";
  document.querySelector(".body")?.classList.toggle("docs-mode", on);
  view.hidden = !on;
  const count = $("#docsCount");
  if (count) count.textContent = String(state.ws.docs.length);
  document.querySelectorAll<HTMLElement>("[data-area]").forEach((b) => {
    const active = b.dataset.area === state.area;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  if (!on) return;
  if (state.docId && !current()) state.docId = "";
  // Preserva foco/seleção ao re-renderizar enquanto se digita no título.
  view.innerHTML = `<div class="docs-list">${listHtml()}</div><div class="docs-editor">${editorHtml()}</div>`;
  enableTasks();
}

/** Atualiza só a lista (sem perder o foco do editor). */
function refreshList(): void {
  const el = document.querySelector(".docs-list");
  if (el) el.innerHTML = listHtml();
  const count = $("#docsCount");
  if (count) count.textContent = String(state.ws.docs.length);
}

export function setArea(area: "canvas" | "docs"): void {
  if (state.area === area) return;
  state.area = area;
  renderDocs();
  persistViewNow();
}

export function openDoc(id: string): void {
  state.docId = id;
  state.area = "docs";
  renderDocs();
  persistViewNow();
}

export function newDoc(link = scopeLink()): void {
  const d: DocNote = { id: "d" + newId(), title: "", body: "", link, createdAt: nowIso(), updatedAt: nowIso() };
  change(() => {
    state.ws.docs.push(d);
  });
  state.docId = d.id;
  state.area = "docs";
  if (state.docsMode === "view") state.docsMode = "split";
  // Filtro que esconderia a nota nova volta para "Todas".
  if (!filtered().some((x) => x.id === d.id)) state.docsFilter = "all";
  renderDocs();
  persistViewNow();
  $<HTMLInputElement>("#docTitle")?.focus();
}

function exportMd(list: DocNote[], name: string): void {
  const block = (d: DocNote) => {
    const l = linkLabel(d.link);
    const title = d.title || "Sem título";
    const head = d.body.trimStart().startsWith("# ") ? "" : `# ${title}\n\n`;
    const meta = `> ${l.text} · atualizada em ${fmtDate(d.updatedAt)}\n\n`;
    return head + meta + d.body.trim() + "\n";
  };
  saveFile(name, list.map(block).join("\n---\n\n"), "text/markdown;charset=utf-8");
}

const slug = (s: string) =>
  (s || "nota")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "nota";

/** Aplica um comando da barra Markdown na seleção do textarea. */
function applyTool(ta: HTMLTextAreaElement, tool: string): void {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const sel = value.slice(a, b);
  const wrap = (l: string, r = l, ph = "texto") => {
    const inner = sel || ph;
    ta.setRangeText(l + inner + r, a, b, "select");
    ta.setSelectionRange(a + l.length, a + l.length + inner.length);
  };
  const prefix = (p: string | ((i: number) => string)) => {
    const ls = value.lastIndexOf("\n", a - 1) + 1;
    const block = value.slice(ls, b) || "";
    const lines = block.split("\n").map((line, i) => (typeof p === "string" ? p : p(i)) + line);
    ta.setRangeText(lines.join("\n"), ls, b, "end");
  };
  const insert = (text: string) => ta.setRangeText(text, a, b, "end");
  const lang = ($<HTMLSelectElement>("#mdLang")?.value ?? "sql").trim();
  switch (tool) {
    case "bold":
      wrap("**");
      break;
    case "italic":
      wrap("_");
      break;
    case "code":
      wrap("`", "`", "código");
      break;
    case "h2":
      prefix("## ");
      break;
    case "ul":
      prefix("- ");
      break;
    case "ol":
      prefix((i) => `${i + 1}. `);
      break;
    case "task":
      prefix("- [ ] ");
      break;
    case "quote":
      prefix("> ");
      break;
    case "link":
      wrap("[", "](https://)", "texto do link");
      break;
    case "hr":
      insert("\n\n---\n\n");
      break;
    case "table":
      insert("\n\n| Campo | Origem | Observação |\n| --- | --- | --- |\n|  |  |  |\n\n");
      break;
    case "codeblock": {
      const body = sel || "";
      const start = (a > 0 && value[a - 1] !== "\n" ? "\n" : "") + "```" + lang + "\n";
      ta.setRangeText(start + body + "\n```\n", a, b, "end");
      const caret = a + start.length + body.length;
      ta.setSelectionRange(caret, caret);
      break;
    }
  }
  ta.focus();
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

export function bindDocs(): void {
  document
    .querySelectorAll<HTMLElement>("[data-area]")
    .forEach((b) => b.addEventListener("click", () => setArea(b.dataset.area as "canvas" | "docs")));
  const view = $("#docsView");

  // Undo: snapshot ao entrar num campo, empilhado só na primeira alteração (como no inspetor).
  let pending: string | null = null;
  view.addEventListener("focusin", (e) => {
    const t = target(e);
    pending = t.id === "docTitle" || t.id === "docBody" ? JSON.stringify(state.ws) : null;
  });

  let previewTimer = 0;
  view.addEventListener("input", (e) => {
    const t = target(e) as HTMLInputElement;
    if (t.id === "docsSearch") {
      state.docsSearch = t.value;
      const rows = document.querySelector(".docs-rows");
      const tmp = document.createElement("div");
      tmp.innerHTML = listHtml();
      const fresh = tmp.querySelector(".docs-rows");
      if (rows && fresh) rows.replaceWith(fresh);
      return;
    }
    const d = current();
    if (!d || (t.id !== "docTitle" && t.id !== "docBody")) return;
    if (pending) {
      pushSnapshot(pending);
      pending = null;
    }
    if (t.id === "docTitle") d.title = t.value;
    else {
      d.body = t.value;
      clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => {
        const p = document.getElementById("docPreview");
        if (p) {
          p.innerHTML = preview(d.body);
          enableTasks();
        }
      }, 120);
    }
    d.updatedAt = nowIso();
    queuePersist();
    refreshList();
  });

  view.addEventListener("change", (e) => {
    const t = target(e) as HTMLSelectElement;
    const d = current();
    if (t.id === "docLink" && d && d.link !== t.value) {
      change(() => {
        d.link = t.value;
        d.updatedAt = nowIso();
      });
      notify(d.link ? `Nota vinculada a ${linkLabel(d.link).text}` : "Nota sem vínculo");
    }
  });

  view.addEventListener("keydown", (e) => {
    const t = target(e) as HTMLTextAreaElement;
    if (t.id === "docTitle" && e.key === "Enter") {
      e.preventDefault();
      document.getElementById("docBody")?.focus();
      return;
    }
    if (t.id !== "docBody") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "b" || e.key === "i")) {
      e.preventDefault();
      applyTool(t, e.key === "b" ? "bold" : "italic");
    } else if (e.key === "Tab" && !e.shiftKey && !mod) {
      e.preventDefault();
      if (!document.execCommand("insertText", false, "  ")) t.setRangeText("  ", t.selectionStart, t.selectionEnd, "end");
    }
  });

  view.addEventListener("click", (e) => {
    const t = target(e);
    const row = t.closest<HTMLElement>("[data-doc]");
    if (row) {
      state.docId = row.dataset.doc as string;
      renderDocs();
      persistViewNow();
      return;
    }
    if (t.closest("[data-doc-new]")) return newDoc();
    const f = t.closest<HTMLElement>("[data-docs-filter]");
    if (f) {
      state.docsFilter = f.dataset.docsFilter as DocsFilter;
      refreshList();
      return;
    }
    const m = t.closest<HTMLElement>("[data-docs-mode]");
    if (m) {
      state.docsMode = m.dataset.docsMode as DocsMode;
      renderDocs();
      persistViewNow();
      return;
    }
    const tool = t.closest<HTMLElement>("[data-md]");
    const ta = document.getElementById("docBody") as HTMLTextAreaElement | null;
    if (tool && ta) return applyTool(ta, tool.dataset.md as string);
    const d = current();
    if (t.closest("[data-doc-export]") && d) return exportMd([d], slug(d.title) + ".md");
    if (t.closest("[data-doc-export-all]")) return exportMd(filtered(), "caderno-telos.md");
    if (t.closest("[data-doc-delete]") && d) {
      if (!confirm(`Excluir a nota "${d.title || "Sem título"}"? Ctrl+Z desfaz.`)) return;
      change(() => {
        state.ws.docs.splice(state.ws.docs.indexOf(d), 1);
      });
      state.docId = "";
      renderDocs();
      notify("Nota excluída (Ctrl+Z desfaz)");
      return;
    }
    if (t.closest("[data-doc-goto]") && d) return gotoCanvas(d.link);
    // Tarefa na pré-visualização: alterna o n-ésimo "[ ]" do texto.
    if (t.matches("#docPreview input[type=checkbox]") && d) {
      const boxes = [...document.querySelectorAll("#docPreview input[type=checkbox]")];
      const n = boxes.indexOf(t);
      let i = -1;
      const next = d.body.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/gm, (all, lead: string, mark: string) =>
        ++i === n ? `${lead}[${mark === " " ? "x" : " "}]` : all,
      );
      if (next !== d.body)
        change(() => {
          d.body = next;
          d.updatedAt = nowIso();
        });
    }
  });
}

let gotoHandler: (link: string) => void = () => {};
/** O app injeta a navegação para o canvas (evita dependência circular com actions). */
export const onGotoCanvas = (fn: (link: string) => void): void => {
  gotoHandler = fn;
};
function gotoCanvas(link: string): void {
  state.area = "canvas";
  renderDocs();
  gotoHandler(link);
  persistViewNow();
}
