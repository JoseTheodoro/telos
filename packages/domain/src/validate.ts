import { ACCEPTED_SCHEMAS, ARR, TYPES } from "./constants.ts";
import { deep, graphInit, upgradeWorkspace, validColor } from "./model.ts";
import type { ViewState, Workspace } from "./types.ts";

export interface ValidationIssue {
  path: string;
  code: "not_number" | "not_finite" | "not_string" | "unknown_schema" | "invalid_color" | "invalid_key" | "invalid_structure";
}

export type ParseResult = { ok: true; workspace: Workspace } | { ok: false; issues: ValidationIssue[] };

type JsonRecord = Record<string, unknown>;

const NODE_KEY = new RegExp(`^(${TYPES.join("|")}):`);
const SIZED_COLLECTIONS = ["canvasNotes", "frames"] as const;
const DIMENSIONS = ["w", "h"] as const;

const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);

const isAbsent = (value: unknown): boolean => value === undefined || value === null;

const structureIssue = (path: string): ValidationIssue => ({ path, code: "invalid_structure" });

const listAt = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function finiteNumberIssues(value: unknown, path: string): ValidationIssue[] {
  if (typeof value !== "number") return [{ path, code: "not_number" }];
  return Number.isFinite(value) ? [] : [{ path, code: "not_finite" }];
}

// Versões anteriores gravavam -Infinity, que o JSON salva como null: a posição é recalculada pelo layout automático.
const isUnsetPoint = (point: unknown): boolean => isRecord(point) && (point.x === null || point.y === null);

function positionIssues(positions: unknown, path: string): ValidationIssue[] {
  if (!isRecord(positions)) return [];
  return Object.entries(positions).flatMap(([nodeKey, point]): ValidationIssue[] => {
    const pointPath = `${path}.${nodeKey}`;
    if (!NODE_KEY.test(nodeKey)) return [{ path: pointPath, code: "invalid_key" }];
    if (isUnsetPoint(point)) return [];
    const coordinates = isRecord(point) ? point : {};
    return [...finiteNumberIssues(coordinates.x, `${pointPath}.x`), ...finiteNumberIssues(coordinates.y, `${pointPath}.y`)];
  });
}

function graphIssues(graph: unknown): ValidationIssue[] {
  if (!isRecord(graph)) return [];
  const layouts = isRecord(graph.layouts) ? graph.layouts : {};
  return [
    ...positionIssues(graph.positions, "graph.positions"),
    ...Object.entries(layouts).flatMap(([layoutKey, positions]) => positionIssues(positions, `graph.layouts.${layoutKey}`)),
  ];
}

function entityIdIssues(document: JsonRecord): ValidationIssue[] {
  return Object.values(ARR).flatMap((collection) =>
    listAt(document[collection]).flatMap((entity, index): ValidationIssue[] =>
      isRecord(entity) && typeof entity.id === "string" ? [] : [{ path: `${collection}.${index}.id`, code: "not_string" }],
    ),
  );
}

function sizeIssues(document: JsonRecord): ValidationIssue[] {
  return SIZED_COLLECTIONS.flatMap((collection) =>
    listAt(document[collection]).flatMap((entity, index) =>
      isRecord(entity)
        ? DIMENSIONS.flatMap((dimension) =>
            isAbsent(entity[dimension]) ? [] : finiteNumberIssues(entity[dimension], `${collection}.${index}.${dimension}`),
          )
        : [],
    ),
  );
}

const RECORD_LIST_FIELDS = ["docs", "lanes", "natureOptions", "destinationOptions"];
const LIST_FIELDS = [...Object.values(ARR), ...RECORD_LIST_FIELDS, "elementTypes"];

function listIssues(document: JsonRecord): ValidationIssue[] {
  const misshapenLists = LIST_FIELDS.filter((field) => !isAbsent(document[field]) && !Array.isArray(document[field]));
  const misshapenItems = RECORD_LIST_FIELDS.flatMap((field) =>
    listAt(document[field]).flatMap((item, index) => (isRecord(item) ? [] : [structureIssue(`${field}.${index}`)])),
  );
  return [...misshapenLists.map(structureIssue), ...misshapenItems];
}

