// Eventos do canvas: seleção, arrastar nó, puxar seta, pan, zoom, duplo clique.
import { NODE_W, PORT_Y } from "../domain/constants";
import { keyKind } from "../domain/keys";
import type { NodeKind } from "../domain/types";
import { pushSnapshot, refreshUndo } from "../core/history";
import { persist } from "../core/persistence";
import { state } from "../core/state";
import { finishConnect, linkCreate, selectEdge, selectNode } from "../actions";
import { createModal } from "../ui/modal";
import { $, notify, target } from "../ui/dom";
import { cameraApply, localPoint, zoom } from "./camera";
import { activePositions, pos } from "./layout";
import { renderEdges, renderGraph } from "./render";

/** Tipo sugerido ao soltar uma seta no vazio (cria o próximo nó já conectado). */
const NEXT_KIND: Partial<Record<NodeKind, NodeKind>> = {
  chapter: "scene",
  scene: "event",
  event: "domain",
  domain: "system",
  system: "screen",
  screen: "table",
  table: "event",
};

export function bindCanvas(): void {
  const stage = $("#stage");
  const ghost = $("#linkGhost") as unknown as SVGPathElement;

  stage.addEventListener("pointerdown", (e) => {
    const el = target(e);
    if (el.closest("#emptyStage, #esLegend")) return;

    const port = el.closest<HTMLElement>("[data-port]");
    if (port) {
      e.preventDefault();
      e.stopPropagation();
      const k = port.dataset.key as string;
      if (port.dataset.port === "out") {
        state.connectStart = k;
        state.dragging = { type: "link", start: k };
        stage.setPointerCapture(e.pointerId);
      } else if (state.connectStart) finishConnect(k);
      return;
    }

    const edge = el.closest<HTMLElement>("[data-edge]");
    if (edge) {
      selectEdge(edge.dataset.edge as string);
      return;
    }

    const node = el.closest<HTMLElement>("[data-node]");
    if (node) {
      const k = node.dataset.node as string;
      selectNode(k);
      if (state.mode === "connect") {
        finishConnect(k);
        return;
      }
      const p = localPoint(e);
      const start = pos(k);
      state.dragging = {
        type: "node",
        key: k,
        dx: p.x - start.x,
        dy: p.y - start.y,
        x0: start.x,
        y0: start.y,
        snap: JSON.stringify(state.ws),
        moved: false,
      };
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      return;
    }

    if (state.mode === "connect" && state.connectStart) {
      state.connectStart = null;
      notify("Conexão cancelada");
      return;
    }
    state.panning = { x: e.clientX, y: e.clientY, oldX: state.cam.x, oldY: state.cam.y };
    stage.classList.add("panning");
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener("pointermove", (e) => {
    const d = state.dragging;
    if (d?.type === "node") {
      const p = localPoint(e);
      activePositions()[d.key] = { x: Math.round(p.x - d.dx), y: Math.round(p.y - d.dy) };
      d.moved = true;
      const n = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(d.key)}"]`);
      if (n) {
        n.style.left = pos(d.key).x + "px";
        n.style.top = pos(d.key).y + "px";
      }
      renderEdges();
      return;
    }
    if (d?.type === "link") {
      const p = localPoint(e);
      const src = pos(d.start);
      const x = src.x + NODE_W;
      const y = src.y + PORT_Y;
      const m = Math.max(70, Math.abs(p.x - x) / 2);
      ghost.setAttribute("d", `M ${x} ${y} C ${x + m} ${y}, ${p.x - m} ${p.y}, ${p.x} ${p.y}`);
      ghost.style.display = "";
      return;
    }
    if (state.panning) {
      state.cam.x = state.panning.oldX + e.clientX - state.panning.x;
      state.cam.y = state.panning.oldY + e.clientY - state.panning.y;
      cameraApply();
    }
  });

  stage.addEventListener("pointerup", (e) => {
    const d = state.dragging;
    if (d?.type === "link") {
      const dropTarget = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node]");
      state.dragging = null;
      ghost.style.display = "none";
      state.connectStart = null;
      if (dropTarget && dropTarget.dataset.node !== d.start) linkCreate(d.start, dropTarget.dataset.node as string);
      else {
        const p = localPoint(e);
        createModal(NEXT_KIND[keyKind(d.start)] || "event", Math.round(p.x), Math.round(p.y), d.start);
        notify("Crie o nó na ponta da seta para conectar automaticamente.");
      }
      return;
    }
    if (d?.type === "node") {
      state.dragging = null;
      const now = pos(d.key);
      if (d.moved && Math.abs(now.x - d.x0) + Math.abs(now.y - d.y0) > 2) {
        pushSnapshot(d.snap);
        persist();
        refreshUndo();
        renderGraph();
      }
      return;
    }
    if (state.panning) {
      state.panning = null;
      stage.classList.remove("panning");
    }
  });

  stage.addEventListener("pointercancel", () => {
    state.dragging = null;
    state.panning = null;
    ghost.style.display = "none";
    stage.classList.remove("panning");
  });

  stage.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(e.deltaY > 0 ? 0.89 : 1.11, e.clientX, e.clientY);
    },
    { passive: false },
  );

  stage.addEventListener("dblclick", (e) => {
    if (target(e).closest("[data-node],[data-edge],#esLegend")) return;
    const p = localPoint(e);
    createModal(null, Math.round(p.x), Math.round(p.y));
  });
}
