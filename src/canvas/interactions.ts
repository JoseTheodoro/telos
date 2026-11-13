// Eventos do canvas: seleção, arrastar nó, puxar seta, pan, zoom, duplo clique.
import { NODE_W, PORT_Y } from "../domain/constants";
import { keyKind } from "../domain/keys";
import type { NodeKind } from "../domain/types";
import { pushSnapshot, refreshUndo } from "../core/history";
import { persist } from "../core/persistence";
import { getByKey, state, type Dragging } from "../core/state";
import { finishConnect, linkCreate, selectEdge, selectNode, selectNodes, toggleNodeSelection } from "../actions";
import { createModal } from "../ui/modal";
import { $, notify, target } from "../ui/dom";
import { cameraApply, localPoint, zoom } from "./camera";
import { editingKey, finishInlineEdit, isInlineEditing, refocusInlineEdit, startInlineEdit } from "./inline-edit";
import { activePositions, pos, sizeOf } from "./layout";
import { withFrameContents } from "./frame";
import { collectGuideLines, hideGuides, snapDrag } from "./guides";
import { minSizeOf } from "./size";
import { copyNote, isNoteEditing, rememberPointer, startNoteEdit } from "./note";
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

type LassoDrag = Extract<Dragging, { type: "lasso" }>;

const LASSO_MIN_PX = 6;
/** O card só começa a andar depois deste deslocamento: um clique com tremida não pode encaixá-lo na grade. */
const DRAG_START_PX = 4;

function drawLasso(d: LassoDrag): void {
  const box = $("#lasso");
  const stageRect = $("#stage").getBoundingClientRect();
  box.hidden = false;
  box.style.left = Math.min(d.x0, d.x1) - stageRect.left + "px";
  box.style.top = Math.min(d.y0, d.y1) - stageRect.top + "px";
  box.style.width = Math.abs(d.x1 - d.x0) + "px";
  box.style.height = Math.abs(d.y1 - d.y0) + "px";
}

/** Cards visíveis inteiramente dentro do laço (um card cortado pela borda fica de fora). */
function keysInsideLasso(d: LassoDrag): string[] {
  const topLeft = localPoint({ clientX: Math.min(d.x0, d.x1), clientY: Math.min(d.y0, d.y1) });
  const bottomRight = localPoint({ clientX: Math.max(d.x0, d.x1), clientY: Math.max(d.y0, d.y1) });
  return [...state.visibleKeys].filter((k) => {
    const p = pos(k);
    const size = sizeOf(k);
    return p.x >= topLeft.x && p.y >= topLeft.y && p.x + size.w <= bottomRight.x && p.y + size.h <= bottomRight.y;
  });
}

function finishLasso(d: LassoDrag): void {
  $("#lasso").hidden = true;
  if (Math.abs(d.x1 - d.x0) + Math.abs(d.y1 - d.y0) < LASSO_MIN_PX) return;
  const inside = keysInsideLasso(d);
  if (!inside.length) {
    notify("Nenhum card inteiro dentro da área: o laço pega só os cards que cabem por completo nele.");
    return;
  }
  selectNodes(inside);
  notify(
    inside.length === 1
      ? "1 elemento selecionado"
      : `${inside.length} elementos selecionados · arraste um deles para mover todos`,
  );
}

/** Elementos do card no DOM (a moldura tem também o fundo, numa camada atrás das setas). */
function cardElements(k: string): HTMLElement[] {
  const key = CSS.escape(k);
  return [...document.querySelectorAll<HTMLElement>(`[data-node="${key}"], [data-frame-bg="${key}"]`)];
}

function moveNodeCard(k: string, x: number, y: number): void {
  for (const el of cardElements(k)) {
    el.style.left = x + "px";
    el.style.top = y + "px";
  }
}

