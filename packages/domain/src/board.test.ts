import { describe, expect, it } from "vitest";
import { BOARD_SCHEMA, createBoard, parseBoard } from "./board.ts";

const validBoard = () => ({ schema: BOARD_SCHEMA, id: "b-1", title: "Faturamento", stickies: [] });

describe("createBoard", () => {
  it("creates an empty telos/v1 board with the given title", () => {
    const board = createBoard("Faturamento");
    expect(board).toEqual({ schema: "telos/v1", id: expect.any(String), title: "Faturamento", stickies: [] });
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createBoard("Faturamento").id));
    expect(ids.size).toBe(50);
  });
});

describe("parseBoard", () => {
  it("accepts a valid board", () => {
    expect(parseBoard(validBoard())).toEqual({ ok: true, board: validBoard() });
  });

  it("round-trips through JSON", () => {
    const board = createBoard("Estoque");
    expect(parseBoard(JSON.parse(JSON.stringify(board)))).toEqual({ ok: true, board });
  });

  it("drops unknown fields", () => {
    const result = parseBoard({ ...validBoard(), view: { camera: 1 } });
    expect(result.ok && Object.keys(result.board)).toEqual(["schema", "id", "title", "stickies"]);
  });

  it.each([null, "board", 42, []])("rejects a non-object input (%j)", (input) => {
    expect(parseBoard(input)).toEqual({ ok: false, issues: [{ path: "", code: "invalid_structure" }] });
  });

  it("rejects an unknown schema", () => {
    expect(parseBoard({ ...validBoard(), schema: "pep-atlas-studio-v4" })).toEqual({
      ok: false,
      issues: [{ path: "schema", code: "unknown_schema" }],
    });
  });

  it("rejects a missing or empty id", () => {
    expect(parseBoard({ ...validBoard(), id: "" })).toEqual({ ok: false, issues: [{ path: "id", code: "empty" }] });
    expect(parseBoard({ ...validBoard(), id: 7 })).toEqual({ ok: false, issues: [{ path: "id", code: "not_string" }] });
  });

  it("rejects a title that is not a string", () => {
    expect(parseBoard({ ...validBoard(), title: { html: "<img>" } })).toEqual({
      ok: false,
      issues: [{ path: "title", code: "not_string" }],
    });
  });

  it("rejects stickies that is not an array", () => {
    expect(parseBoard({ ...validBoard(), stickies: {} })).toEqual({
      ok: false,
      issues: [{ path: "stickies", code: "not_array" }],
    });
  });

  it("reports every issue at once", () => {
    const result = parseBoard({ schema: "x", id: 1, title: 2, stickies: null });
    expect(result.ok ? [] : result.issues.map((issue) => issue.path)).toEqual(["schema", "id", "title", "stickies"]);
  });
});
