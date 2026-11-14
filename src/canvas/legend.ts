// Legenda flutuante das cores do Event Storming, com contagem no recorte atual.
import { ES_STYLES, esCategory, type EsCategory, keyKind } from "@pep-atlas/domain";
import { queueViewPersist } from "../core/persistence";
import { getByKey, state } from "../core/state";
import { $, esc, target } from "../ui/dom";

function countVisible(): { byCat: Map<EsCategory, number>; neutral: number } {
  const byCat = new Map<EsCategory, number>();
  let neutral = 0;
  for (const k of state.visibleKeys) {
    if (keyKind(k) === "note" || keyKind(k) === "frame") continue; // notas e molduras não são post-its do Event Storming
    const cat = esCategory(keyKind(k), getByKey(k)?.semanticType);
    if (cat) byCat.set(cat, (byCat.get(cat) || 0) + 1);
    else neutral++;
  }
  return { byCat, neutral };
}

export function renderLegend(): void {
  const el = $("#esLegend");
  if (!el) return;
  const collapsed = state.legendCollapsed;
  el.classList.toggle("collapsed", collapsed);
  const { byCat, neutral } = countVisible();
  const row = (swatch: string, text: string, hint: string, n: number) =>
    `<li class="${n ? "" : "is-zero"}" title="${esc(hint)}">${swatch}<span class="es-legend-label">${esc(text)}</span><b>${n}</b></li>`;
  const rows = ES_STYLES.map((s) =>
    row(
      `<span class="es-swatch" style="background:${s.bg};border-color:${s.outline}"></span>`,
      s.label,
      `Post-it ${s.colorName}: ${s.hint}`,
      byCat.get(s.id) || 0,
    ),
  ).join("");
  const structure = row(
    `<span class="es-swatch es-swatch-neutral"></span>`,
    "Estrutura da jornada",
    "Jornada, capítulo, cena, domínio, tabela e caixas sem tipo semântico",
    neutral,
  );
  el.innerHTML = `<button type="button" class="es-legend-head" data-legend-toggle aria-expanded="${!collapsed}"><span>Legenda · Event Storming</span><span aria-hidden="true">${collapsed ? "▸" : "▾"}</span></button>${collapsed ? "" : `<ul class="es-legend-list">${rows}${structure}</ul>`}`;
}

export function bindLegend(): void {
  $("#esLegend").addEventListener("click", (e) => {
    if (!target(e).closest("[data-legend-toggle]")) return;
    state.legendCollapsed = !state.legendCollapsed;
    renderLegend();
    queueViewPersist();
  });
}
