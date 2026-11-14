// Quais nós aparecem no recorte atual (jornada / capítulo / cena / mapa completo).
import { ARR, NARRATIVE_KINDS, TYPES, keyKind, nodeKey, type AnyEntity, type NodeKey } from "@pep-atlas/domain";
import { get, getByKey, state } from "../core/state";

const isNarrative = (k: NodeKey) => NARRATIVE_KINDS.includes(keyKind(k));

export function scopeKey(): string {
  const { focusScene, focusChapter, focusJourney } = state;
  if (focusScene) return "scene:" + focusScene;
  if (focusChapter) return "chapter:" + focusChapter;
  if (focusJourney) return "journey:" + focusJourney;
  return "all";
}

/**
 * Nós narrativos do recorte + vizinhos técnicos diretos
 * (+ telas/tabelas penduradas nos sistemas visíveis).
 */
export function visible(): Set<NodeKey> {
  const { ws, focusScene, focusChapter, focusJourney } = state;
  const set = new Set<NodeKey>();
  let first: NodeKey[];
  const eventKeysOf = (sceneIds: string[]) => ws.events.filter((e) => sceneIds.includes(e.sceneId)).map((e) => nodeKey("event", e.id));

  if (focusScene && get("scene", focusScene)) {
    const sc = ws.scenes.find((s) => s.id === focusScene)!;
    const c = ws.chapters.find((x) => x.id === sc.chapter);
    first = [
      nodeKey("scene", sc.id),
      nodeKey("chapter", sc.chapter),
      ...(c ? [nodeKey("journey", c.journeyId)] : []),
      ...eventKeysOf([sc.id]),
    ];
  } else if (focusChapter && get("chapter", focusChapter)) {
    const c = ws.chapters.find((x) => x.id === focusChapter)!;
    const scenes = ws.scenes.filter((x) => x.chapter === focusChapter);
    first = [
      nodeKey("journey", c.journeyId),
      nodeKey("chapter", focusChapter),
      ...scenes.map((s) => nodeKey("scene", s.id)),
      ...eventKeysOf(scenes.map((s) => s.id)),
    ];
  } else if (focusJourney && get("journey", focusJourney)) {
    const chapters = ws.chapters.filter((c) => c.journeyId === focusJourney);
    const scenes = ws.scenes.filter((s) => chapters.some((c) => c.id === s.chapter));
    first = [
      nodeKey("journey", focusJourney),
      ...chapters.map((c) => nodeKey("chapter", c.id)),
      ...scenes.map((s) => nodeKey("scene", s.id)),
      ...eventKeysOf(scenes.map((s) => s.id)),
    ];
  } else {
    first = [
      ...ws.journeys.map((o) => nodeKey("journey", o.id)),
      ...ws.chapters.map((c) => nodeKey("chapter", c.id)),
      ...ws.scenes.map((s) => nodeKey("scene", s.id)),
      ...ws.events.map((e) => nodeKey("event", e.id)),
    ];
  }
  first.forEach((k) => set.add(k));

  const edges = ws.graph.edges;
  for (const e of edges) if (first.includes(e.from) && !isNarrative(e.to)) set.add(e.to);
  for (const e of edges) if (first.includes(e.to) && !isNarrative(e.from)) set.add(e.from);
  for (const e of edges) if (set.has(e.from) && keyKind(e.from) === "system" && !isNarrative(e.to)) set.add(e.to);
  for (const e of edges) if (set.has(e.to) && keyKind(e.to) === "system" && !isNarrative(e.from)) set.add(e.from);

  // #10 Notas livres aparecem no recorte em que foram criadas (e onde estiverem ligadas por seta).
  const scope = scopeKey();
  for (const n of ws.canvasNotes) if (n.scope === scope) set.add(nodeKey("note", n.id));
  for (const f of ws.frames) if (f.scope === scope) set.add(nodeKey("frame", f.id));

  if (!focusScene && !focusChapter && !focusJourney)
    for (const t of TYPES) for (const o of ws[ARR[t]] as AnyEntity[]) set.add(nodeKey(t, o.id));

  return new Set([...set].filter((k) => getByKey(k)));
}
