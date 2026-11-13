// Importação e exportação (JSON, CSV, SVG).
import { COLORS, NODE_H, NODE_W, PL } from "../domain/constants";
import { keyKind, nodeKey } from "../domain/keys";
import { esStyle } from "../domain/es";
import { colorForEdge, isTableLink, semanticLabel } from "../domain/model";
import type { Chapter, NoteItem, Scene } from "../domain/types";
import { describeIssues, parseWorkspace, type ValidationIssue } from "../domain/validate";
import { undoPush } from "../core/history";
import { persist, persistViewNow } from "../core/persistence";
import { get, getByKey, label, setFocus, state } from "../core/state";
import { refreshAll } from "../app";
import { activePositions, calcBounds, ensurePositions, isTimeline, pos, sizeOf } from "../canvas/layout";
import { edgeGeometry } from "../canvas/render";
import { chapterBands, laneBands } from "../canvas/timeline";
import { emotionBand, emotionSvg } from "../canvas/emotion";
import { formatLabel, isCodeFormat } from "../ui/rich";
import { emotionLevel, emotionSigned, hasEmotion } from "../domain/emotion";
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
    "Emoção da cena",
    "Dor da cena",
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
      hasEmotion(s) ? `${emotionSigned(s.emotion)} ${emotionLevel(s.emotion).label}` : "",
      s?.pain,
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

