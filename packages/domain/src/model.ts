// Operações puras sobre o Workspace (sem DOM).
import {
  ARR,
  DEST_BASE,
  FRAME_MIN,
  FRAME_PALETTE,
  NATURE_BASE,
  PORT_SIDES,
  SCHEMA,
  SEMANTIC_BASE,
  TABLE_COLORS,
  TYPES,
  UNDEFINED_SEMANTIC,
} from "./constants.ts";
import { newEntityId } from "./factory.ts";
import { upgradeLanes } from "./lanes.ts";
import { upgradeEmotion } from "./emotion.ts";
import { grammarFor, type End, type Verdict } from "./grammar.ts";
import { keyId, keyKind, newId, nodeKey } from "./keys.ts";
import type { AnyEntity, DomainRole, Edge, Journey, NodeKey, NodeKind, Table, Workspace } from "./types.ts";

export const deep = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Lista mutável de entidades de um tipo. */
export function collection(ws: Workspace, kind: NodeKind): AnyEntity[] {
  return ws[ARR[kind]] as AnyEntity[];
}

export function getEntity(ws: Workspace, kind: NodeKind, id: string | undefined): AnyEntity | undefined {
  const list = ws[ARR[kind]] as AnyEntity[] | undefined;
  return list?.find((o) => o.id === id);
}

export function getEntityByKey(ws: Workspace, k: NodeKey): AnyEntity | undefined {
  return getEntity(ws, keyKind(k), keyId(k));
}

/** Campo que guarda o nome exibido no card de cada tipo. */
export function nameField(kind: NodeKind): "label" | "title" | "name" {
  return kind === "chapter" ? "label" : kind === "scene" || kind === "hotspot" || kind === "frame" ? "title" : "name";
}

/** Título de uma nota livre: primeira linha com conteúdo (sem marcação Markdown). */
export function noteTitle(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#>*\-\s`]+/, "").trim())
    .find(Boolean);
  if (!line) return "Nota vazia";
  return line.length > 48 ? line.slice(0, 47).trimEnd() + "…" : line;
}

export function entityLabel(ws: Workspace, k: NodeKey): string {
  const o = getEntityByKey(ws, k);
  if (!o) return "(removido)";
  if (keyKind(k) === "note") return noteTitle(String(o.text ?? ""));
  const field = nameField(keyKind(k));
  if (field !== "name") return String(o[field] ?? "");
  return o.name || "(sem nome)";
}

export function semanticLabel(o: AnyEntity | undefined): string {
  return o?.semanticType && o.semanticType !== UNDEFINED_SEMANTIC ? o.semanticType : "";
}

export function validColor(c: string | undefined | null): string {
  return /^#[0-9a-fA-F]{6}$/.test(c || "") ? (c as string).toLowerCase() : "";
}

/** Cor padrão das setas que tocam um hotspot (mesmo vermelho do post-it). */
const HOTSPOT_EDGE = "#b3261e";
const touchesHotspot = (e: Partial<Edge>) => (!!e.from && keyKind(e.from) === "hotspot") || (!!e.to && keyKind(e.to) === "hotspot");

export function colorForEdge(e: Partial<Edge>): string {
  return (
    validColor(e.color) ||
    (touchesHotspot(e) ? HOTSPOT_EDGE : "") ||
    (e.accessMode === "WRITE"
      ? TABLE_COLORS.WRITE
      : e.accessMode === "READ"
        ? TABLE_COLORS.READ
        : e.status === "Validado"
          ? "#35936b"
          : e.status === "Hipótese"
            ? "#baa780"
            : "#8ea99d")
  );
}

export function isTableLink(e: Edge): boolean {
  return keyKind(e.from) === "table" || keyKind(e.to) === "table";
}

export function edgeFor(
  ws: Workspace,
  a: NodeKey,
  b: NodeKey,
  rel = "relaciona com",
  status = "Hipótese",
  source = "Criada no editor",
): Edge {
  const tab =
    keyKind(a) === "table"
      ? (getEntityByKey(ws, a) as Table | undefined)
      : keyKind(b) === "table"
        ? (getEntityByKey(ws, b) as Table | undefined)
        : undefined;
  const edge: Edge = {
    id: "r" + newId(),
    from: a,
    to: b,
    label: rel,
    status,
    source,
    evidence: "",
    color: "",
    accessMode: tab?.defaultAccess || "",
  };
  if (isEventDomain(edge)) edge.role = roleFromLabel(rel) || "owner";
  return edge;
}

