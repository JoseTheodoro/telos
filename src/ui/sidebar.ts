// Barra lateral (árvore da jornada, catálogo, hotspots) e filtros de recorte.
import { COLORS, PL, TYPES } from "../domain/constants";
import { nodeKey } from "../domain/keys";
import { childCount, collection } from "../domain/model";
import type { Chapter, Journey, NodeKind, SidebarTab } from "../domain/types";
import { queueViewPersist } from "../core/persistence";
import { get, label, related, setFocus, state } from "../core/state";
import { refreshAll } from "../app";
import { ensureVisible, selectNode } from "../actions";
import { ensurePositions } from "../canvas/layout";
import { createModal } from "./modal";
import { $, $$, esc, target } from "./dom";

function journeyTree(j: Journey, ji: number): string {
  const { ws, collapsed, focusJourney, focusChapter, focusScene } = state;
  const chapters = ws.chapters.filter((c) => c.journeyId === j.id);
  const opened = !collapsed.has("journey:" + j.id);
  const head = `<button class="tree-row journey-row ${focusJourney === j.id && !focusChapter ? "active" : ""}" data-focus-journey="${esc(j.id)}"><span class="tree-serial">J${ji + 1}</span><span class="tree-copy"><strong>${esc(j.name)}</strong><small>${chapters.length} capítulos</small></span><span data-collapse="journey:${esc(j.id)}">${opened ? "⌄" : "›"}</span></button>`;
  if (!opened) return head;
  const chapterRows = chapters
    .map((c: Chapter, i) => {
      const scenes = ws.scenes.filter((s) => s.chapter === c.id);
      const isOpen = !collapsed.has("chapter:" + c.id);
      const row = `<button class="tree-row ${focusChapter === c.id && !focusScene ? "active" : ""}" data-focus-chapter="${esc(c.id)}"><span class="tree-serial">${String(i + 1).padStart(2, "0")}</span><span class="tree-copy"><strong>${esc(c.label)}</strong><small>${esc(c.date)}</small></span><span class="tree-counter">${scenes.length}</span><span data-collapse="chapter:${esc(c.id)}">${isOpen ? "⌄" : "›"}</span></button>`;
      if (!isOpen) return row;
      const sceneRows = scenes
        .map(
          (s) =>
            `<button class="tree-row ${focusScene === s.id ? "active" : ""}" data-focus-scene="${esc(s.id)}"><span class="tree-copy"><strong>${esc(s.title)}</strong><small>${esc(s.time)} · ${childCount(ws, "scene", s.id)} eventos</small></span></button>`,
        )
        .join("");
      return `${row}<div class="scene-tree">${sceneRows}<button class="tree-add" data-create="scene" data-parent="chapter:${esc(c.id)}">＋ Nova cena</button></div>`;
    })
    .join("");
  return `${head}<div class="chapter-tree">${chapterRows}<button class="tree-add" data-create="chapter" data-parent="journey:${esc(j.id)}">＋ Novo capítulo</button></div>`;
}

function inventory(): string {
  const { ws, search } = state;
  const q = search.toLowerCase();
  const groups = TYPES.map((t) => {
    const arr = collection(ws, t).filter((o) =>
      (label(nodeKey(t, o.id)) + " " + (o.notes || "")).toLowerCase().includes(q),
    );
    const items =
      arr
        .slice(0, 100)
        .map(
          (o) =>
            `<button class="inventory-item" data-select-node="${esc(nodeKey(t, o.id))}"><span class="dot" style="background:${COLORS[t]}"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label(nodeKey(t, o.id)))}</span></button>`,
        )
        .join("") || '<div class="emptymsg">Nenhum registro.</div>';
    return `<div class="inventory-group"><div class="inventory-title"><span>${PL[t].toUpperCase()}S · ${arr.length}</span><button data-create="${t}" title="Adicionar">＋</button></div>${items}</div>`;
  }).join("");
  return `<input class="lookup" id="search" value="${esc(search)}" placeholder="Pesquisar qualquer elemento...">${groups}`;
}

/** Aba Hotspots: mesma fonte dos post-its vermelhos do canvas. */
function decisions(): string {
  const list = state.ws.decisions;
  const open = list.filter((d) => d.status !== "Resolvida").length;
  const cards = list
    .map((d) => {
      const k = nodeKey("hotspot", d.id);
      const links = related(k).map((e) => label(e.from === k ? e.to : e.from));
      const where = links.length
        ? `<small class="decision-links">↳ ${links.map(esc).join(" · ")}</small>`
        : `<small class="decision-links is-loose">Sem vínculo no canvas</small>`;
      const selected = state.selected?.kind === "node" && state.selected.id === k;
      return `<div class="decision-card ${selected ? "active" : ""}" data-status="${esc(d.status)}"><b><span class="decision-id">${esc(d.id)}</span> ${esc(d.title)}</b><p>${esc(d.description)}</p>${where}<span class="chip">${esc(d.status)}</span> <span class="chip">${esc(d.priority || "Média")}</span><button class="btn sm" data-select-node="${esc(k)}">Ver no canvas ↗</button></div>`;
    })
    .join("");
  return (
    `<p class="sub">Dúvidas, riscos e decisões da oficina: <b>${open} em aberto</b> de ${list.length}. Cada hotspot é um post-it vermelho no canvas; ligue-o aos cards que ele questiona.</p>` +
    `<button class="tree-add" data-create="hotspot">＋ Novo hotspot</button>` +
    cards
  );
}

