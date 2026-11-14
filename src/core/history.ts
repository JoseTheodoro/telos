// Desfazer/refazer por snapshot do workspace + helper `change` para mutações.
import { UNDO_LIMIT, upgradeWorkspace } from "@telos/domain";
import { refreshAll } from "../app";
import { $, notify } from "../ui/dom";
import { persist } from "./persistence";
import { state } from "./state";

export function refreshUndo(): void {
  $<HTMLButtonElement>("#undo").disabled = !state.undoStack.length;
  $<HTMLButtonElement>("#redo").disabled = !state.redoStack.length;
}

/** Empilha um snapshot (JSON) já serializado. */
export function pushSnapshot(snapshot: string): void {
  state.undoStack.push(snapshot);
  if (state.undoStack.length > UNDO_LIMIT) state.undoStack.shift();
  state.redoStack = [];
  refreshUndo();
}

export function undoPush(): void {
  pushSnapshot(JSON.stringify(state.ws));
}

export function undo(silent = false): void {
  if (!state.undoStack.length) return;
  state.redoStack.push(JSON.stringify(state.ws));
  state.ws = upgradeWorkspace(JSON.parse(state.undoStack.pop() as string));
  state.selected = null;
  persist();
  refreshAll(false);
  if (!silent) notify("Alteração desfeita e salva");
}

export function redo(): void {
  if (!state.redoStack.length) return;
  state.undoStack.push(JSON.stringify(state.ws));
  state.ws = upgradeWorkspace(JSON.parse(state.redoStack.pop() as string));
  state.selected = null;
  persist();
  refreshAll(false);
  notify("Alteração refeita e salva");
}

/** Toda mutação estrutural passa por aqui: snapshot → mutação → salvar → re-render. */
export function change(fn: () => void): void {
  undoPush();
  fn();
  persist();
  refreshAll(false);
}