function graphStructureIssues(graph: unknown): ValidationIssue[] {
  if (isAbsent(graph)) return [];
  if (!isRecord(graph)) return [structureIssue("graph")];
  const recordIssue = (value: unknown, path: string) => (isAbsent(value) || isRecord(value) ? [] : [structureIssue(path)]);
  const layouts = isRecord(graph.layouts) ? Object.entries(graph.layouts) : [];
  const edgesIssue = isAbsent(graph.edges) || Array.isArray(graph.edges) ? [] : [structureIssue("graph.edges")];
  return [
    ...recordIssue(graph.positions, "graph.positions"),
    ...recordIssue(graph.layouts, "graph.layouts"),
    ...layouts.flatMap(([layoutKey, positions]) => recordIssue(positions, `graph.layouts.${layoutKey}`)),
    ...edgesIssue,
    ...listAt(graph.edges).flatMap((edge, index) => (isRecord(edge) ? [] : [structureIssue(`graph.edges.${index}`)])),
  ];
}

function edgeEndIssues(graph: unknown): ValidationIssue[] {
  const edges = isRecord(graph) ? listAt(graph.edges) : [];
  return edges.flatMap((edge, index) =>
    (["from", "to"] as const).flatMap((end): ValidationIssue[] =>
      isRecord(edge) && typeof edge[end] !== "string" ? [{ path: `graph.edges.${index}.${end}`, code: "not_string" }] : [],
    ),
  );
}

function dropUnsetPoints(positions: unknown): void {
  if (!isRecord(positions)) return;
  for (const [nodeKey, point] of Object.entries(positions)) if (isUnsetPoint(point)) delete positions[nodeKey];
}

function dropUnsetPositions(document: JsonRecord): void {
  if (!isRecord(document.graph)) return;
  dropUnsetPoints(document.graph.positions);
  if (isRecord(document.graph.layouts)) Object.values(document.graph.layouts).forEach(dropUnsetPoints);
}

const VIEW_OPTIONS: Partial<Record<keyof ViewState, readonly string[]>> = {
  layoutMode: ["layers", "timeline"],
  area: ["canvas", "docs"],
  docsMode: ["edit", "split", "view"],
  sidebarTab: ["journey", "inventory", "decisions"],
};

const isCamera = (camera: unknown): boolean =>
  isRecord(camera) && [camera.x, camera.y, camera.z].every((value) => typeof value === "number" && Number.isFinite(value));

function normalizeView(view: ViewState): void {
  const fields = view as JsonRecord;
  for (const [field, options] of Object.entries(VIEW_OPTIONS)) {
    if (fields[field] !== undefined && !options.includes(fields[field] as string)) delete fields[field];
  }
  if (fields.camera !== undefined && !isCamera(fields.camera)) delete fields.camera;
}

function normalizeEdgeColors(workspace: Workspace): void {
  for (const edge of workspace.graph.edges) {
    if (!validColor(typeof edge.color === "string" ? edge.color : "")) edge.color = "";
  }
}

export function parseWorkspace(input: unknown): ParseResult {
  if (!isRecord(input) || typeof input.schema !== "string" || !ACCEPTED_SCHEMAS.includes(input.schema)) {
    return { ok: false, issues: [{ path: "schema", code: "unknown_schema" }] };
  }
  const structure = [...listIssues(input), ...graphStructureIssues(input.graph)];
  if (structure.length) return { ok: false, issues: structure };
  const issues = [...entityIdIssues(input), ...graphIssues(input.graph), ...edgeEndIssues(input.graph), ...sizeIssues(input)];
  if (issues.length) return { ok: false, issues };
  const document = deep(input);
  dropUnsetPositions(document);
  const needsGraph = document.schema === "pep-discovery-atlas-v1" || !isRecord(document.graph);
  let workspace: Workspace;
  try {
    workspace = upgradeWorkspace(needsGraph ? graphInit(document) : document);
  } catch {
    // A migração supõe a forma dos campos; um formato que a validação não prevê vira mapa inválido, não carga quebrada.
    return { ok: false, issues: [structureIssue("documento")] };
  }
  normalizeEdgeColors(workspace);
  normalizeView(workspace.view);
  return { ok: true, workspace };
}

const ISSUE_LABELS: Record<ValidationIssue["code"], string> = {
  not_number: "não é número",
  not_finite: "número inválido",
  not_string: "não é texto",
  unknown_schema: "formato desconhecido",
  invalid_color: "cor inválida",
  invalid_key: "chave inválida",
  invalid_structure: "estrutura inválida",
};

const DESCRIBED_ISSUES = 3;

export function describeIssues(issues: ValidationIssue[]): string {
  const described = issues
    .slice(0, DESCRIBED_ISSUES)
    .map(({ path, code }) => `${path} (${ISSUE_LABELS[code]})`)
    .join(", ");
  const remaining = issues.length - DESCRIBED_ISSUES;
  return remaining > 0 ? `${described} e mais ${remaining}` : described;
}
