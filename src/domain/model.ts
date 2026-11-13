// Operações puras sobre o Workspace (sem DOM).
import {
  ARR,
  DEST_BASE,
  NATURE_BASE,
  SCHEMA,
  SEMANTIC_BASE,
  TABLE_COLORS,
  TYPES,
  UNDEFINED_SEMANTIC,
} from "./constants";
import { keyId, keyKind, newId, nodeKey } from "./keys";
import type { AnyEntity, Edge, NodeKey, NodeKind, Table, Workspace } from "./types";

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

export function entityLabel(ws: Workspace, k: NodeKey): string {
  const o = getEntityByKey(ws, k);
  const t = keyKind(k);
  if (!o) return "(removido)";
  if (t === "chapter") return String(o.label ?? "");
  if (t === "scene") return String(o.title ?? "");
  return o.name || "(sem nome)";
}

export function semanticLabel(o: AnyEntity | undefined): string {
  return o?.semanticType && o.semanticType !== UNDEFINED_SEMANTIC ? o.semanticType : "";
}

export function validColor(c: string | undefined | null): string {
  return /^#[0-9a-fA-F]{6}$/.test(c || "") ? (c as string).toLowerCase() : "";
}

export function colorForEdge(e: Partial<Edge>): string {
  return (
    validColor(e.color) ||
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
  return {
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

export function defaultEdgeName(a: NodeKey, b: NodeKey): string {
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

/**
 * Deriva sceneMappings/eventMappings a partir das setas.
 * TODO(dívida #5/#12): eliminar heurística por texto do rótulo ("responsável"/"consumido").
 */
export function syncMaps(ws: Workspace): void {
  for (const e of ws.events) {
    const m = ws.eventMappings[e.id] || ({} as Workspace["eventMappings"][string]);
    const edges = ws.graph.edges.filter((x) => x.from === nodeKey("event", e.id));
    m.domainId = keyIdOr(edges.find((x) => keyKind(x.to) === "domain" && x.label.includes("responsável"))?.to);
    m.consumerDomainIds = edges
      .filter((x) => keyKind(x.to) === "domain" && x.label.includes("consumido"))
      .map((x) => keyId(x.to));
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

/** Converte o formato de oficina (pep-discovery-atlas-v1) em grafo com setas sugeridas. */
export function graphInit(data: any): Workspace {
  const result = deep(data);
  result.schema = "pep-atlas-studio-v3";
  result.graph = { positions: {}, edges: [] };
  const g = result.graph;
  const present = (k: NodeKey) =>
    (result[ARR[keyKind(k)]] as AnyEntity[] | undefined)?.some((x) => x.id === keyId(k));
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
  for (const s of result.systems || [])
    if (s.domainId) add(nodeKey("domain", s.domainId), nodeKey("system", s.id), "domínio do sistema?");
  for (const s of result.screens || [])
    if (s.systemId) add(nodeKey("system", s.systemId), nodeKey("screen", s.id), "expõe tela?");
  for (const t of result.tables || [])
    if (t.systemId) add(nodeKey("system", t.systemId), nodeKey("table", t.id), "armazena?");
  return result as Workspace;
}

/** Normaliza qualquer versão salva para o schema atual (idempotente). */
export function upgradeWorkspace(data: any): Workspace {
  data.schema = SCHEMA;
  data.journeys = Array.isArray(data.journeys) ? data.journeys : [];
  if (!data.journeys.length && !data.emptyWorkspace) {
    data.journeys.push({
      id: "jornada-exemplo",
      name: "Jornada de exemplo",
      description: "Da identificação ao retorno: consulta, exames e continuidade do cuidado.",
      status: "Em descoberta",
      semanticType: "Processo",
    });
  }
  const fallback = data.journeys[0]?.id || "";
  for (const c of data.chapters || []) {
    if (!data.journeys.some((j: AnyEntity) => j.id === c.journeyId)) c.journeyId = fallback;
  }
  data.elementTypes = [...new Set([...SEMANTIC_BASE, ...(data.elementTypes || [])])];
  data.natureOptions = Array.isArray(data.natureOptions)
    ? data.natureOptions
    : NATURE_BASE.map((x) => ({ id: x[0], label: x[1] }));
  data.destinationOptions = Array.isArray(data.destinationOptions)
    ? data.destinationOptions
    : DEST_BASE.map((x) => ({ id: x[0], label: x[1] }));
  for (const t of TYPES) {
    if (!Array.isArray(data[ARR[t]])) data[ARR[t]] = [];
    for (const o of data[ARR[t]]) if (!o.semanticType) o.semanticType = UNDEFINED_SEMANTIC;
  }
  for (const t of data.tables) oFill(t, "defaultAccess", "");
  data.decisions = Array.isArray(data.decisions) ? data.decisions : [];
  data.sceneMappings = data.sceneMappings || {};
  data.eventMappings = data.eventMappings || {};
  data.graph = data.graph || { positions: {}, edges: [] };
  data.graph.edges = data.graph.edges || [];
  for (const e of data.graph.edges) {
    oFill(e, "color", "");
    oFill(e, "accessMode", "");
  }
  const hasContainment = (a: NodeKey, b: NodeKey) =>
    data.graph.edges.some((e: Edge) => e.from === a && e.to === b && e.label === "contém");
  for (const c of data.chapters) {
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
  data.view = data.view || {};
  return data as Workspace;
}

/** Quantidade de filhos diretos na hierarquia narrativa. */
export function childCount(ws: Workspace, kind: NodeKind, id: string): number {
  if (kind === "journey") return ws.chapters.filter((c) => c.journeyId === id).length;
  if (kind === "chapter") return ws.scenes.filter((s) => s.chapter === id).length;
  if (kind === "scene") return ws.events.filter((e) => e.sceneId === id).length;
  return 0;
}
