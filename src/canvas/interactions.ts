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
import { editingKey, finishInlineEdit, isInlineEditing, refocusInlineEdit, startInlineEdit } from "./inline-edit";
import { activePositions, pos } from "./layout";
import { renderBands, renderEdges, renderGraph } from "./render";
import { EMO } from "./emotion";
import { clampEmotion, emotionLevel, emotionSigned } from "../domain/emotion";
import { nodeKey } from "../domain/keys";
import { refreshAll } from "../app";

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

/**
 * Duplo clique detectado no pointerdown: o primeiro clique re-renderiza os cards,
 * então o "dblclick" nativo não chega ao card de forma confiável.
 */
const DOUBLE_TAP_MS = 450;
const DOUBLE_TAP_PX = 6;
let lastTap: { key: string; time: number; x: number; y: number } | null = null;

function isDoubleTap(key: string, e: PointerEvent): boolean {
  const now = performance.now();
  const hit =
    !!lastTap &&
    lastTap.key === key &&
    now - lastTap.time < DOUBLE_TAP_MS &&
    Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX;
  lastTap = hit ? null : { key, time: now, x: e.clientX, y: e.clientY };
  return hit;
}

export function bindCanvas(): void {
  const stage = $("#stage");
  const ghost = $("#linkGhost") as unknown as SVGPathElement;

  stage.addEventListener("pointerdown", (e) => {
    const el = target(e);
    // Controles sobre o canvas recebem o próprio clique (antes o pan capturava o ponteiro e os
    // botões −/+/⤢ nunca disparavam — bug herdado da v1.5).
    if (el.closest("#emptyStage, #esLegend, .name-editor, .zoomhud")) return;
    // Clique fora do campo em edição confirma antes de qualquer outra ação
    // (o preventDefault do arraste impediria o blur).
    if (isInlineEditing()) {
      // Clique em outra parte do card em edição (ex.: clique triplo) mantém a edição.
      if (el.closest<HTMLElement>("[data-node]")?.dataset.node === editingKey()) {
        e.preventDefault();
        refocusInlineEdit();
        return;
      }
      finishInlineEdit(true);
    }
    // O canvas assume o teclado (Tab/Enter/Del): solta o foco de botões e campos.
    (document.activeElement as HTMLElement | null)?.blur?.();

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

    // #8 Ponto da curva de emoção: arrastar muda a nota; clique seleciona a cena.
    const emo = el.closest<SVGElement>("[data-emo-scene]");
    if (emo) {
      e.preventDefault();
      const sceneId = emo.dataset.emoScene as string;
      const scene = state.ws.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      state.dragging = {
        type: "emotion",
        sceneId,
        startY: e.clientY,
        from: typeof scene.emotion === "number" ? scene.emotion : null,
        snap: JSON.stringify(state.ws),
        moved: false,
        // Só o ponto arrasta; o chip da dor é apenas clique.
        drag: emo.classList.contains("emo-dot"),
      };
      stage.setPointerCapture(e.pointerId);
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
      if (state.mode === "pointer" && isDoubleTap(k, e)) {
        e.preventDefault();
        state.dragging = null;
        startInlineEdit(k);
        return;
      }
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
    if (d?.type === "emotion") {
      const dy = (e.clientY - d.startY) / state.cam.z;
      if (!d.drag || (!d.moved && Math.abs(e.clientY - d.startY) < 4)) return;
      const scene = state.ws.scenes.find((s) => s.id === d.sceneId);
      if (!scene) return;
      d.moved = true;
      const next = clampEmotion((d.from ?? 0) - dy / EMO.STEP);
      if (scene.emotion !== next) {
        scene.emotion = next;
        renderBands();
      }
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
    if (d?.type === "emotion") {
      state.dragging = null;
      const scene = state.ws.scenes.find((s) => s.id === d.sceneId);
      const k = nodeKey("scene", d.sceneId);
      if (d.moved && scene && scene.emotion !== (d.from ?? undefined)) {
        pushSnapshot(d.snap);
        persist();
        state.selected = { kind: "node", id: k };
        refreshAll(false);
        const lvl = emotionLevel(scene.emotion as number);
        notify(`Emoção da cena: ${lvl.face} ${lvl.label} (${emotionSigned(lvl.value)}) · Ctrl+Z desfaz`);
      } else selectNode(k);
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
    // Arraste da curva interrompido: a nota volta ao valor de antes (nada foi salvo).
    const d = state.dragging;
    if (d?.type === "emotion" && d.moved) {
      const scene = state.ws.scenes.find((s) => s.id === d.sceneId);
      if (scene) {
        if (d.from === null) delete scene.emotion;
        else scene.emotion = d.from;
        renderBands();
      }
    }
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
    // O alvo do dblclick pode ser o "mundo" (o card foi re-renderizado entre os cliques).
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (isInlineEditing() || target(e).closest("[data-node],[data-edge],[data-emo-scene],#esLegend,.zoomhud")) return;
    if (under?.closest("[data-node],[data-edge],[data-emo-scene],#esLegend")) return;
    const p = localPoint(e);
    createModal(null, Math.round(p.x), Math.round(p.y));
  });
}