export function renderSidebar(): void {
  $$(".tab").forEach((x) => x.classList.toggle("active", x.dataset.tab === state.sidebarTab));
  let out = "";
  if (state.sidebarTab === "journey")
    out =
      `<button class="tree-add" data-create="journey">＋ Nova jornada</button>` +
      state.ws.journeys.map(journeyTree).join("") +
      `<button class="tree-add" data-focus-all="yes">◇ Visualizar mapa completo</button>`;
  if (state.sidebarTab === "inventory") out = inventory();
  if (state.sidebarTab === "decisions") out = decisions();
  $("#sidebarBody").innerHTML = out;
}

export function renderFilters(): void {
  const { ws, focusJourney, focusChapter, focusScene } = state;
  const opt = (id: string, text: string, current: string) =>
    `<option value="${esc(id)}" ${current === id ? "selected" : ""}>${esc(text)}</option>`;

  $("#journeyFilter").innerHTML =
    `<option value="">Todas as jornadas</option>` + ws.journeys.map((j) => opt(j.id, j.name, focusJourney)).join("");

  const chapters = focusJourney ? ws.chapters.filter((c) => c.journeyId === focusJourney) : ws.chapters;
  $("#chapterFilter").innerHTML =
    `<option value="">Todos os capítulos</option>` + chapters.map((c) => opt(c.id, c.label, focusChapter)).join("");

  const scenes = focusChapter
    ? ws.scenes.filter((s) => s.chapter === focusChapter)
    : ws.scenes.filter(
        (s) => !focusJourney || ws.chapters.some((c) => c.id === s.chapter && c.journeyId === focusJourney),
      );
  $("#sceneFilter").innerHTML =
    `<option value="">Todas as cenas</option>` + scenes.map((s) => opt(s.id, s.title, focusScene)).join("");
}

/** Troca o recorte, reposiciona, re-renderiza e enquadra. */
function focusAndFit(journey: string, chapter: string, scene: string): void {
  setFocus(journey, chapter, scene);
  ensurePositions();
  refreshAll(true);
}

const chapterJourney = (chapterId: string) => (get("chapter", chapterId) as Chapter | undefined)?.journeyId || "";
const sceneChapter = (sceneId: string) => String(get("scene", sceneId)?.chapter ?? "");

export function bindSidebar(): void {
  $("#sidebarBody").addEventListener("click", (e) => {
    const el = target(e);
    const create = el.closest<HTMLElement>("[data-create]");
    if (create) {
      createModal(create.dataset.create as NodeKind, null, null, create.dataset.parent || "");
      return;
    }
    const collapse = el.closest<HTMLElement>("[data-collapse]");
    if (collapse) {
      e.stopPropagation();
      const key = collapse.dataset.collapse as string;
      state.collapsed.has(key) ? state.collapsed.delete(key) : state.collapsed.add(key);
      renderSidebar();
      return;
    }
    const j = el.closest<HTMLElement>("[data-focus-journey]");
    if (j) {
      const id = j.dataset.focusJourney as string;
      focusAndFit(id, "", "");
      selectNode(nodeKey("journey", id));
      return;
    }
    const c = el.closest<HTMLElement>("[data-focus-chapter]");
    if (c) {
      const id = c.dataset.focusChapter as string;
      focusAndFit(chapterJourney(id), id, "");
      selectNode(nodeKey("chapter", id));
      return;
    }
    const s = el.closest<HTMLElement>("[data-focus-scene]");
    if (s) {
      const id = s.dataset.focusScene as string;
      const chapter = sceneChapter(id);
      focusAndFit(chapterJourney(chapter), chapter, id);
      selectNode(nodeKey("scene", id));
      return;
    }
    if (el.closest("[data-focus-all]")) {
      focusAndFit("", "", "");
      return;
    }
    const k = el.closest<HTMLElement>("[data-select-node]");
    if (k) {
      ensureVisible(k.dataset.selectNode as string);
      return;
    }

  });

  $("#sidebarBody").addEventListener("input", (e) => {
    const input = target(e) as HTMLInputElement;
    if (input.id !== "search") return;
    state.search = input.value;
    const caret = input.selectionStart;
    renderSidebar();
    const n = $<HTMLInputElement>("#search");
    n.focus();
    n.setSelectionRange(caret, caret);
  });

  $$("[data-tab]").forEach((x) =>
    x.addEventListener("click", () => {
      state.sidebarTab = x.dataset.tab as SidebarTab;
      renderSidebar();
      queueViewPersist();
    }),
  );

  $("#journeyFilter").addEventListener("change", (e) => {
    focusAndFit((target(e) as HTMLSelectElement).value, "", "");
  });
  $("#chapterFilter").addEventListener("change", (e) => {
    const chapter = (target(e) as HTMLSelectElement).value;
    focusAndFit(chapter ? chapterJourney(chapter) : state.focusJourney, chapter, "");
  });
  $("#sceneFilter").addEventListener("change", (e) => {
    const scene = (target(e) as HTMLSelectElement).value;
    if (!scene) {
      focusAndFit(state.focusJourney, state.focusChapter, "");
      return;
    }
    const chapter = sceneChapter(scene);
    focusAndFit(chapterJourney(chapter), chapter, scene);
  });
}