/** Seta evento → domínio (a única que carrega papel de domínio). */
export const isEventDomain = (e: Pick<Edge, "from" | "to">): boolean => keyKind(e.from) === "event" && keyKind(e.to) === "domain";

/** Papel inferido do rótulo legado (só para migração e criação). */
function roleFromLabel(label: string): DomainRole {
  if (label.includes("consumido")) return "consumer";
  if (label.includes("responsável")) return "owner";
  return "";
}

/** Ponta da seta para a gramática ES. */
function endOf(ws: Workspace, k: NodeKey): End {
  return { kind: keyKind(k), semanticType: getEntityByKey(ws, k)?.semanticType };
}

/** Veredito da gramática Event Storming para uma seta (ou par de nós). */
export function edgeVerdict(ws: Workspace, from: NodeKey, to: NodeKey): Verdict {
  return grammarFor(endOf(ws, from), endOf(ws, to));
}

const DEFAULT_EDGE_NAMES: Record<string, string> = {
  "journey:chapter": "contém",
  "chapter:scene": "contém",
  "scene:event": "contém",
  "scene:system": "envolve sistema",
  "scene:domain": "envolve domínio",
  "scene:screen": "usa tela",
  "event:domain": "domínio responsável?",
  "event:system": "sistema produtor?",
  "event:screen": "registrado na tela?",
  "event:table": "acessa dados em?",
  "domain:system": "responsável por?",
  "system:screen": "expõe tela?",
  "system:table": "acessa tabela?",
  "screen:table": "acessa tabela?",
  "event:event": "precede / depende de",
  "system:system": "integra com",
  "semantic:semantic": "transiciona / depende de",
  "event:semantic": "gera estado / ação",
  "semantic:event": "aciona evento",
};

/** Rótulo sugerido: gramática ES quando ela se aplica; senão, padrão por tipo estrutural. */
export function defaultEdgeName(ws: Workspace, a: NodeKey, b: NodeKey): string {
  if (keyKind(b) === "hotspot") return "levanta dúvida";
  if (keyKind(a) === "hotspot") return "questiona";
  const verdict = edgeVerdict(ws, a, b);
  if (verdict.applies && verdict.ok) return verdict.label;
  return DEFAULT_EDGE_NAMES[keyKind(a) + ":" + keyKind(b)] || "relaciona com";
}

/** Pares pai→filho da hierarquia narrativa. */
export const CONTAINMENT: [NodeKind, NodeKind][] = [
  ["journey", "chapter"],
  ["chapter", "scene"],
  ["scene", "event"],
];

export function isContainment(a: NodeKind, b: NodeKind): boolean {
  return CONTAINMENT.some(([p, c]) => p === a && c === b);
}

/** Deriva sceneMappings/eventMappings a partir das setas (papel do domínio via `role`). */
export function syncMaps(ws: Workspace): void {
  for (const e of ws.events) {
    const m = ws.eventMappings[e.id] || ({} as Workspace["eventMappings"][string]);
    const edges = ws.graph.edges.filter((x) => x.from === nodeKey("event", e.id));
    m.domainId = keyIdOr(edges.find((x) => keyKind(x.to) === "domain" && x.role === "owner")?.to);
    m.consumerDomainIds = edges.filter((x) => keyKind(x.to) === "domain" && x.role === "consumer").map((x) => keyId(x.to));
    m.systemId = keyIdOr(edges.find((x) => keyKind(x.to) === "system")?.to);
    m.screenIds = edges.filter((x) => keyKind(x.to) === "screen").map((x) => keyId(x.to));
    m.tableIds = edges.filter((x) => keyKind(x.to) === "table").map((x) => keyId(x.to));
    ws.eventMappings[e.id] = m;
  }
  for (const s of ws.scenes) {
    const m = ws.sceneMappings[s.id] || ({} as Workspace["sceneMappings"][string]);
    const ed = ws.graph.edges.filter((x) => x.from === nodeKey("scene", s.id));
    m.domainId = keyIdOr(ed.find((x) => keyKind(x.to) === "domain")?.to);
    m.systemIds = ed.filter((x) => keyKind(x.to) === "system").map((x) => keyId(x.to));
    m.screenIds = ed.filter((x) => keyKind(x.to) === "screen").map((x) => keyId(x.to));
    m.tableIds = ed.filter((x) => keyKind(x.to) === "table").map((x) => keyId(x.to));
    ws.sceneMappings[s.id] = m;
  }
}

