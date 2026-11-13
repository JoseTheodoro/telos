// #2 Edição inline do nome no card (duplo clique ou F2).
import { keyKind } from "../domain/keys";
import { nameField } from "../domain/model";
import type { NodeKey } from "../domain/types";
import { change } from "../core/history";
import { getByKey, label } from "../core/state";
import { esc, notify } from "../ui/dom";
import { renderGraph } from "./render";

let editing: { key: NodeKey; original: string } | null = null;

export const isInlineEditing = (): boolean => editing !== null;

function editorEl(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>(".name-editor");
}

function autosize(ta: HTMLTextAreaElement): void {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

/** Troca o nome do card por um campo editável, já com o texto selecionado. */
export function startInlineEdit(k: NodeKey): void {
  if (editing) finishInlineEdit(true);
  if (!getByKey(k)) return;
  const nodeEl = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(k)}"]`);
  const nameEl = nodeEl?.querySelector<HTMLElement>(".name");
  if (!nodeEl || !nameEl) return;

  const original = label(k);
  editing = { key: k, original };
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
    } else if (e.key === "Escape") {
      e.preventDefault();
      finishInlineEdit(false);
    }
  });
  ta.addEventListener("blur", () => finishInlineEdit(true));
}

/** Confirma (save=true) ou descarta a edição. Idempotente. */
export function finishInlineEdit(save: boolean): void {
  if (!editing) return;
  const { key, original } = editing;
  editing = null;
  const value = (editorEl()?.value ?? original).replace(/\s+/g, " ").trim();

  if (!save || value === original) {
    renderGraph();
    return;
  }
  if (!value) {
    notify("O nome não pode ficar vazio.");
    renderGraph();
    return;
  }
  const o = getByKey(key);
  if (!o) return;
  change(() => {
    o[nameField(keyKind(key))] = value;
  });
  notify("Nome atualizado");
}
