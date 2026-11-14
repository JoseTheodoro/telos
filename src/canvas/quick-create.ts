// #3 Criação encadeada ("tempestade rápida"), na convenção de mapas mentais:
//   Tab   → próximo passo / filho, conectado, à direita
//   Enter → irmão (mesmo tipo e mesmo pai), abaixo
import {
  NODE_H,
  NODE_W,
  PL,
  DEFAULT_NAME,
  PARENT_FIELD,
  buildEntity,
  initMappings,
  newEntityId,
  keyId,
  keyKind,
  nodeKey,
  collection,
  defaultEdgeName,
  edgeFor,
  syncMaps,
  nextSemanticType,
  type AnyEntity,
  type NodeKey,
  type NodeKind,
  type Point,
} from "@pep-atlas/domain";
import { change } from "../core/history";
import { getByKey, setFocus, state } from "../core/state";
import { notify } from "../ui/dom";
import { bringIntoView } from "./camera";
import { startInlineEdit } from "./inline-edit";
import { activePositions, ensurePositions, freeSpot, isTimeline, pos } from "./layout";
import { TL, makeRoom, rowYFor } from "./timeline";
import { visible } from "./visibility";

export type QuickMode = "next" | "sibling";

const GAP_X = 70;
const GAP_Y = 30;

/** Tab: o que vem "depois" de cada tipo. Evento e caixa livre seguem a linha do tempo. */
const NEXT_OF: Partial<Record<NodeKind, NodeKind>> = {
  journey: "chapter",
  chapter: "scene",
  scene: "event",
  event: "event",
  semantic: "semantic",
  domain: "system",
  system: "screen",
  screen: "table",
};

interface Plan {
  kind: NodeKind;
  /** Campo de pai na hierarquia (chapter.journeyId etc.) e seu valor. */
  parent?: { field: "journeyId" | "chapter" | "sceneId"; id: string };
  /** Seta extra de origem → novo (fora a de "contém"). */
  linkFrom?: NodeKey;
  linkStatus?: string;
  /** Herda tipo semântico / natureza do elemento de origem. */
  inherit: boolean;
  /** Tipo semântico explícito (caixa livre segue a gramática ES). */
  semanticType?: string;
  direction: "right" | "below";
}

function planFor(origin: NodeKey, mode: QuickMode): Plan | null {
  const kind = keyKind(origin);
  const o = getByKey(origin) as AnyEntity;
  // Pai do próprio elemento (para irmãos e para "próximo" do mesmo tipo).
  const ownParentField = PARENT_FIELD[kind];
  const ownParent = ownParentField ? { field: ownParentField, id: String(o[ownParentField] ?? "") } : undefined;

  if (mode === "sibling") return { kind, parent: ownParent, inherit: true, direction: "below" };

  const next = NEXT_OF[kind];
  if (!next) return null;
  if (next === kind) {
    // Mesma linha do tempo: mesmo pai + seta de sequência.
    // Caixa livre avança no fluxo ES (Ação → Estado, Comando → Agregado, Evento → Política…).
    const semanticType = kind === "semantic" ? (nextSemanticType(o.semanticType, kind) ?? o.semanticType) : undefined;
    return {
      kind,
      parent: ownParent,
      linkFrom: origin,
      linkStatus: kind === "semantic" ? "Hipótese" : "Registrado",
      inherit: true,
      semanticType,
      direction: "right",
    };
  }
  const childField = PARENT_FIELD[next];
  if (childField) return { kind: next, parent: { field: childField, id: o.id }, inherit: false, direction: "right" };
  // Ativos técnicos: filho conectado por seta (hipótese).
  return { kind: next, linkFrom: origin, linkStatus: "Hipótese", inherit: false, direction: "right" };
}

function layersSpot(origin: NodeKey, k: NodeKey, direction: "right" | "below"): Point {
  const o = pos(origin);
  const start = direction === "right" ? { x: o.x + NODE_W + GAP_X, y: o.y } : { x: o.x, y: o.y + NODE_H + GAP_Y };
  return freeSpot(start, k);
}

/** Descendentes narrativos (para achar a última coluna ocupada por um capítulo/cena). */
function narrativeDescendants(k: NodeKey): NodeKey[] {
  const ws = state.ws;
  const kind = keyKind(k);
  const id = keyId(k);
  const eventsOf = (sceneIds: string[]) => ws.events.filter((e) => sceneIds.includes(e.sceneId)).map((e) => nodeKey("event", e.id));
  if (kind === "scene") return eventsOf([id]);
  if (kind === "chapter") {
    const scenes = ws.scenes.filter((s) => s.chapter === id).map((s) => s.id);
    return [...scenes.map((s) => nodeKey("scene", s)), ...eventsOf(scenes)];
  }
  if (kind === "journey")
    return ws.chapters
      .filter((c) => c.journeyId === id)
      .flatMap((c) => [nodeKey("chapter", c.id), ...narrativeDescendants(nodeKey("chapter", c.id))]);
  return [];
}

/**
 * Timeline: capítulos, cenas e eventos entram NA SEQUÊNCIA (depois da última coluna da
 * origem), empurrando o resto para a direita. Evento paralelo (Enter) e caixas livres/
 * ativos técnicos ficam abaixo, sem empurrar ninguém.
 */