const keyIdOr = (k: NodeKey | undefined): string => (k ? keyId(k) : "");

function oFill(o: Record<string, unknown>, k: string, v: unknown): void {
  if (o[k] === undefined) o[k] = v;
}

const defaultJourney = (): Journey => ({
  id: "jornada-exemplo",
  name: "Jornada de exemplo",
  description: "Da identificação ao retorno: consulta, exames e continuidade do cuidado.",
  status: "Em descoberta",
  semanticType: "Processo",
});

/** Converte o formato de oficina (pep-discovery-atlas-v1) em grafo com setas sugeridas. */
export function graphInit(data: any): Workspace {
  const result = deep(data);
  result.schema = "pep-atlas-studio-v3";
  if (!Array.isArray(result.journeys) || !result.journeys.length) result.journeys = [defaultJourney()];
  result.graph = { positions: {}, edges: [] };
  const g = result.graph;
  const present = (k: NodeKey) => (result[ARR[keyKind(k)]] as AnyEntity[] | undefined)?.some((x) => x.id === keyId(k));
  const sig = new Set<string>();
  const add = (a: NodeKey, b: NodeKey, l: string, sta = "Hipótese", source = "Oficina / sugestão") => {
    if (!present(a) || !present(b) || a === b) return;
    const s = a + "|" + b + "|" + l;
    if (sig.has(s)) return;
    sig.add(s);
    g.edges.push({ id: "r" + newId(), from: a, to: b, label: l, status: sta, evidence: "", source });
  };
  for (const s of result.scenes || [])
    add(nodeKey("chapter", s.chapter), nodeKey("scene", s.id), "contém", "Registrado", "Estrutura da jornada");
  for (const e of result.events || [])
    add(nodeKey("scene", e.sceneId), nodeKey("event", e.id), "contém", "Registrado", "Evento da oficina");
  for (const s of result.scenes || []) {
    const m = result.sceneMappings?.[s.id] || {};
    const a = nodeKey("scene", s.id);
    if (m.domainId) add(a, nodeKey("domain", m.domainId), "envolve domínio");
    for (const x of m.systemIds || []) add(a, nodeKey("system", x), "envolve sistema");
    for (const x of m.screenIds || []) add(a, nodeKey("screen", x), "usa tela");
    for (const x of m.tableIds || []) add(a, nodeKey("table", x), "consulta tabela");
  }
  for (const e of result.events || []) {
    const m = result.eventMappings?.[e.id] || {};
    const a = nodeKey("event", e.id);
    if (m.domainId) add(a, nodeKey("domain", m.domainId), "domínio responsável?");
    if (m.systemId) add(a, nodeKey("system", m.systemId), "sistema produtor?");
    for (const x of m.consumerDomainIds || []) add(a, nodeKey("domain", x), "consumido por?");
    for (const x of m.screenIds || []) add(a, nodeKey("screen", x), "registrado na tela?");
    for (const x of m.tableIds || []) add(a, nodeKey("table", x), "persistido em?");
  }
  for (const s of result.systems || []) if (s.domainId) add(nodeKey("domain", s.domainId), nodeKey("system", s.id), "domínio do sistema?");
  for (const s of result.screens || []) if (s.systemId) add(nodeKey("system", s.systemId), nodeKey("screen", s.id), "expõe tela?");
  for (const t of result.tables || []) if (t.systemId) add(nodeKey("system", t.systemId), nodeKey("table", t.id), "armazena?");
  return result as Workspace;
}

