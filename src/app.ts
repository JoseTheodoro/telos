// Orquestração: render completo, carga inicial, barra de ferramentas e teclado.
import { NODE_H } from "./domain/constants";
import { deep } from "./domain/model";
import type { ToolMode } from "./domain/types";
import { redo, refreshUndo, undo } from "./core/history";
import { loadInitialWorkspace, persist, persistViewNow } from "./core/persistence";
import { setFocus, state } from "./core/state";
import { safeRemoveSelection } from "./actions";
import { cameraApply, fit, zoom } from "./canvas/camera";
import { bindCanvas } from "./canvas/interactions";
import { startInlineEdit } from "./canvas/inline-edit";
import { bindLegend } from "./canvas/legend";
import { autoLayout, ensurePositions, pos } from "./canvas/layout";
import { renderGraph } from "./canvas/render";
import { bindImport, csvExport, exportJson, svgExport } from "./io/files";
import { bindInspector, renderInspector } from "./ui/inspector";
import { bindModal, confirmWipe, createModal, listConnections } from "./ui/modal";
import { bindSidebar, renderFilters, renderSidebar } from "./ui/sidebar";
import { $, $$, target } from "./ui/dom";

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
  $("#stage").style.cursor = state.mode === "connect" ? "crosshair" : "grab";
}

function setMode(mode: ToolMode): void {
  state.mode = mode;
  if (mode === "pointer") state.connectStart = null;
  refreshTools();
}

function bindToolbar(): void {
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
  $("#undo").onclick = undo;
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
    if (e.key === "F2" && state.selected?.kind === "node") {
      e.preventDefault();
      startInlineEdit(state.selected.id);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      safeRemoveSelection();
    }
    if (key === "n") createModal();
    if (key === "c") setMode("connect");
    if (key === "v") setMode("pointer");
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
