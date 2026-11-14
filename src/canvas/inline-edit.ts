// #2 Edição inline do nome no card (duplo clique ou F2).
import { keyKind, nameField, type NodeKey } from "@pep-atlas/domain";
import { change, undo } from "../core/history";
import { persist } from "../core/persistence";
import { getByKey, label, state } from "../core/state";
import { refreshAll } from "../app";
import { selectNode } from "../actions";
import { quickCreate } from "./quick-create";
import { esc, notify } from "../ui/dom";
import { renderGraph } from "./render";

interface Editing {
  key: NodeKey;
  original: string;
  /** Criado agora pela criação rápida: cancelar descarta o card. */
  isNew: boolean;
  /** Card de onde a criação rápida partiu (reselecionado ao descartar). */
  origin?: NodeKey;
}

let editing: Editing | null = null;

export const isInlineEditing = (): boolean => editing !== null;
export const editingKey = (): NodeKey | null => editing?.key ?? null;

/** Devolve o foco ao campo em edição (ex.: clique em outra parte do mesmo card). */
export function refocusInlineEdit(): void {
  editorEl()?.focus();
}

function editorEl(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(".name-editor");
}

function autosize(ta: HTMLTextAreaElement): void {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

/** Troca o nome do card por um campo editável, já com o texto selecionado. */
export function startInlineEdit(k: NodeKey, opts: { isNew?: boolean; origin?: NodeKey } = {}): void {
  if (editing) finishInlineEdit(true);
  if (!getByKey(k)) return;
  const nodeEl = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(k)}"]`);
  const nameEl = nodeEl?.querySelector<HTMLElement>(".name");
  if (!nodeEl || !nameEl) return;

  const original = label(k);
  editing = { key: k, original, isNew: !!opts.isNew, origin: opts.origin };
  nodeEl.classList.add("editing");
  nameEl.innerHTML = `<textarea class="name-editor" rows="1" spellcheck="true" aria-label="Editar nome do elemento">${esc(original)}</textarea>`;
  const ta = editorEl() as HTMLTextAreaElement;
  autosize(ta);
  ta.focus();
  ta.select();

  ta.addEventListener("input", () => autosize(ta));
  ta.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      finishInlineEdit(true);
    } else if (e.key === "Tab") {
      // Salva e já encadeia o próximo (Tab) ou um irmão (Shift+Tab).
      e.preventDefault();
      const ok = finishInlineEdit(true);
      if (ok) quickCreate(e.shiftKey ? "sibling" : "next");
    } else if (e.key === "Escape") {
      e.preventDefault();
      finishInlineEdit(false);
    }
  });
  ta.addEventListener("blur", () => finishInlineEdit(true));
}

/**
 * Confirma (save=true) ou descarta a edição. Idempotente.
 * Retorna true se o card continua existindo e selecionado.
 */
export function finishInlineEdit(save: boolean): boolean {
  if (!editing) return false;
  const { key, original, isNew, origin } = editing;
  editing = null;
  const value = (editorEl()?.value ?? original).replace(/\s+/g, " ").trim();
  const o = getByKey(key);

  // Card recém-criado: Esc ou nome vazio descartam a criação inteira.
  if (isNew && (!save || !value)) {
    undo(true);
    if (origin && getByKey(origin)) selectNode(origin);
    notify("Criação cancelada");
    return false;
  }
  if (!o) return false;
  if (!save || value === original) {
    renderGraph();
    return true;
  }
  if (!value) {
    notify("O nome não pode ficar vazio.");
    renderGraph();
    return true;
  }
  if (isNew) {
    // Mesmo passo de desfazer da criação: Ctrl+Z remove o card já nomeado.
    o[nameField(keyKind(key))] = value;
    persist();
    refreshAll(false);
  } else {
    change(() => {
      o[nameField(keyKind(key))] = value;
    });
    notify("Nome atualizado");
  }
  state.selected = { kind: "node", id: key };
  return true;
}
