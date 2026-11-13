// Persistência no localStorage (mesma chave da v1.5 → dados existentes continuam válidos).
import seed from "../data/seed.json";
import { LEGACY_STORE, SCHEMA, STORE } from "../domain/constants";
import { graphInit, upgradeWorkspace } from "../domain/model";
import type { Workspace } from "../domain/types";
import { $ } from "../ui/dom";
import { state } from "./state";

/** Carrega do navegador; sem dados salvos, usa o seed da oficina. */
export function loadInitialWorkspace(): Workspace {
  let saved: unknown = null;
  try {
    const raw = localStorage.getItem(STORE) || localStorage.getItem(LEGACY_STORE);
    if (raw) saved = JSON.parse(raw);
  } catch {
    /* storage indisponível ou corrompido: cai no seed */
  }
  let ws: any = saved;
  if (!ws) ws = graphInit(seed);
  else if (!ws.graph) ws = graphInit(ws);
  return upgradeWorkspace(ws);
}

export function persist(): void {
  try {
    state.ws.schema = SCHEMA;
    localStorage.setItem(STORE, JSON.stringify(state.ws));
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    $("#savestate").textContent = "● Salvo no navegador · " + time;
    $("#savestate").title =
      "As alterações persistem neste navegador. Exporte JSON para backup ou uso em outro computador.";
  } catch (err) {
    $("#savestate").textContent = "⚠ Falha ao salvar · exporte JSON";
    console.warn("LocalStorage indisponível", err);
  }
}

let viewTimer: number | undefined;

/** Grava recorte, câmera e aba atuais junto do workspace. */
export function persistViewNow(): void {
  clearTimeout(viewTimer);
  if (!state.ws) return;
  state.ws.view = {
    journey: state.focusJourney,
    chapter: state.focusChapter,
    scene: state.focusScene,
    camera: { ...state.cam },
    sidebarTab: state.sidebarTab,
    legendCollapsed: state.legendCollapsed,
    layoutMode: state.layoutMode,
  };
  persist();
}

export function queueViewPersist(): void {
  clearTimeout(viewTimer);
  viewTimer = window.setTimeout(persistViewNow, 400);
}

export function cancelViewPersist(): void {
  clearTimeout(viewTimer);
}
