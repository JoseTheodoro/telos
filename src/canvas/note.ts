// #10 Nota livre no canvas: nasce onde o cursor está, edita dentro do próprio card
// (texto, Markdown ou código) e aparece no recorte em que foi criada.
import { FREE_PLACED_KINDS, buildEntity, newEntityId, keyKind, nodeKey, type NodeKey, type NoteItem, type Point } from "@pep-atlas/domain";
import { change, pushSnapshot, refreshUndo } from "../core/history";
import { persist } from "../core/persistence";
import { get, getByKey, setFocus, state } from "../core/state";
import { renderInspector } from "../ui/inspector";
import { renderSidebar } from "../ui/sidebar";
import { $, esc, notify } from "../ui/dom";
import { copyText, isCodeFormat } from "../ui/rich";
import { localPoint } from "./camera";
import { activePositions } from "./layout";
import { renderGraph } from "./render";
import { scopeKey } from "./visibility";

const NOTE_W = 320;
const NOTE_H = 180;

/** Último ponto do cursor sobre o canvas (coordenadas do mundo). */
let pointer: Point | null = null;
export const rememberPointer = (p: Point | null): void => {
  pointer = p;
};
export const lastPointer = (): Point | null => pointer;

/** Formato da próxima nota (o último escolhido). */
let lastFormat = "text";
export const rememberFormat = (f: string): void => {
  lastFormat = f;
};

/**
 * Cria uma nota. `atCursor`: no ponto do cursor (atalho de teclado);
 * senão, no centro da área visível (botão).
 */
export function addNote(atCursor = false): void {
  const ws = state.ws;
  const id = newEntityId(ws, "note");
  const k = nodeKey("note", id);
  const scope = scopeKey();
  const note = buildEntity("note", id, "", "Nota", (f) => (f === "format" ? lastFormat : f === "scope" ? scope : "")) as NoteItem;
  let at = atCursor ? pointer : null;
  if (!at) {
    const r = $("#stage").getBoundingClientRect();
    const c = localPoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    at = { x: c.x - NOTE_W / 2, y: c.y - NOTE_H / 2 };
  }
  change(() => {
    ws.canvasNotes.push(note);
    activePositions()[k] = { x: Math.round(at!.x), y: Math.round(at!.y) };
    state.selected = { kind: "node", id: k };
  });
  startNoteEdit(k, { isNew: true });
}

let editing: { key: NodeKey; original: string; isNew: boolean; snap: string } | null = null;

export const isNoteEditing = (): boolean => !!editing;

const editorEl = () => document.querySelector<HTMLTextAreaElement>(".note-editor");

/** Abre o editor dentro do card (substitui o conteúdo renderizado por um textarea). */
export function startNoteEdit(k: NodeKey, opts: { isNew?: boolean } = {}): void {
  if (editing) finishNoteEdit(true);
  const o = getByKey(k) as NoteItem | undefined;
  const card = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(k)}"]`);
  const body = card?.querySelector<HTMLElement>(".note-body");
  if (!o || !card || !body) return;
  editing = { key: k, original: o.text, isNew: !!opts.isNew, snap: JSON.stringify(state.ws) };
  card.classList.add("editing");
  const code = isCodeFormat(o.format);
  body.innerHTML = `<textarea class="note-editor${code ? " is-code" : ""}" spellcheck="${!code}" aria-label="Conteúdo da nota" placeholder="${code ? "Cole ou escreva o código…" : "Escreva a nota…"}">${esc(o.text)}</textarea>`;
  const ta = editorEl()!;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === "Escape") {
      // Esc salva e fecha (texto longo não se perde por engano; Ctrl+Z desfaz).
      e.preventDefault();
      finishNoteEdit(true);
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      finishNoteEdit(true);
    } else if (e.key === "Tab" && !e.shiftKey) {
      // Tab indenta (código); o foco não sai da nota.
      e.preventDefault();
      if (!document.execCommand("insertText", false, "  ")) ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end");
    }
  });
  ta.addEventListener("blur", () => finishNoteEdit(true));
}

/** Fecha o editor. Nota nova que ficou vazia é descartada (sem deixar "desfazer" vazio). */
export function finishNoteEdit(commit: boolean): void {
  const ed = editing;
  if (!ed) return;
  editing = null;
  const ta = editorEl();
  const o = getByKey(ed.key) as NoteItem | undefined;
  const value = commit && ta ? ta.value : ed.original;
  if (o && ed.isNew && !value.trim()) {
    const ws = state.ws;
    ws.canvasNotes.splice(ws.canvasNotes.indexOf(o), 1);
    for (const lay of Object.values(ws.graph.layouts || {})) delete lay[ed.key];
    ws.graph.edges = ws.graph.edges.filter((e) => e.from !== ed.key && e.to !== ed.key);
    state.undoStack.pop(); // o snapshot da criação
    refreshUndo();
    if (state.selected?.kind === "node" && state.selected.id === ed.key) state.selected = null;
    notify("Nota vazia descartada");
  } else if (o && value !== o.text) {
    if (!ed.isNew) pushSnapshot(ed.snap);
    o.text = value;
  }
  persist();
  renderGraph();
  renderInspector();
  renderSidebar();
}

export async function copyNote(k: NodeKey): Promise<void> {
  const o = getByKey(k) as NoteItem | undefined;
  if (!o) return;
  if (!o.text) {
    notify("A nota está vazia");
    return;
  }
  notify((await copyText(o.text)) ? "Conteúdo da nota copiado" : "Não foi possível copiar");
}

/** Nome legível do recorte onde a nota aparece. */
export function scopeName(scope: string): string {
  const [kind, ...rest] = scope.split(":");
  const id = rest.join(":");
  if (kind === "scene") return "Cena · " + String(get("scene", id)?.title ?? "(removida)");
  if (kind === "chapter") return "Capítulo · " + String(get("chapter", id)?.label ?? "(removido)");
  if (kind === "journey") return "Jornada · " + String(get("journey", id)?.name ?? "(removida)");
  return "Mapa completo";
}

/** Ajusta o recorte para o da nota ou moldura (usado ao localizar pelo catálogo). */
export function focusScopeOf(k: NodeKey): void {
  const o = getByKey(k) as { scope: string } | undefined;
  if (!o || !FREE_PLACED_KINDS.includes(keyKind(k))) return;
  const [kind, ...rest] = o.scope.split(":");
  const id = rest.join(":");
  const ws = state.ws;
  if (kind === "scene") {
    const s = ws.scenes.find((x) => x.id === id);
    const c = ws.chapters.find((x) => x.id === s?.chapter);
    if (s) return setFocus(c?.journeyId || "", s.chapter, s.id);
  } else if (kind === "chapter") {
    const c = ws.chapters.find((x) => x.id === id);
    if (c) return setFocus(c.journeyId, c.id, "");
  } else if (kind === "journey" && ws.journeys.some((j) => j.id === id)) return setFocus(id, "", "");
  // Recorte de origem não existe mais: o item passa a morar no mapa completo.
  o.scope = "all";
  setFocus("", "", "");
}
