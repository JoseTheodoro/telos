// Importação e exportação (JSON, CSV, SVG).
import { ACCEPTED_SCHEMAS, COLORS, NODE_H, NODE_W, PL } from "../domain/constants";
import { keyKind, nodeKey } from "../domain/keys";
import { colorForEdge, graphInit, isTableLink, semanticLabel, upgradeWorkspace } from "../domain/model";
import type { Chapter, Scene } from "../domain/types";
import { undoPush } from "../core/history";
import { persist, persistViewNow } from "../core/persistence";
import { get, getByKey, label, setFocus, state } from "../core/state";
import { refreshAll } from "../app";
import { calcBounds, ensurePositions, pos } from "../canvas/layout";
import { pathFor } from "../canvas/render";
import { $, esc, notify, saveFile } from "../ui/dom";

export function exportJson(): void {
  persistViewNow();
  saveFile("pep-atlas-studio.json", JSON.stringify(state.ws, null, 2), "application/json;charset=utf-8");
  notify("Backup JSON exportado: dados, setas, cores e posições");
}

export function csvExport(): void {
  const ws = state.ws;
  const cols = [
    "Jornada",
    "Capítulo",
    "Cena",
    "Evento",
    "Tipo semântico",
    "Natureza",
    "Destino",
    "Domínio(s)",
    "Sistema(s)",
    "Tela(s)",
    "Tabela(s)",
    "Acessos de dados",
    "Situação",
  ];
  const q = (x: unknown) => '"' + String(x ?? "").replaceAll('"', '""').replaceAll(/\r?\n/g, " ") + '"';
  const rows = ws.events.map((e) => {
    const s = get("scene", e.sceneId) as Scene | undefined;
    const c = get("chapter", s?.chapter) as Chapter | undefined;
    const k = nodeKey("event", e.id);
    const links = ws.graph.edges.filter((x) => x.from === k);
    const targets = (t: string) =>
      links
        .filter((x) => keyKind(x.to) === t)
        .map((x) => label(x.to))
        .join("; ");
    return [
      get("journey", c?.journeyId)?.name,
      c?.label,
      s?.title,
      e.name,
      e.semanticType,
      e.type,
      e.destination,
      targets("domain"),
      targets("system"),
      targets("screen"),
      targets("table"),
      links
        .filter(isTableLink)
        .map((x) => x.accessMode || "A definir")
        .join("; "),
      links.map((x) => x.status).join("; "),
    ]
      .map(q)
      .join(",");
  });
  saveFile(
    "pep-atlas-rastreabilidade.csv",
    "﻿" + cols.map(q).join(",") + "\n" + rows.join("\n"),
    "text/csv;charset=utf-8",
  );
  notify("CSV com jornadas, tipos, destinos e acessos exportado");
}

/** Quebra o texto em até 2 linhas de ~26 caracteres. */
function wrap(text: string): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).length > 26) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export function svgExport(): void {
  const { ws, visibleKeys } = state;
  const bb = calcBounds();
  const margin = 45;
  const X = bb.minX - margin;
  const Y = bb.minY - margin;
  const W = bb.w + 2 * margin;
  const H = bb.h + 2 * margin;
  const shown = ws.graph.edges.filter((e) => visibleKeys.has(e.from) && visibleKeys.has(e.to));
  const paths = shown
    .map((e) => {
      const a = pos(e.from);
      const b = pos(e.to);
      const color = colorForEdge(e);
      return `<path d="${pathFor(e.from, e.to)}" fill="none" stroke="${color}" stroke-width="2.5" marker-end="url(#svg-arrow-${esc(e.id)})"/><text x="${(a.x + NODE_W + b.x) / 2}" y="${(a.y + b.y) / 2 + 36}" fill="${color}" font-size="11" text-anchor="middle">${esc(e.accessMode ? e.accessMode + " · " + e.label : e.label)}</text>`;
    })
    .join("");
  const markers = shown
    .map(
      (e) =>
        `<marker id="svg-arrow-${esc(e.id)}" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="${colorForEdge(e)}"/></marker>`,
    )
    .join("");
  const cards = [...visibleKeys]
    .map((k) => {
      const p = pos(k);
      const c = COLORS[keyKind(k)];
      const sem = semanticLabel(getByKey(k));
      const lines = wrap(label(k));
      return `<g><rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="12" fill="white" stroke="${c}" stroke-width="2"/><rect x="${p.x}" y="${p.y}" width="6" height="${NODE_H}" fill="${c}" rx="3"/><text x="${p.x + 16}" y="${p.y + 21}" fill="${c}" font-weight="700" font-size="10">${esc(PL[keyKind(k)].toUpperCase())}${sem ? " / " + esc(sem) : ""}</text>${lines.map((l, i) => `<text x="${p.x + 16}" y="${p.y + 45 + i * 17}" font-size="13" font-weight="600" fill="#244132">${esc(l)}</text>`).join("")}</g>`;
    })
    .join("");
  saveFile(
    "pep-atlas-mapa.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H)}" viewBox="${X} ${Y} ${W} ${H}"><defs>${markers}</defs><rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="#fbfdfb"/>${paths}${cards}</svg>`,
    "image/svg+xml;charset=utf-8",
  );
  notify("SVG exportado com setas coloridas");
}

export function bindImport(): void {
  const input = $<HTMLInputElement>("#importFile");
  $("#importBtn").onclick = () => input.click();
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const o = JSON.parse(await f.text());
      if (!ACCEPTED_SCHEMAS.includes(o.schema)) throw Error("Use um JSON exportado por uma versão do Atlas.");
      if (!confirm("A importação substituirá o mapa atual. Exporte o mapa antes de continuar.")) return;
      undoPush();
      state.ws = upgradeWorkspace(o.schema === "pep-discovery-atlas-v1" ? graphInit(o) : o);
      state.selected = null;
      const v = state.ws.view;
      setFocus(v?.journey || state.ws.journeys[0]?.id || "", v?.chapter || "", v?.scene || "");
      persist();
      ensurePositions();
      refreshAll(true);
      notify("Atlas importado e salvo no navegador");
    } catch (err) {
      alert("Falha na importação: " + (err as Error).message);
    } finally {
      input.value = "";
    }
  });
}
