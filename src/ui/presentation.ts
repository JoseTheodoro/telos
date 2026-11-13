// #9 Modo apresentação: percorre a jornada cena a cena (história, eventos, emoção,
// dores e hotspots), para conduzir a oficina ou mostrar a descoberta a quem não esteve lá.
import { EMOTION_LEVELS, emotionLevel, emotionSigned, hasEmotion } from "../domain/emotion";
import { keyKind, nodeKey } from "../domain/keys";
import { laneOf } from "../domain/lanes";
import type { Chapter, Decision, EventItem, NodeKey, RegistryOption, Scene } from "../domain/types";
import { change, redo, undo } from "../core/history";
import { getByKey, label, state } from "../core/state";
import { ensureVisible, selectNode } from "../actions";
import { centerOn } from "../canvas/camera";
import { $, esc, notify, target } from "./dom";

let open = false;
let seq: string[] = [];
let idx = 0;
let journeyId = "";
let returnFocus: HTMLElement | null = null;

export const isPresenting = (): boolean => open;

const chaptersOf = (jid: string): Chapter[] => state.ws.chapters.filter((c) => c.journeyId === jid);

/** Cenas da jornada na ordem narrativa (capítulos da jornada → cenas de cada capítulo). */
function sequenceFor(jid: string): string[] {
  const ws = state.ws;
  const out: string[] = [];
  for (const c of chaptersOf(jid)) for (const s of ws.scenes) if (s.chapter === c.id) out.push(s.id);
  return out;
}

/** Jornada e cena de partida: a cena selecionada/focada, ou o início do recorte. */
function startPoint(): { jid: string; sceneId: string } {
  const ws = state.ws;
  const sel = state.selected?.kind === "node" ? state.selected.id : "";
  let sceneId = "";
  if (sel && keyKind(sel) === "scene") sceneId = (getByKey(sel) as Scene | undefined)?.id ?? "";
  else if (sel && keyKind(sel) === "event") sceneId = (getByKey(sel) as EventItem | undefined)?.sceneId ?? "";
  if (!sceneId) sceneId = state.focusScene;
  if (!sceneId && state.focusChapter) sceneId = ws.scenes.find((s) => s.chapter === state.focusChapter)?.id ?? "";
  const chapterOf = (sid: string) => ws.chapters.find((c) => c.id === ws.scenes.find((s) => s.id === sid)?.chapter);
  const jid =
    chapterOf(sceneId)?.journeyId ||
    state.focusJourney ||
    ws.journeys.find((j) => sequenceFor(j.id).length)?.id ||
    "";
  return { jid, sceneId };
}

export function startPresentation(): void {
  const { jid, sceneId } = startPoint();
  const list = sequenceFor(jid);
  if (!list.length) {
    notify("Nenhuma cena para apresentar nesta jornada");
    return;
  }
  journeyId = jid;
  seq = list;
  idx = Math.max(0, seq.indexOf(sceneId));
  open = true;
  returnFocus = document.activeElement as HTMLElement | null;
  const el = $("#presentation");
  el.hidden = false;
  document.body.classList.add("presenting");
  render();
  el.focus();
}

export function stopPresentation(goToCanvas = false): void {
  if (!open) return;
  open = false;
  const el = $("#presentation");
  el.hidden = true;
  el.innerHTML = "";
  document.body.classList.remove("presenting");
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  // Volta ao canvas na cena em que a apresentação parou.
  const k = nodeKey("scene", seq[idx]);
  if (getByKey(k)) {
    if (goToCanvas) ensureVisible(k);
    else {
      selectNode(k);
      if (state.visibleKeys.has(k)) centerOn(k);
    }
  }
  returnFocus?.focus?.();
}

function go(to: number): void {
  idx = Math.max(0, Math.min(seq.length - 1, to));
  render();
}

const optLabel = (list: RegistryOption[], id: string) => list.find((o) => o.id === id)?.label || id || "A decidir";