/** Arraste de vários cards juntos (seleção múltipla ou moldura com o conteúdo), com um só undo. */
function startGroupDrag(key: string, keys: string[], e: PointerEvent, stage: HTMLElement): void {
  state.dragging = {
    type: "group",
    key,
    start: localPoint(e),
    origins: Object.fromEntries(keys.map((x) => [x, { ...pos(x) }])),
    snap: JSON.stringify(state.ws),
    moved: false,
    lines: collectGuideLines(keys),
  };
  e.preventDefault();
  stage.setPointerCapture(e.pointerId);
}

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
    if (el.closest("#emptyStage, #esLegend, .name-editor, .note-editor, .zoomhud")) return;
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

    // #10 Nota livre: copiar o conteúdo e redimensionar pela alça do canto.
    const copy = el.closest<HTMLElement>("[data-note-copy]");
    if (copy) {
      e.preventDefault();
      selectNode(copy.dataset.noteCopy as string);
      void copyNote(copy.dataset.noteCopy as string);
      return;
    }
    const grip = el.closest<HTMLElement>("[data-note-resize]");
    if (grip) {
      e.preventDefault();
      const k = grip.dataset.noteResize as string;
      const size = sizeOf(k);
      selectNode(k);
      state.dragging = { type: "resize", key: k, x0: e.clientX, y0: e.clientY, w0: size.w, h0: size.h, snap: JSON.stringify(state.ws), moved: false };
      stage.setPointerCapture(e.pointerId);
      return;
    }

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
      // Vem antes do duplo clique: Shift+cliques rápidos não podem abrir a edição do nome.
      if (state.mode === "pointer" && e.shiftKey) {
        e.preventDefault();
        toggleNodeSelection(k);
        return;
      }
      if (state.mode === "pointer" && isDoubleTap(k, e)) {
        e.preventDefault();
        state.dragging = null;
        if (keyKind(k) === "note") startNoteEdit(k);
        else startInlineEdit(k);
        return;
      }
      const sel = state.selected;
      if (state.mode === "pointer" && sel?.kind === "nodes" && sel.ids.includes(k)) {
        startGroupDrag(k, withFrameContents(sel.ids.filter((x) => state.visibleKeys.has(x))), e, stage);
        return;
      }
      if (state.mode === "pointer" && keyKind(k) === "frame") {
        // O conteúdo é o que está dentro da moldura no início do arraste.
        selectNode(k);
        startGroupDrag(k, withFrameContents([k]), e, stage);
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
        lines: collectGuideLines([k]),
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
    if (state.mode === "pointer" && e.shiftKey) {
      e.preventDefault();
      state.dragging = { type: "lasso", x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      stage.setPointerCapture(e.pointerId);
      return;
    }
    state.panning = { x: e.clientX, y: e.clientY, oldX: state.cam.x, oldY: state.cam.y };
    stage.classList.add("panning");
    stage.setPointerCapture(e.pointerId);
  });

  stage.addEventListener("pointermove", (e) => {
    rememberPointer(localPoint(e));
    const d = state.dragging;
    if (d?.type === "resize") {
      const o = getByKey(d.key);
      if (!o) return;
      const min = minSizeOf(d.key);
      o.w = Math.max(min.w, Math.round(d.w0 + (e.clientX - d.x0) / state.cam.z));
      o.h = Math.max(min.h, Math.round(d.h0 + (e.clientY - d.y0) / state.cam.z));
      d.moved = true;
      for (const el of cardElements(d.key)) {
        el.style.width = o.w + "px";
        el.style.height = o.h + "px";
      }
      renderEdges();
      return;
    }
    if (d?.type === "node") {
      const p = localPoint(e);
      const raw = { x: p.x - d.dx, y: p.y - d.dy };
      if (!d.moved && Math.hypot(raw.x - d.x0, raw.y - d.y0) * state.cam.z < DRAG_START_PX) return;
      d.moved = true;
      const at = snapDrag(d.key, raw, d.lines, e.altKey);
      activePositions()[d.key] = at;
      moveNodeCard(d.key, at.x, at.y);
      renderEdges();
      return;
    }
    if (d?.type === "group") {
      const p = localPoint(e);
      if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) * state.cam.z < DRAG_START_PX) return;
      d.moved = true;
      // O card pego (ou a moldura) encaixa; os outros andam o mesmo tanto.
      const anchor = d.origins[d.key];
      const at = snapDrag(d.key, { x: anchor.x + p.x - d.start.x, y: anchor.y + p.y - d.start.y }, d.lines, e.altKey);
      const dx = at.x - anchor.x;
      const dy = at.y - anchor.y;
      const positions = activePositions();
      for (const [k, origin] of Object.entries(d.origins)) {
        positions[k] = { x: origin.x + dx, y: origin.y + dy };
        moveNodeCard(k, positions[k].x, positions[k].y);
      }
      renderEdges();
      return;
    }
    if (d?.type === "lasso") {
      d.x1 = e.clientX;
      d.y1 = e.clientY;
      drawLasso(d);
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
      const dropKey = dropTarget?.dataset.node;
      if (dropKey && dropKey !== d.start && keyKind(dropKey) !== "frame") linkCreate(d.start, dropKey);
      else {
        const p = localPoint(e);
        createModal(NEXT_KIND[keyKind(d.start)] || "event", Math.round(p.x), Math.round(p.y), d.start);
        notify("Crie o nó na ponta da seta para conectar automaticamente.");
      }
      return;
    }
    if (d?.type === "resize") {
      state.dragging = null;
      if (d.moved) {
        pushSnapshot(d.snap);
        persist();
        refreshUndo();
        renderGraph();
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
    if (d?.type === "group") {
      state.dragging = null;
      hideGuides();
      // Clique sem arrastar num card da seleção: fica só ele.
      if (!d.moved) {
        selectNode(d.key);
        return;
      }
      const now = pos(d.key);
      const before = d.origins[d.key];
      if (now.x !== before.x || now.y !== before.y) {
        pushSnapshot(d.snap);
        persist();
        refreshUndo();
        renderGraph();
      }
      return;
    }
    if (d?.type === "lasso") {
      state.dragging = null;
      finishLasso(d);
      return;
    }
    if (d?.type === "node") {
      state.dragging = null;
      hideGuides();
      const now = pos(d.key);
      if (d.moved && (now.x !== d.x0 || now.y !== d.y0)) {
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
    if (d?.type === "resize" && d.moved) {
      const o = getByKey(d.key);
      if (o) {
        o.w = d.w0;
        o.h = d.h0;
        renderGraph();
      }
    }
    if (d?.type === "group" && d.moved) {
      const positions = activePositions();
      for (const [k, origin] of Object.entries(d.origins)) positions[k] = { ...origin };
      renderGraph();
    }
    if (d?.type === "node" && d.moved) {
      activePositions()[d.key] = { x: d.x0, y: d.y0 };
      renderGraph();
    }
    hideGuides();
    if (d?.type === "lasso") $("#lasso").hidden = true;
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
      // Dentro de uma nota com rolagem, a roda rola o conteúdo (Ctrl + roda continua dando zoom).
      const body = target(e).closest<HTMLElement>(".note-body, .note-editor");
      if (body && !e.ctrlKey && body.scrollHeight > body.clientHeight + 1) {
        const atTop = body.scrollTop <= 0 && e.deltaY < 0;
        const atEnd = body.scrollTop + body.clientHeight >= body.scrollHeight - 1 && e.deltaY > 0;
        if (!atTop && !atEnd) return;
      }
      e.preventDefault();
      zoom(e.deltaY > 0 ? 0.89 : 1.11, e.clientX, e.clientY);
    },
    { passive: false },
  );

  stage.addEventListener("dblclick", (e) => {
    // O alvo do dblclick pode ser o "mundo" (o card foi re-renderizado entre os cliques).
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (isInlineEditing() || isNoteEditing() || target(e).closest("[data-node],[data-edge],[data-emo-scene],#esLegend,.zoomhud")) return;
    if (under?.closest("[data-node],[data-edge],[data-emo-scene],#esLegend")) return;
    const p = localPoint(e);
    createModal(null, Math.round(p.x), Math.round(p.y));
  });
}
