// Persistência no localStorage (mesma chave da v1.5 → dados existentes continuam válidos).
import seed from "../data/seed.json";
import { LEGACY_STORE, SCHEMA, STORE } from "../domain/constants";
import { graphInit, upgradeWorkspace } from "../domain/model";
import type { Workspace } from "../domain/types";
import { $, notify } from "../ui/dom";
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

/** O localStorage guarda cerca de 5 MB por origem: a partir daqui o usuário é avisado antes da falha. */
const STORAGE_WARN_CHARS = 4 * 1024 * 1024;
const TEXT_PERSIST_DELAY_MS = 300;
let pendingPersistTimer: number | undefined;
let sizeWarningShown = false;

export function persist(): void {
  clearTimeout(pendingPersistTimer);
  pendingPersistTimer = undefined;
  const saveIndicator = $("#savestate");
  try {
    state.ws.schema = SCHEMA;
    const serializedWorkspace = JSON.stringify(state.ws);
    localStorage.setItem(STORE, serializedWorkspace);
    const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const nearStorageLimit = serializedWorkspace.length > STORAGE_WARN_CHARS;
    saveIndicator.classList.toggle("warn", nearStorageLimit);
    if (!nearStorageLimit) {
      saveIndicator.textContent = "● Salvo no navegador · " + time;
      saveIndicator.title =
        "As alterações persistem neste navegador. Exporte JSON para backup ou uso em outro computador.";
      return;
    }
    const sizeMb = (serializedWorkspace.length / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    saveIndicator.textContent = `⚠ Salvo · ${sizeMb} MB, perto do limite · ${time}`;
    saveIndicator.title =
      "O navegador guarda cerca de 5 MB por origem. Exporte o Backup JSON e considere dividir o mapa ou remover notas grandes.";
    // O indicador some em telas estreitas (< 1250 px): o aviso também sai como toast, uma vez por sessão.
    if (!sizeWarningShown) {
      sizeWarningShown = true;
      notify(`Mapa com ${sizeMb} MB, perto do limite do navegador (~5 MB). Exporte o Backup JSON.`);
    }
  } catch (err) {
    saveIndicator.classList.add("warn");
    saveIndicator.textContent = "⚠ Falha ao salvar · exporte JSON";
    console.warn("LocalStorage indisponível", err);
  }
}

/**
 * Edição de texto contínua: as teclas viram uma gravação só. O que estiver pendente é gravado
 * pelo próximo persist() (inclusive o do beforeunload, via persistViewNow).
 */
export function queuePersist(): void {
  clearTimeout(pendingPersistTimer);
  pendingPersistTimer = window.setTimeout(persist, TEXT_PERSIST_DELAY_MS);
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
    lanes: state.lanes,
    emotion: state.emotion,
    area: state.area,
    docId: state.docId,
    docsMode: state.docsMode,
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
