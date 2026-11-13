// Câmera do canvas: pan, zoom, enquadrar.
import { NODE_H, NODE_W } from "../domain/constants";
import type { NodeKey, Point } from "../domain/types";
import { queueViewPersist } from "../core/persistence";
import { state } from "../core/state";
import { $ } from "../ui/dom";
import { calcBounds, pos } from "./layout";

export function cameraApply(): void {
  const { cam } = state;
  $("#world").style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.z})`;
  $("#zoomLabel").textContent = Math.round(cam.z * 100) + "%";
  queueViewPersist();
}

export function fit(): void {
  const b = calcBounds();
  const vp = $("#stage");
  const w = vp.clientWidth;
  const h = vp.clientHeight;
  if (!w || !h) return;
  const z = Math.min(1.1, (w - 100) / Math.max(400, b.w), (h - 95) / Math.max(250, b.h));
  const cam = state.cam;
  cam.z = Math.max(0.22, z);
  cam.x = (w - b.w * cam.z) / 2 - b.minX * cam.z;
  cam.y = (h - b.h * cam.z) / 2 - b.minY * cam.z;
  cameraApply();
}

export function zoom(factor: number, clientX?: number, clientY?: number): void {
  const p = $("#stage").getBoundingClientRect();
  const cx = clientX ?? p.left + p.width / 2;
  const cy = clientY ?? p.top + p.height / 2;
  const xx = cx - p.left;
  const yy = cy - p.top;
  const cam = state.cam;
  const old = cam.z;
  const n = Math.max(0.17, Math.min(2.4, old * factor));
  cam.x = xx - ((xx - cam.x) * n) / old;
  cam.y = yy - ((yy - cam.y) * n) / old;
  cam.z = n;
  cameraApply();
}

/** Converte coordenadas da tela para coordenadas do mundo (canvas). */
export function localPoint(evt: { clientX: number; clientY: number }): Point {
  const r = $("#stage").getBoundingClientRect();
  const { cam } = state;
  return { x: (evt.clientX - r.left - cam.x) / cam.z, y: (evt.clientY - r.top - cam.y) / cam.z };
}

/**
 * Se o nó estiver fora da tela (ou quase), centraliza com zoom legível.
 * `minZoom`: também aproxima quando o zoom atual está abaixo dele (ex.: para digitar).
 */
export function bringIntoView(k: NodeKey, minZoom = 0): void {
  const pp = pos(k);
  const stage = $("#stage").getBoundingClientRect();
  const cam = state.cam;
  const sx = pp.x * cam.z + cam.x;
  const sy = pp.y * cam.z + cam.y;
  const offscreen =
    sx < 25 || sx > stage.width - NODE_W * cam.z - 25 || sy < 25 || sy > stage.height - NODE_H * cam.z - 25;
  if (offscreen || cam.z < minZoom) {
    cam.z = Math.max(0.65, minZoom, Math.min(0.95, cam.z));
    cam.x = stage.width / 2 - (pp.x + NODE_W / 2) * cam.z;
    cam.y = stage.height / 2 - (pp.y + NODE_H / 2) * cam.z;
    cameraApply();
  }
}

/** Centraliza a câmera num nó, mantendo o zoom atual. */
export function centerOn(k: NodeKey): void {
  const p = pos(k);
  const r = $("#stage").getBoundingClientRect();
  state.cam.x = r.width / 2 - (p.x + NODE_W / 2) * state.cam.z;
  state.cam.y = r.height / 2 - (p.y + NODE_H / 2) * state.cam.z;
  cameraApply();
}