/** #10 Nota livre no SVG: post-it com o texto bruto (linhas que cabem no card). */
function noteSvg(p: { x: number; y: number }, n: NoteItem): string {
  const code = isCodeFormat(n.format);
  const maxChars = Math.floor((n.w - 28) / (code ? 7 : 7.4));
  const maxLines = Math.max(1, Math.floor((n.h - 44) / 16));
  const all = n.text.split(/\r?\n/);
  const lines = all.slice(0, maxLines).map((l) => (l.length > maxChars ? l.slice(0, maxChars - 1) + "…" : l));
  if (all.length > maxLines) lines[lines.length - 1] = "…";
  const fill = code ? "#fbfcfd" : "#fffbea";
  const stroke = code ? "#d5dde6" : "#e6d59f";
  const ink = code ? "#24313f" : "#4a3d16";
  return `<g><rect x="${p.x}" y="${p.y}" width="${n.w}" height="${n.h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><text x="${p.x + 14}" y="${p.y + 18}" font-size="9" font-weight="800" fill="${code ? "#4f6d8a" : "#b08a2e"}">${esc(formatLabel(n.format).toUpperCase())}</text>${lines.map((l, i) => `<text x="${p.x + 14}" y="${p.y + 40 + i * 16}" font-size="${code ? 11 : 12}" font-family="monospace" fill="${ink}" xml:space="preserve">${esc(l)}</text>`).join("")}</g>`;
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
      const g = edgeGeometry(e, sizeOf);
      const color = colorForEdge(e);
      return `<path d="${g.d}" fill="none" stroke="${color}" stroke-width="2.5" marker-end="url(#svg-arrow-${esc(e.id)})"/><text x="${g.mx}" y="${g.my}" fill="${color}" font-size="11" text-anchor="middle">${esc(e.accessMode ? e.accessMode + " · " + e.label : e.label)}</text>`;
    })
    .join("");
  const emo = emotionBand(visibleKeys, activePositions());
  // Faixas de raia e de capítulo da timeline (fundo).
  const lanes = laneBands(visibleKeys, activePositions())
    .map(
      (b, i) =>
        `<rect x="${b.x}" y="${b.top}" width="${b.w}" height="${b.height}" fill="${i % 2 ? "#f3f6fa" : "#f8fafc"}" stroke="#e1e7ef"/><text x="${b.x + 12}" y="${b.top + 16}" font-size="11" font-weight="800" fill="#4a5d75">${esc(b.label)}</text>`,
    )
    .join("");
  const bands = isTimeline()
    ? lanes + chapterBands(visibleKeys, activePositions())
        .map(
          (b, i) =>
            `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="16" fill="${i % 2 ? "#f1f6f2" : "#f6f9f6"}" stroke="#dbe6dd"/><text x="${b.x + 14}" y="${b.y + 22}" font-size="12" font-weight="800" fill="#2a6e50">${esc(b.label)}${b.date ? " · " + esc(b.date) : ""}</text>`,
        )
        .join("") + (emo ? emotionSvg(emo, false) : "")
    : "";
  const markers = shown
    .map(
      (e) =>
        `<marker id="svg-arrow-${esc(e.id)}" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="${colorForEdge(e)}"/></marker>`,
    )
    .join("");
  // #11 Molduras atrás de setas e cards; as maiores primeiro.
  const frames = [...visibleKeys]
    .filter((k) => keyKind(k) === "frame")
    .sort((a, b) => sizeOf(b).w * sizeOf(b).h - sizeOf(a).w * sizeOf(a).h)
    .map((k) => {
      const p = pos(k);
      const { w, h } = sizeOf(k);
      const color = String(getByKey(k)?.color || "#eceff1");
      return `<g><rect x="${p.x}" y="${p.y}" width="${w}" height="${h}" rx="16" fill="${esc(color)}" fill-opacity="0.75" stroke="#b7c7bc" stroke-width="1.5"/><text x="${p.x + 16}" y="${p.y + 27}" font-size="15" font-weight="800" fill="#2c4036">${esc(label(k))}</text></g>`;
    })
    .join("");
  const cards = [...visibleKeys]
    .filter((k) => keyKind(k) !== "frame")
    .map((k) => {
      const p = pos(k);
      const o = getByKey(k);
      if (keyKind(k) === "note" && o) return noteSvg(p, o as unknown as NoteItem);
      const es = esStyle(keyKind(k), o?.semanticType);
      const c = es?.accent ?? COLORS[keyKind(k)];
      const fill = es?.bg ?? "white";
      const sem = semanticLabel(o);
      const lines = wrap(label(k));
      return `<g><rect x="${p.x}" y="${p.y}" width="${NODE_W}" height="${NODE_H}" rx="12" fill="${fill}" stroke="${es?.outline ?? c}" stroke-width="2"/><rect x="${p.x}" y="${p.y}" width="6" height="${NODE_H}" fill="${c}" rx="3"/><text x="${p.x + 16}" y="${p.y + 21}" fill="${c}" font-weight="700" font-size="10">${esc(PL[keyKind(k)].toUpperCase())}${sem ? " / " + esc(sem) : ""}</text>${lines.map((l, i) => `<text x="${p.x + 16}" y="${p.y + 45 + i * 17}" font-size="13" font-weight="600" fill="#244132">${esc(l)}</text>`).join("")}</g>`;
    })
    .join("");
  saveFile(
    "pep-atlas-mapa.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H)}" viewBox="${X} ${Y} ${W} ${H}"><defs>${markers}</defs><rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="#fbfdfb"/>${bands}${frames}${paths}${cards}</svg>`,
    "image/svg+xml;charset=utf-8",
  );
  notify("SVG exportado com setas coloridas");
}

export function offerInvalidSavedExport(raw: string): void {
  const message =
    "Mapa salvo com dados inválidos: o Atlas abriu o mapa de exemplo no lugar dele. Exportar o JSON salvo para recuperar o trabalho?";
  if (confirm(message)) saveFile("pep-atlas-studio-invalido.json", raw, "application/json;charset=utf-8");
}

function parseImported(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const importFailure = (issues: ValidationIssue[]): string =>
  issues.some((issue) => issue.code === "unknown_schema")
    ? "Use um JSON exportado por uma versão do Atlas."
    : `dados inválidos em ${describeIssues(issues)}`;

export function bindImport(): void {
  const input = $<HTMLInputElement>("#importFile");
  $("#importBtn").onclick = () => input.click();
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const parsed = parseWorkspace(parseImported(await f.text()));
      if (!parsed.ok) throw Error(importFailure(parsed.issues));
      if (!confirm("A importação substituirá o mapa atual. Exporte o mapa antes de continuar.")) return;
      undoPush();
      state.ws = parsed.workspace;
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