function timelineSpot(origin: NodeKey, k: NodeKey, kind: NodeKind, mode: QuickMode): Point {
  const positions = activePositions();
  const o = pos(origin);
  const originKind = keyKind(origin);
  const sequence = (["journey", "chapter", "scene", "event"] as NodeKind[]).includes(kind);
  const parallelEvent = kind === "event" && originKind === "event" && mode === "sibling";
  if (!sequence || parallelEvent) {
    const start = kind === originKind && mode === "next" ? { x: o.x + TL.COLW, y: o.y } : { x: o.x, y: o.y + TL.STACK };
    return freeSpot(start, k);
  }
  const lastX = (from: NodeKey) => Math.max(...[from, ...narrativeDescendants(from)].map((d) => positions[d]?.x ?? -Infinity));
  let x: number;
  if (kind === originKind) x = lastX(origin) + TL.COLW + (kind === "chapter" ? TL.CHAPTER_GAP : 0);
  else {
    const hasChildren = narrativeDescendants(origin).some((d) => keyKind(d) === kind && positions[d]);
    x = hasChildren ? lastX(origin) + TL.COLW : o.x;
  }
  makeRoom(positions, x, k);
  return { x, y: kind === "event" ? rowYFor(k, visible()) : (TL.ROW[kind] ?? o.y) };
}

/** Abre o recorte (cena → capítulo → jornada → mapa completo) até o nó aparecer. */
function widenUntilVisible(k: NodeKey): void {
  let widened = false;
  for (let i = 0; i < 3 && !visible().has(k); i++) {
    if (state.focusScene) setFocus(state.focusJourney, state.focusChapter, "");
    else if (state.focusChapter) setFocus(state.focusJourney, "", "");
    else setFocus("", "", "");
    widened = true;
  }
  // O recorte mais largo pode nunca ter sido aberto: sem posições, a vaga do card novo não tem referência.
  if (widened) ensurePositions();
}

/** Insere logo após a origem quando são do mesmo tipo (ordem da árvore e do layout). */
function insertAfter(list: AnyEntity[], originId: string | null, obj: AnyEntity): void {
  const idx = originId ? list.findIndex((x) => x.id === originId) : -1;
  if (idx >= 0) list.splice(idx + 1, 0, obj);
  else list.push(obj);
}

export function quickCreate(mode: QuickMode): void {
  const sel = state.selected;
  if (sel?.kind !== "node" || !getByKey(sel.id)) {
    notify("Selecione um card para criar o próximo (Tab) ou um irmão (Enter).");
    return;
  }
  const origin = sel.id;
  if (keyKind(origin) === "frame") {
    notify("Moldura não tem sequência: use ＋ Moldura, ou F com cards selecionados.");
    return;
  }
  const plan = planFor(origin, mode);
  if (!plan) {
    notify(`${PL[keyKind(origin)]}: use Enter para criar um irmão.`);
    return;
  }
  if (plan.parent && !plan.parent.id) {
    notify("Este elemento não tem pai definido; escolha-o no inspetor primeiro.");
    return;
  }

  const ws = state.ws;
  const src = getByKey(origin) as AnyEntity;
  const semantic = plan.semanticType ?? (plan.inherit ? src.semanticType : "Não definido");
  const name = plan.kind === "semantic" && plan.inherit && semantic !== "Não definido" ? semantic : DEFAULT_NAME[plan.kind];
  const id = newEntityId(ws, plan.kind);
  const k = nodeKey(plan.kind, id);
  const inheritVal = (field: string) => (plan.inherit ? String(src[field] ?? "") : "");
  // Pai vem do plano; natureza/destino/acesso são herdados do irmão de origem.
  const obj = buildEntity(plan.kind, id, name, semantic, (field) =>
    plan.parent && field === plan.parent.field ? plan.parent.id : inheritVal(field),
  );

  change(() => {
    insertAfter(collection(ws, plan.kind), plan.kind === keyKind(origin) ? src.id : null, obj);
    initMappings(ws, plan.kind, id);
    if (plan.parent) {
      const parentKind = { journeyId: "journey", chapter: "chapter", sceneId: "scene" }[plan.parent.field];
      ws.graph.edges.push(edgeFor(ws, nodeKey(parentKind, plan.parent.id), k, "contém", "Registrado", "Criação rápida"));
    }
    if (plan.linkFrom)
      ws.graph.edges.push(edgeFor(ws, plan.linkFrom, k, defaultEdgeName(ws, plan.linkFrom, k), plan.linkStatus, "Criação rápida"));
    syncMaps(ws);
    widenUntilVisible(k);
    activePositions()[k] = isTimeline() ? timelineSpot(origin, k, plan.kind, mode) : layersSpot(origin, k, plan.direction);
    state.selected = { kind: "node", id: k };
  });
  bringIntoView(k, 0.7);
  startInlineEdit(k, { isNew: true, origin });
}

/** Rótulo do que Tab criaria a partir do tipo (para botões e dicas). */
export function nextLabel(kind: NodeKind, semanticType?: string): string | null {
  const next = NEXT_OF[kind];
  if (!next) return null;
  if (kind === "semantic") {
    const t = nextSemanticType(semanticType, kind);
    if (t) return `Próximo: ${t}`;
  }
  if (next === "event" && kind === "event") return "Próximo evento";
  if (next === "semantic") return "Próxima caixa";
  return DEFAULT_NAME[next];
}