/** Normaliza qualquer versão salva para o schema atual (idempotente). */
/** #10/#21 Notas livres e caderno: campos mínimos e tamanhos válidos. */
function upgradeNotes(ws: Workspace): void {
  for (const n of ws.canvasNotes) {
    n.text = typeof n.text === "string" ? n.text : "";
    n.format = n.format || "text";
    n.w = Number.isFinite(n.w) ? Math.max(180, n.w) : 320;
    n.h = Number.isFinite(n.h) ? Math.max(90, n.h) : 180;
    n.scope = typeof n.scope === "string" ? n.scope : "all";
  }
  ws.docs = Array.isArray(ws.docs) ? ws.docs : [];
  for (const d of ws.docs) {
    d.title = typeof d.title === "string" ? d.title : "";
    d.body = typeof d.body === "string" ? d.body : "";
    d.link = typeof d.link === "string" ? d.link : "";
  }
}

/** #11 Molduras: título, cor da paleta, tamanho mínimo e recorte válidos. */
function upgradeFrames(ws: Workspace): void {
  const colors = FRAME_PALETTE.map(([, hex]) => hex);
  for (const f of ws.frames) {
    f.title = typeof f.title === "string" ? f.title : "Moldura";
    f.color = colors.includes(f.color) ? f.color : colors[0];
    f.w = Number.isFinite(f.w) ? Math.max(FRAME_MIN.w, f.w) : 560;
    f.h = Number.isFinite(f.h) ? Math.max(FRAME_MIN.h, f.h) : 360;
    f.scope = typeof f.scope === "string" ? f.scope : "all";
  }
}

/** #15 Lado inválido ou "auto" vira ausente (automático). */
function upgradeEdgeSides(ws: Workspace): void {
  for (const e of ws.graph.edges) {
    if (e.fromSide !== undefined && !PORT_SIDES.includes(e.fromSide)) delete e.fromSide;
    if (e.toSide !== undefined && !PORT_SIDES.includes(e.toSide)) delete e.toSide;
  }
}

export function upgradeWorkspace(data: any): Workspace {
  data.schema = SCHEMA;
  // Sem o campo, o mapa é anterior às jornadas; uma lista vazia é escolha do usuário e fica vazia.
  data.journeys = Array.isArray(data.journeys) ? data.journeys : [defaultJourney()];
  const fallback = data.journeys[0]?.id || "";
  for (const c of data.chapters || []) {
    if (!data.journeys.some((j: AnyEntity) => j.id === c.journeyId)) c.journeyId = fallback;
  }
  // "Hotspot" deixou de ser tipo de caixa livre: hotspot é um nó próprio (tecla H).
  data.elementTypes = [...new Set([...SEMANTIC_BASE, ...(data.elementTypes || [])])].filter((t) => t !== "Hotspot");
  data.natureOptions = Array.isArray(data.natureOptions) ? data.natureOptions : NATURE_BASE.map((x) => ({ id: x[0], label: x[1] }));
  data.destinationOptions = Array.isArray(data.destinationOptions)
    ? data.destinationOptions
    : DEST_BASE.map((x) => ({ id: x[0], label: x[1] }));
  for (const t of TYPES) {
    if (!Array.isArray(data[ARR[t]])) data[ARR[t]] = [];
    const fallback = t === "hotspot" ? "Hotspot" : UNDEFINED_SEMANTIC;
    for (const o of data[ARR[t]]) if (!o.semanticType) o.semanticType = fallback;
  }
  for (const t of data.tables) oFill(t, "defaultAccess", "");
  data.sceneMappings = data.sceneMappings || {};
  data.eventMappings = data.eventMappings || {};
  data.graph = data.graph || { positions: {}, edges: [] };
  data.graph.edges = data.graph.edges || [];
  for (const e of data.graph.edges) {
    oFill(e, "color", "");
    oFill(e, "accessMode", "");
    // v1.6 · #5: papel do domínio deixa de depender do texto do rótulo.
    if (isEventDomain(e) && e.role === undefined) e.role = roleFromLabel(String(e.label ?? ""));
  }
  const hasContainment = (a: NodeKey, b: NodeKey) => data.graph.edges.some((e: Edge) => e.from === a && e.to === b && e.label === "contém");
  for (const c of data.chapters) {
    if (!c.journeyId) continue;
    const a = "journey:" + c.journeyId;
    const b = "chapter:" + c.id;
    if (!hasContainment(a, b))
      data.graph.edges.push({
        id: "r" + newId(),
        from: a,
        to: b,
        label: "contém",
        status: "Registrado",
        source: "Organização de jornadas",
        evidence: "",
        color: "",
        accessMode: "",
      });
  }
  data.graph.layouts = data.graph.layouts || {};
  promoteHotspotBoxes(data as Workspace);
  upgradeLanes(data as Workspace);
  upgradeEmotion(data as Workspace);
  upgradeNotes(data as Workspace);
  upgradeFrames(data as Workspace);
  upgradeEdgeSides(data as Workspace);
  linkLegacyHotspots(data as Workspace);
  data.view = data.view || {};
  return data as Workspace;
}

