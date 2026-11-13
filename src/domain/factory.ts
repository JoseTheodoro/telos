// Fábrica de entidades: campos padrão de cada tipo ao criar um elemento.
import { newId } from "./keys";
import type { AnyEntity, NodeKind, Workspace } from "./types";

/** Campo que aponta para o pai na hierarquia narrativa. */
export const PARENT_FIELD: Partial<Record<NodeKind, "journeyId" | "chapter" | "sceneId">> = {
  chapter: "journeyId",
  scene: "chapter",
  event: "sceneId",
};

/** Nome provisório usado na criação rápida (o editor inline abre com ele selecionado). */
export const DEFAULT_NAME: Record<NodeKind, string> = {
  journey: "Nova jornada",
  chapter: "Novo capítulo",
  scene: "Nova cena",
  event: "Novo evento",
  domain: "Novo domínio",
  system: "Novo sistema",
  screen: "Nova tela",
  table: "Nova tabela",
  semantic: "Nova caixa",
  hotspot: "Nova dúvida",
  note: "",
};

/** Id de um elemento novo; hotspots ganham código legível sequencial (H-01, H-02…). */
export function newEntityId(ws: Workspace, kind: NodeKind): string {
  if (kind !== "hotspot") return "u" + newId();
  const used = new Set(ws.decisions.map((d) => d.id));
  let n = ws.decisions.length + 1;
  while (used.has("H-" + String(n).padStart(2, "0"))) n++;
  return "H-" + String(n).padStart(2, "0");
}

/** Monta a entidade nova com os campos padrão do tipo. */
export function buildEntity(t: NodeKind, id: string, name: string, semantic: string, val: (k: string) => string): AnyEntity {
  const base = { id, semanticType: semantic };
  const inventory = { origin: "Criado no Atlas Studio", status: "A validar", notes: "" };
  switch (t) {
    case "journey":
      return { ...base, name, description: "", status: "Em descoberta" };
    case "chapter":
      return { ...base, label: name, title: name, journeyId: val("journeyId"), date: "DATA A DEFINIR", deck: "", mood: "Descobrir" };
    case "scene":
      return {
        ...base,
        title: name,
        chapter: val("chapter"),
        time: "A definir",
        story: "",
        actor: "",
        questions: [],
        answers: [],
        discussed: false,
        lane: val("lane") || "outros",
      };
    case "event":
      return {
        ...base,
        name,
        sceneId: val("sceneId"),
        type: val("type") || "unknown",
        destination: val("destination") || "open",
        note: "",
        reviewStatus: "Em discussão",
        reviewOwner: "",
        pepReason: "",
        source: "Criado no Atlas Studio",
      };
    case "domain":
      return { ...base, name, description: "", ...inventory };
    case "system":
      return { ...base, name, kind: "Sistema a investigar", domainId: "", ...inventory };
    case "screen":
      return { ...base, name, route: "", systemId: "", ...inventory };
    case "table":
      return {
        ...base,
        name,
        physicalName: val("physical"),
        primaryKey: "",
        systemId: "",
        defaultAccess: val("defaultAccess") as "" | "READ" | "WRITE",
        ...inventory,
      };
    case "semantic":
      return { ...base, name, description: "", status: "Em descoberta", notes: "", origin: "Criado no Atlas Studio" };
    case "note":
      return { ...base, semanticType: "Nota", text: name, format: val("format") || "text", w: 320, h: 180, scope: val("scope") };
    case "hotspot":
      return {
        ...base,
        semanticType: semantic === "Não definido" ? "Hotspot" : semantic,
        title: name,
        description: "",
        priority: "Média",
        status: "Aberta",
        owner: "",
        resolution: "",
      };
  }
}

/** Registros auxiliares que eventos e cenas precisam desde o nascimento. */
export function initMappings(ws: Workspace, kind: NodeKind, id: string): void {
  if (kind === "event")
    ws.eventMappings[id] = {
      domainId: "",
      systemId: "",
      screenIds: [],
      tableIds: [],
      consumerDomainIds: [],
      relationshipStatus: "Hipótese",
      notes: "",
      operation: "A identificar",
    };
  if (kind === "scene")
    ws.sceneMappings[id] = { domainId: "", systemIds: [], screenIds: [], tableIds: [], status: "Hipótese", notes: "" };
}
