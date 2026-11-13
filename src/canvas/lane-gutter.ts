// #7 Nomes das raias fixos na borda esquerda do canvas (acompanham pan e zoom em y).
import { state } from "../core/state";
import { $, esc } from "../ui/dom";
import type { LaneRow } from "./timeline";

let rows: LaneRow[] = [];

/** Recria os rótulos (chamado a cada render do grafo). */
export function renderLaneGutter(next: LaneRow[]): void {
  rows = next;
  const el = $("#laneGutter");
  if (!el) return;
  el.hidden = !rows.length;
  el.innerHTML = rows
    .map((r) => {
      const sub = r.sub ?? `${r.count} evento${r.count === 1 ? "" : "s"}`;
      return `<div class="lane-label${r.kind === "emotion" ? " emotion" : ""}" data-lane="${esc(r.id)}" title="${esc(r.label)} · ${esc(sub)}"><b>${esc(r.label)}</b><small>${esc(sub)}</small><span class="lane-count">${esc(r.short ?? String(r.count))}</span></div>`;
    })
    .join("");
  positionLaneGutter();
}

/** Reposiciona os rótulos conforme a câmera (chamado em cada pan/zoom). */
export function positionLaneGutter(): void {
  const el = $("#laneGutter");
  if (!el || !rows.length) return;
  const { cam } = state;
  el.querySelectorAll<HTMLElement>(".lane-label").forEach((label, i) => {
    const r = rows[i];
    if (!r) return;
    label.style.top = `${cam.y + (r.top + r.height / 2) * cam.z}px`;
    // Com zoom baixo a faixa fica estreita: rótulo compacto numa linha ("Médico 12").
    label.classList.toggle("compact", r.height * cam.z < 46);
  });
}
