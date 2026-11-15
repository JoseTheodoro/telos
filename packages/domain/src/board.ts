import type { Point } from "./types.ts";

export const BOARD_SCHEMA = "telos/v1";
export const STICKY_KINDS = ["domainEvent", "hotspot", "actor", "externalSystem", "aggregate"] as const;
export const STICKY_SIZE = { w: 200, h: 120 } as const;

export type StickyKind = (typeof STICKY_KINDS)[number];
export const DEFAULT_STICKY_KIND: StickyKind = "domainEvent";

export interface Sticky {
  id: string;
  kind: StickyKind;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Board {
  schema: typeof BOARD_SCHEMA;
  id: string;
  title: string;
  stickies: Sticky[];
}

export interface BoardIssue {
  path: string;
  code:
    | "invalid_structure"
    | "unknown_schema"
    | "unknown_kind"
    | "not_string"
    | "not_number"
    | "not_finite"
    | "empty"
    | "not_array"
    | "duplicate_id";
}

export type BoardParseResult = { ok: true; board: Board } | { ok: false; issues: BoardIssue[] };

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);

const isStickyKind = (value: unknown): value is StickyKind => STICKY_KINDS.some((kind) => kind === value);

export function createBoard(title: string): Board {
  return { schema: BOARD_SCHEMA, id: crypto.randomUUID(), title, stickies: [] };
}

export function createSticky(kind: StickyKind, at: Point): Sticky {
  return { id: crypto.randomUUID(), kind, text: "", x: at.x, y: at.y, w: STICKY_SIZE.w, h: STICKY_SIZE.h };
}

const pathOf = (parent: string, key: string | number): string => (parent ? `${parent}.${key}` : String(key));

type ReportIssue = (path: string, code: BoardIssue["code"]) => void;

function readString(record: JsonRecord, key: string, parent: string, report: ReportIssue): string {
  const value = record[key];
  if (typeof value === "string") return value;
  report(pathOf(parent, key), "not_string");
  return "";
}

function readId(record: JsonRecord, parent: string, report: ReportIssue): string {
  const id = record.id;
  if (typeof id !== "string") report(pathOf(parent, "id"), "not_string");
  else if (!id) report(pathOf(parent, "id"), "empty");
  return typeof id === "string" ? id : "";
}

function readFinite(record: JsonRecord, key: string, parent: string, report: ReportIssue): number {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  report(pathOf(parent, key), typeof value === "number" ? "not_finite" : "not_number");
  return 0;
}

function readKind(record: JsonRecord, parent: string, report: ReportIssue): StickyKind {
  if (isStickyKind(record.kind)) return record.kind;
  report(pathOf(parent, "kind"), "unknown_kind");
  return STICKY_KINDS[0];
}

function readSticky(value: unknown, path: string, report: ReportIssue): Sticky | null {
  if (!isRecord(value)) {
    report(path, "invalid_structure");
    return null;
  }
  return {
    id: readId(value, path, report),
    kind: readKind(value, path, report),
    text: readString(value, "text", path, report),
    x: readFinite(value, "x", path, report),
    y: readFinite(value, "y", path, report),
    w: readFinite(value, "w", path, report),
    h: readFinite(value, "h", path, report),
  };
}

function readStickies(record: JsonRecord, report: ReportIssue): Sticky[] {
  const value = record.stickies;
  if (!Array.isArray(value)) {
    report("stickies", "not_array");
    return [];
  }
  const seen = new Set<string>();
  return value.flatMap((item, index) => {
    const path = pathOf("stickies", index);
    const sticky = readSticky(item, path, report);
    if (!sticky) return [];
    if (sticky.id && seen.has(sticky.id)) report(pathOf(path, "id"), "duplicate_id");
    seen.add(sticky.id);
    return [sticky];
  });
}

export function parseBoard(input: unknown): BoardParseResult {
  if (!isRecord(input)) return { ok: false, issues: [{ path: "", code: "invalid_structure" }] };
  const issues: BoardIssue[] = [];
  const report: ReportIssue = (path, code) => issues.push({ path, code });
  if (input.schema !== BOARD_SCHEMA) report("schema", "unknown_schema");
  const id = readId(input, "", report);
  const title = readString(input, "title", "", report);
  const stickies = readStickies(input, report);
  if (issues.length) return { ok: false, issues };
  return { ok: true, board: { schema: BOARD_SCHEMA, id, title, stickies } };
}