/**
 * Caixa livre com tipo "Hotspot" vira hotspot de verdade (mesmas setas e posições).
 * Idempotente: depois da conversão não sobra caixa desse tipo.
 */
function promoteHotspotBoxes(ws: Workspace): void {
  const boxes = ws.semanticNodes.filter((n) => n.semanticType === "Hotspot");
  if (!boxes.length) return;
  for (const b of boxes) {
    const id = newEntityId(ws, "hotspot");
    ws.decisions.push({
      id,
      semanticType: "Hotspot",
      title: b.name,
      description: b.description || "",
      priority: "Média",
      status: "Aberta",
      owner: "",
      resolution: b.notes || "",
      origin: b.origin,
    });
    const oldKey = nodeKey("semantic", b.id);
    const newKey = nodeKey("hotspot", id);
    for (const e of ws.graph.edges) {
      if (e.from === oldKey) e.from = newKey;
      if (e.to === oldKey) e.to = newKey;
    }
    for (const layout of Object.values(ws.graph.layouts)) {
      if (layout[oldKey]) {
        layout[newKey] = layout[oldKey];
        delete layout[oldKey];
      }
    }
  }
  ws.semanticNodes = ws.semanticNodes.filter((n) => n.semanticType !== "Hotspot");
}

/**
 * v1.5 → v1.6: hotspot ligado a uma cena (`sceneId`) passa a ter uma seta
 * "cena → hotspot". Roda uma única vez por workspace (para respeitar setas
 * que o usuário apagar depois).
 */
function linkLegacyHotspots(ws: Workspace): void {
  if (ws.graph.hotspotsLinked) return;
  for (const d of ws.decisions) {
    const hk = nodeKey("hotspot", d.id);
    const sk = nodeKey("scene", d.sceneId || "");
    if (!d.sceneId || !ws.scenes.some((s) => s.id === d.sceneId)) continue;
    if (ws.graph.edges.some((e) => e.from === hk || e.to === hk)) continue;
    ws.graph.edges.push({
      id: "r" + newId(),
      from: sk,
      to: hk,
      label: "levanta dúvida",
      status: "Registrado",
      source: "Hotspot da oficina (v1.5)",
      evidence: "",
      color: "",
      accessMode: "",
    });
  }
  ws.graph.hotspotsLinked = true;
}

/** Quantidade de filhos diretos na hierarquia narrativa. */
/** Filhos estruturais: capítulos da jornada, cenas do capítulo, eventos da cena. */
export function childKeys(ws: Workspace, kind: NodeKind, id: string): NodeKey[] {
  if (kind === "journey") return ws.chapters.filter((c) => c.journeyId === id).map((c) => nodeKey("chapter", c.id));
  if (kind === "chapter") return ws.scenes.filter((s) => s.chapter === id).map((s) => nodeKey("scene", s.id));
  if (kind === "scene") return ws.events.filter((e) => e.sceneId === id).map((e) => nodeKey("event", e.id));
  return [];
}

export function childCount(ws: Workspace, kind: NodeKind, id: string): number {
  return childKeys(ws, kind, id).length;
}
