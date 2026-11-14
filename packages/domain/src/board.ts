export const BOARD_SCHEMA = "telos/v1";
export const STICKY_KINDS = ["domainEvent"] as const;
export const STICKY_SIZE = { w: 200, h: 120 } as const;

export type StickyKind = (typeof STICKY_KINDS)[number];

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
  code: "invalid_structure" | "unknown_schema" | "unknown_kind" | "not_string" | "not_number" | "not_finite" | "empty" | "not_array";
}

export type BoardParseResult = { ok: true; board: Board } | { ok: false; issues: BoardIssue[] };

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);

const isStickyKind = (value: unknown): value is StickyKind => STICKY_KINDS.some((kind) => kind === value);

export function createBoard(title: string): Board {
  return { schema: BOARD_SCHEMA, id: crypto.randomUUID(), title, stickies: [] };
}

export function createSticky(kind: StickyKind, at: { x: number; y: number }): Sticky {
  return { id: crypto.randomUUID(), kind, text: "", x: at.x, y: at.y, w: STICKY_SIZE.w, h: STICKY_SIZE.h };
}

const pathOf = (parent: string, key: string | number): string => (parent ? `${parent}.${key}` : String(key));

class IssueCollector {
  readonly issues: BoardIssue[] = [];

  string(record: JsonRecord, key: string, parent = ""): string {
    const value = record[key];
    if (typeof value === "string") return value;
    this.issues.push({ path: pathOf(parent, key), code: "not_string" });
    return "";
  }

  id(record: JsonRecord, parent = ""): string {
    const value = this.string(record, "id", parent);
    if (typeof record.id === "string" && !value) this.issues.push({ path: pathOf(parent, "id"), code: "empty" });
    return value;
  }

  finite(record: JsonRecord, key: string, parent: string): number {
    const value = record[key];
    if (typeof value !== "number") this.issues.push({ path: pathOf(parent, key), code: "not_number" });
    else if (!Number.isFinite(value)) this.issues.push({ path: pathOf(parent, key), code: "not_finite" });
    else return value;
    return 0;
  }

  list(record: JsonRecord, key: string): unknown[] {
    const value = record[key];
    if (Array.isArray(value)) return value;
    this.issues.push({ path: key, code: "not_array" });
    return [];
  }

  kind(record: JsonRecord, parent: string): StickyKind {
    if (isStickyKind(record.kind)) return record.kind;
    this.issues.push({ path: pathOf(parent, "kind"), code: "unknown_kind" });
    return STICKY_KINDS[0];
  }

  sticky(value: unknown, path: string): Sticky {
    if (!isRecord(value)) {
      this.issues.push({ path, code: "invalid_structure" });
      return { id: "", kind: STICKY_KINDS[0], text: "", x: 0, y: 0, w: 0, h: 0 };
    }
    return {
      id: this.id(value, path),
      kind: this.kind(value, path),
      text: this.string(value, "text", path),
      x: this.finite(value, "x", path),
      y: this.finite(value, "y", path),
      w: this.finite(value, "w", path),
      h: this.finite(value, "h", path),
    };
  }
}

export function parseBoard(input: unknown): BoardParseResult {
  if (!isRecord(input)) return { ok: false, issues: [{ path: "", code: "invalid_structure" }] };
  const collect = new IssueCollector();
  if (input.schema !== BOARD_SCHEMA) collect.issues.push({ path: "schema", code: "unknown_schema" });
  const id = collect.id(input);
  const title = collect.string(input, "title");
  const stickies = collect.list(input, "stickies").map((item, index) => collect.sticky(item, pathOf("stickies", index)));
  if (collect.issues.length) return { ok: false, issues: collect.issues };
  return { ok: true, board: { schema: BOARD_SCHEMA, id, title, stickies } };
}
