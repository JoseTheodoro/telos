export const BOARD_SCHEMA = "telos/v1";

export interface Board {
  schema: typeof BOARD_SCHEMA;
  id: string;
  title: string;
  stickies: unknown[];
}

export interface BoardIssue {
  path: string;
  code: "invalid_structure" | "unknown_schema" | "not_string" | "empty" | "not_array";
}

export type BoardParseResult = { ok: true; board: Board } | { ok: false; issues: BoardIssue[] };

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => typeof value === "object" && value !== null && !Array.isArray(value);

export function createBoard(title: string): Board {
  return { schema: BOARD_SCHEMA, id: crypto.randomUUID(), title, stickies: [] };
}

function boardIssues({ schema, id, title, stickies }: JsonRecord): BoardIssue[] {
  const issues: BoardIssue[] = [];
  if (schema !== BOARD_SCHEMA) issues.push({ path: "schema", code: "unknown_schema" });
  if (typeof id !== "string") issues.push({ path: "id", code: "not_string" });
  else if (!id) issues.push({ path: "id", code: "empty" });
  if (typeof title !== "string") issues.push({ path: "title", code: "not_string" });
  if (!Array.isArray(stickies)) issues.push({ path: "stickies", code: "not_array" });
  return issues;
}

export function parseBoard(input: unknown): BoardParseResult {
  if (!isRecord(input)) return { ok: false, issues: [{ path: "", code: "invalid_structure" }] };
  const issues = boardIssues(input);
  if (issues.length) return { ok: false, issues };
  const { id, title, stickies } = input as Omit<Board, "schema">;
  return { ok: true, board: { schema: BOARD_SCHEMA, id, title, stickies: [...stickies] } };
}
