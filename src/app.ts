// Orquestração: render completo, carga inicial, barra de ferramentas e teclado.
import { NODE_H } from "./domain/constants";
import { deep } from "./domain/model";
import type { LayoutMode, ToolMode } from "./domain/types";
import { redo, refreshUndo, undo } from "./core/history";
import { loadInitialWorkspace, persist, persistViewNow } from "./core/persistence";
import { setFocus, state } from "./core/state";
import { safeRemoveSelection } from "./actions";
import { cameraApply, fit, zoom } from "./canvas/camera";
import { bindCanvas } from "./canvas/interactions";
import { startInlineEdit } from "./canvas/inline-edit";
import { quickCreate } from "./canvas/quick-create";
import { addHotspot } from "./canvas/hotspot";
import { bindLegend } from "./canvas/legend";
import { autoLayout, ensurePositions, pos } from "./canvas/layout";
import { renderGraph } from "./canvas/render";
import { bindImport, csvExport, exportJson, svgExport } from "./io/files";
import { bindInspector, renderInspector } from "./ui/inspector";
import { bindModal, confirmWipe, createModal, listConnections } from "./ui/modal";
import { bindSidebar, renderFilters, renderSidebar } from "./ui/sidebar";
import { $, $$, notify, target } from "./ui/dom";

export function refreshAll(autoFit = false): void {
  ensurePositions();
  renderSidebar();
  renderFilters();
  renderGraph();
  renderInspector();
  refreshUndo();
  if (autoFit) fit();
  else cameraApply();
}

export function refreshTools(): void {
  $$("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === state.mode));
  $$("[data-layout]").forEach((b) => {
    const on = b.dataset.layout === state.layoutMode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  $("#stage").style.cursor = state.mode === "connect" ? "crosshair" : "grab";
}

function setMode(mode: ToolMode): void {
  state.mode = mode;
  if (mode === "pointer") state.connectStart = null;
  refreshTools();
}

/** #6 Alterna Timeline ⇄ Camadas (cada modo guarda as próprias posições). */
function setLayoutMode(mode: LayoutMode): void {
  if (state.layoutMode === mode) return;
  state.layoutMode = mode;
  refreshTools();
  refreshAll(true);
  persistViewNow();
  notify(mode === "timeline" ? "Timeline: o tempo corre da esquerda para a direita" : "Camadas: uma coluna por tipo");
}

function bindToolbar(): void {
  $$("[data-layout]").forEach((b) => (b.onclick = () => setLayoutMode(b.dataset.layout as LayoutMode)));
  $$("[data-mode]").forEach((x) =>
    x.addEventListener("click", () => {
      state.mode = x.dataset.mode as ToolMode;
      state.connectStart = null;
      refreshTools();
    }),
  );
  const sel = () => state.selected;
  $("#addBtn").onclick = () => createModal(null, null, null, sel()?.kind === "node" ? sel()!.id : null);
  $("#quickStateBtn").onclick = () => createModal("semantic", null, null, null, "Estado");
  $("#quickActionBtn").onclick = () => createModal("semantic", null, null, null, "Ação");
  $("#quickHotspotBtn").onclick = () => addHotspot();
  $("#clearCanvasBtn").onclick = confirmWipe;
  $("#startFreshJourney").onclick = () => createModal("journey");
  $("#layoutBtn").onclick = () => autoLayout();
  $("#fitBtn").onclick = fit;
  $("#zoomFit").onclick = fit;
  $("#zoomIn").onclick = () => zoom(1.2);
  $("#zoomOut").onclick = () => zoom(1 / 1.2);
  $("#linklistBtn").onclick = listConnections;
  $("#jsonCSV").onclick = csvExport;
  $("#exportBtn").onclick = exportJson;
  $("#svgBtn").onclick = svgExport;
  $("#undo").onclick = () => undo();
  $("#redo").onclick = redo;
  $("#inspectorBtn").onclick = () => $("#inspector").classList.toggle("open");
}

function bindKeyboard(): void {
  window.addEventListener("keydown", (e) => {
    if (target(e).matches?.("input,textarea,select") || $<HTMLDialogElement>("#modal").open) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
      return;
    }
    if (mod && key === "y") {
      e.preventDefault();
      redo();
      return;
    }
    // #3 Criação encadeada: Tab = próximo conectado, Enter = irmão.
    const onControl = !!target(e).closest?.("button, a, summary, [tabindex]");
    if ((e.key === "Tab" || e.key === "Enter") && !mod && !e.altKey && !onControl && state.selected?.kind === "node") {
      if (e.key === "Tab" && e.shiftKey) return;
      e.preventDefault();
      quickCreate(e.key === "Tab" ? "next" : "sibling");
      return;
    }
    if (e.key === "F2" && state.selected?.kind === "node") {
      e.preventDefault();
      startInlineEdit(state.selected.id);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      safeRemoveSelection();
    }
    // Atalhos de uma tecla consomem a tecla: sem isso a letra vazava para o
    // campo que o atalho acabou de focar (ex.: "n" no nome do modal, "h" no hotspot).
    const single: Record<string, () => void> = {
      n: () => createModal(),
      h: () => addHotspot(),
      c: () => setMode("connect"),
      v: () => setMode("pointer"),
    };
    if (!mod && !e.altKey && single[key]) {
      e.preventDefault();
      single[key]();
      return;
    }
    if (e.key === "Escape") {
      state.connectStart = null;
      state.selected = null;
      $("#inspector").classList.remove("open");
      refreshAll(false);
    }
  });
}

/** Restaura recorte, câmera e aba salvos; sem câmera salva, enquadra o mapa. */
function firstLoad(): void {
  ensurePositions();
  const savedView = deep(state.ws.view || {});
  refreshAll(false);
  if (savedView.camera && Number.isFinite(savedView.camera.z)) {
    state.cam = { ...savedView.camera };
    cameraApply();
  } else if (state.focusScene) {
    const b = $("#stage").getBoundingClientRect();
    const p = pos("scene:" + state.focusScene);
    state.cam.z = 0.72;
    state.cam.x = 20;
    state.cam.y = b.height / 2 - (p.y + NODE_H / 2) * state.cam.z;
    cameraApply();
  } else fit();
  if (savedView.sidebarTab) {
    state.sidebarTab = savedView.sidebarTab;
    renderSidebar();
  }
  persist();
}

export function startApp(): void {
  state.ws = loadInitialWorkspace();
  const v = state.ws.view;
  if (v.journey !== undefined) setFocus(v.journey || "", v.chapter || "", v.scene || "");
  state.legendCollapsed = v.legendCollapsed ?? window.innerWidth < 930;
  // Mapas que já têm arranjo em camadas abrem em Camadas; mapas novos abrem na Timeline.
  const hasLayers = Object.entries(state.ws.graph.layouts || {}).some(
    ([key, pos]) => !key.startsWith("timeline|") && Object.keys(pos).length > 0,
  );
  state.layoutMode = v.layoutMode ?? (hasLayers ? "layers" : "timeline");

  bindCanvas();
  bindLegend();
  bindSidebar();
  bindToolbar();
  bindModal();
  bindInspector();
  bindImport();
  bindKeyboard();
  window.addEventListener("beforeunload", persistViewNow);
  window.addEventListener("resize", () => cameraApply());

  refreshTools();
  firstLoad();
}