/** Hotspots ligados à cena ou a algum evento dela (em qualquer direção da seta). */
function hotspotsOf(scene: Scene, events: EventItem[]): Decision[] {
  const keys = new Set<NodeKey>([nodeKey("scene", scene.id), ...events.map((e) => nodeKey("event", e.id))]);
  const ids = new Set<NodeKey>();
  for (const e of state.ws.graph.edges) {
    if (keys.has(e.from) && keyKind(e.to) === "hotspot") ids.add(e.to);
    if (keys.has(e.to) && keyKind(e.from) === "hotspot") ids.add(e.from);
  }
  return [...ids].map((k) => getByKey(k) as Decision | undefined).filter((d): d is Decision => !!d);
}

/** Sistemas e telas tocados por um evento (setas de rastreabilidade). */
function techOf(ev: EventItem): string[] {
  const k = nodeKey("event", ev.id);
  const names = state.ws.graph.edges
    .filter((e) => e.from === k && (keyKind(e.to) === "system" || keyKind(e.to) === "screen"))
    .map((e) => label(e.to));
  return [...new Set(names)];
}

const lines = (xs: string[] | undefined) => (xs || []).map((x) => x.trim()).filter(Boolean);

function emotionCard(s: Scene): string {
  const cur = hasEmotion(s) ? s.emotion : null;
  const lvl = cur === null ? null : emotionLevel(cur);
  const faces = EMOTION_LEVELS.slice()
    .reverse()
    .map(
      (l) =>
        `<button type="button" class="pres-face${cur === l.value ? " is-active" : ""}" data-pres-emotion="${l.value}" data-sign="${Math.sign(l.value)}" title="${l.label} (${emotionSigned(l.value)})" aria-pressed="${cur === l.value}">${l.face}</button>`,
    )
    .join("");
  return `<section class="pres-card pres-emotion" data-sign="${lvl ? Math.sign(lvl.value) : ""}"><h3>Como a pessoa se sente</h3><div class="pres-emotion-now">${lvl ? `<span class="pres-big-face">${lvl.face}</span><b>${esc(lvl.label)}</b><small>${emotionSigned(lvl.value)}</small>` : `<span class="pres-big-face muted">?</span><b>Sem nota</b><small>dê a nota com o time</small>`}</div><div class="pres-faces" role="group" aria-label="Nota de emoção da cena">${faces}</div></section>`;
}

/** Mini curva da jornada inteira: um ponto por cena, clicável para pular. */
function strip(): string {
  const ws = state.ws;
  const STEP = 34;
  const PAD = 22;
  const H = 92;
  const y = (v: number) => 16 + (2 - v) * 15;
  const w = PAD * 2 + (seq.length - 1) * STEP;
  const pts = seq.map((id, i) => {
    const s = ws.scenes.find((x) => x.id === id) as Scene;
    return { i, s, x: PAD + i * STEP, v: hasEmotion(s) ? s.emotion : null };
  });
  const rated = pts.filter((p) => p.v !== null);
  const path = rated.map((p, j) => `${j ? "L" : "M"} ${p.x} ${y(p.v as number)}`).join(" ");
  let out = `<line x1="${PAD - 10}" x2="${w - PAD + 10}" y1="${y(0)}" y2="${y(0)}" class="pres-strip-zero"/>`;
  // Separadores de capítulo.
  let prev = "";
  for (const p of pts) {
    if (p.s.chapter !== prev && p.i > 0) out += `<line x1="${p.x - STEP / 2}" x2="${p.x - STEP / 2}" y1="6" y2="${H - 22}" class="pres-strip-sep"/>`;
    prev = p.s.chapter;
  }
  if (rated.length > 1) out += `<path d="${path}" class="pres-strip-line"/>`;
  for (const p of pts) {
    const cy = y(p.v ?? 0);
    const cls = `pres-dot${p.i === idx ? " current" : ""}${p.v === null ? " unrated" : ""}`;
    out += `<g class="${cls}" data-pres-jump="${p.i}" data-sign="${p.v === null ? "" : Math.sign(p.v)}"><title>${esc(p.s.title)}${p.v === null ? " · sem nota" : ` · ${emotionLevel(p.v).label}`}${p.s.pain?.trim() ? " · ⚡ dor" : ""}</title><circle cx="${p.x}" cy="${cy}" r="${p.i === idx ? 9 : 6}"/>${p.s.pain?.trim() ? `<text x="${p.x}" y="${H - 8}" text-anchor="middle" class="pres-strip-pain">⚡</text>` : ""}</g>`;
  }
  return `<svg class="pres-strip" viewBox="0 0 ${w} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Curva de emoção da jornada">${out}</svg>`;
}

function render(): void {
  const ws = state.ws;
  const el = $("#presentation");
  const s = ws.scenes.find((x) => x.id === seq[idx]);
  if (!s) {
    stopPresentation();
    return;
  }
  const journey = ws.journeys.find((j) => j.id === journeyId);
  const chapter = ws.chapters.find((c) => c.id === s.chapter);
  const chIndex = chapter ? chaptersOf(journeyId).indexOf(chapter) + 1 : 0;
  const events = ws.events.filter((e) => e.sceneId === s.id);
  const hotspots = hotspotsOf(s, events);
  const lane = ws.lanes.find((l) => l.id === laneOf(ws, s))?.label ?? "";
  const pain = (s.pain || "").trim();
  const questions = lines(s.questions);
  const answers = lines(s.answers);
  const firstOfChapter = idx === 0 || ws.scenes.find((x) => x.id === seq[idx - 1])?.chapter !== s.chapter;

  const eventsHtml = events.length
    ? `<ol class="pres-events">${events
        .map((e) => {
          const tech = techOf(e);
          return `<li><b>${esc(e.name)}</b><small>${esc(optLabel(ws.natureOptions, e.type))} · ${esc(optLabel(ws.destinationOptions, e.destination))}</small>${tech.length ? `<span class="pres-tech">${tech.map((t) => `<i>${esc(t)}</i>`).join("")}</span>` : ""}</li>`;
        })
        .join("")}</ol>`
    : `<p class="pres-empty">Nenhum evento registrado nesta cena.</p>`;
  const hotspotsHtml = hotspots.length
    ? `<section class="pres-card pres-hotspots"><h3>Hotspots · dúvidas e riscos</h3><ul>${hotspots
        .map((h) => `<li><span class="pres-hid">${esc(h.id)}</span><b>${esc(h.title)}</b><small>${esc(h.status || "Aberta")}${h.priority ? " · " + esc(h.priority) : ""}</small></li>`)
        .join("")}</ul></section>`
    : "";
  const qa =
    questions.length || answers.length
      ? `<div class="pres-qa">${questions.length ? `<div><h3>Perguntas da oficina</h3><ul>${questions.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>` : ""}${answers.length ? `<div><h3>Respostas</h3><ul>${answers.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}</div>`
      : "";

  el.innerHTML = `<div class="pres-top"><div class="pres-crumbs"><span>${esc(journey?.name ?? "Jornada")}</span>${chapter ? `<b>Capítulo ${String(chIndex).padStart(2, "0")} · ${esc(chapter.label)}</b>${chapter.date ? `<small>${esc(chapter.date)}</small>` : ""}` : ""}</div><div class="pres-controls"><span class="pres-count">Cena ${idx + 1} de ${seq.length}</span><button type="button" class="pres-btn" data-pres-canvas title="Fechar e mostrar esta cena no canvas">◇ Ver no canvas</button><button type="button" class="pres-btn" data-pres-full title="Tela cheia (F)">⛶</button><button type="button" class="pres-btn" data-pres-exit title="Sair (Esc)">✕ Sair</button></div></div>
<div class="pres-progress"><span style="width:${((idx + 1) / seq.length) * 100}%"></span></div>
<div class="pres-main">
  <article class="pres-scene">
    ${firstOfChapter && chapter?.title && chapter.title !== chapter.label ? `<p class="pres-chapter-title">${esc(chapter.title)}</p>` : ""}
    <div class="pres-meta">${s.time ? `<span>${esc(s.time)}</span>` : ""}${lane ? `<span class="pres-lane">${esc(lane)}</span>` : ""}${s.discussed ? `<span class="pres-discussed">✓ discutida</span>` : ""}</div>
    <h1>${esc(s.title)}</h1>
    ${s.actor ? `<p class="pres-actor">${esc(s.actor)}</p>` : ""}
    ${s.story?.trim() ? `<p class="pres-story">${esc(s.story)}</p>` : `<p class="pres-story pres-empty">Sem história registrada.</p>`}
    ${qa}
  </article>
  <aside class="pres-side">
    ${emotionCard(s)}
    ${pain ? `<section class="pres-card pres-pain"><h3>⚡ Dor</h3><p>${esc(pain)}</p></section>` : ""}
    <section class="pres-card pres-ev"><h3>Eventos · ${events.length}</h3>${eventsHtml}</section>
    ${hotspotsHtml}
  </aside>
</div>
<div class="pres-bottom"><button type="button" class="pres-nav" data-pres-go="-1" ${idx === 0 ? "disabled" : ""} title="Cena anterior (←)">‹</button>${strip()}<button type="button" class="pres-nav" data-pres-go="1" ${idx === seq.length - 1 ? "disabled" : ""} title="Próxima cena (→ ou espaço)">›</button></div>
<p class="pres-keys"><kbd>←</kbd> <kbd>→</kbd> navegar · <kbd>Home</kbd> <kbd>End</kbd> início/fim · <kbd>F</kbd> tela cheia · <kbd>Esc</kbd> sair</p>`;
}

function setEmotion(v: number): void {
  const s = state.ws.scenes.find((x) => x.id === seq[idx]);
  if (!s) return;
  // Clicar de novo na nota atual remove a nota.
  change(() => {
    if (s.emotion === v) delete s.emotion;
    else s.emotion = v;
  });
  render();
}

function toggleFullscreen(): void {
  const el = $("#presentation");
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void el.requestFullscreen?.().catch(() => notify("Tela cheia indisponível neste navegador"));
}

export function bindPresentation(): void {
  const el = $("#presentation");
  el.addEventListener("click", (e) => {
    const t = target(e);
    const goBtn = t.closest<HTMLElement>("[data-pres-go]");
    if (goBtn) return go(idx + Number(goBtn.dataset.presGo));
    const jump = t.closest<SVGElement>("[data-pres-jump]");
    if (jump) return go(Number(jump.dataset.presJump));
    const face = t.closest<HTMLElement>("[data-pres-emotion]");
    if (face) return setEmotion(Number(face.dataset.presEmotion));
    if (t.closest("[data-pres-full]")) return toggleFullscreen();
    if (t.closest("[data-pres-canvas]")) return stopPresentation(true);
    if (t.closest("[data-pres-exit]")) return stopPresentation();
  });

  // Captura: enquanto apresenta, nenhum atalho do canvas (N, H, Del, Tab…) dispara.
  window.addEventListener(
    "keydown",
    (e) => {
      if (!open) return;
      e.stopImmediatePropagation();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;
      if (mod && key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        render();
        return;
      }
      if (mod) return;
      const onButton = !!target(e).closest?.("button");
      const actions: Record<string, () => void> = {
        ArrowRight: () => go(idx + 1),
        ArrowDown: () => go(idx + 1),
        PageDown: () => go(idx + 1),
        " ": () => go(idx + 1),
        ArrowLeft: () => go(idx - 1),
        ArrowUp: () => go(idx - 1),
        PageUp: () => go(idx - 1),
        Home: () => go(0),
        End: () => go(seq.length - 1),
        Escape: () => stopPresentation(),
        f: toggleFullscreen,
        F: toggleFullscreen,
      };
      // Espaço/Enter num botão focado acionam o botão (comportamento nativo).
      if (onButton && (key === " " || key === "Enter")) return;
      const fn = actions[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    },
    true,
  );
}
