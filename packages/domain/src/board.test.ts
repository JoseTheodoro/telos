import { describe, expect, it } from "vitest";
import { BOARD_SCHEMA, STICKY_SIZE, createBoard, createSticky, parseBoard } from "./board.ts";
import { stickyStyle } from "./sticky-style.ts";

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

const validSticky = () => ({ id: "s-1", kind: "domainEvent", text: "Pedido faturado", x: 120, y: 80, w: 200, h: 144 });
const boardWith = (...stickies: unknown[]) => ({ ...validBoard(), stickies });

describe("createSticky", () => {
  it("creates an empty sticky of the given kind at the point, with the default size", () => {
    expect(createSticky("domainEvent", { x: 40, y: 60 })).toEqual({
      id: expect.any(String),
      kind: "domainEvent",
      text: "",
      x: 40,
      y: 60,
      w: STICKY_SIZE.w,
      h: STICKY_SIZE.h,
    });
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createSticky("domainEvent", { x: 0, y: 0 }).id));
    expect(ids.size).toBe(50);
  });
});

describe("parseBoard with stickies", () => {
  it("accepts valid stickies", () => {
    expect(parseBoard(boardWith(validSticky()))).toEqual({ ok: true, board: boardWith(validSticky()) });
  });

  it("round-trips a board with stickies through JSON", () => {
    const board = { ...createBoard("Faturamento"), stickies: [{ ...createSticky("domainEvent", { x: 10, y: 20 }), text: "Nota emitida" }] };
    expect(parseBoard(JSON.parse(JSON.stringify(board)))).toEqual({ ok: true, board });
  });

  it("drops unknown sticky fields", () => {
    const result = parseBoard(boardWith({ ...validSticky(), html: "<b>x</b>" }));
    expect(result.ok && Object.keys(result.board.stickies[0] ?? {})).toEqual(["id", "kind", "text", "x", "y", "w", "h"]);
  });

  it("rejects a sticky that is not an object", () => {
    expect(parseBoard(boardWith(validSticky(), "sticky"))).toEqual({
      ok: false,
      issues: [{ path: "stickies.1", code: "invalid_structure" }],
    });
  });

  it("rejects an unknown kind", () => {
    expect(parseBoard(boardWith({ ...validSticky(), kind: "command" }))).toEqual({
      ok: false,
      issues: [{ path: "stickies.0.kind", code: "unknown_kind" }],
    });
  });

  it.each(["x", "y", "w", "h"])("rejects a non-numeric %s", (field) => {
    expect(parseBoard(boardWith({ ...validSticky(), [field]: "10" }))).toEqual({
      ok: false,
      issues: [{ path: `stickies.0.${field}`, code: "not_number" }],
    });
  });

  it("rejects non-finite coordinates", () => {
    const result = parseBoard(boardWith({ ...validSticky(), x: Infinity, h: NaN }));
    expect(result).toEqual({
      ok: false,
      issues: [
        { path: "stickies.0.x", code: "not_finite" },
        { path: "stickies.0.h", code: "not_finite" },
      ],
    });
  });

  it("rejects text that is not a string", () => {
    expect(parseBoard(boardWith({ ...validSticky(), text: { html: "<img>" } }))).toEqual({
      ok: false,
      issues: [{ path: "stickies.0.text", code: "not_string" }],
    });
  });

  it("rejects a markup payload smuggled into a coordinate", () => {
    const payload = '1px"><img src=x onerror="window.__xss=(window.__xss||0)+1">';
    expect(parseBoard(boardWith({ ...validSticky(), x: payload }))).toEqual({
      ok: false,
      issues: [{ path: "stickies.0.x", code: "not_number" }],
    });
  });

  it("keeps markup in text as plain text", () => {
    const text = '<img src=x onerror="alert(1)">';
    const result = parseBoard(boardWith({ ...validSticky(), text }));
    expect(result.ok && result.board.stickies[0]?.text).toBe(text);
  });
});

describe("stickyStyle", () => {
  it("gives the Domain Event its canonical orange", () => {
    expect(stickyStyle("domainEvent")).toEqual({ label: "Domain Event", bg: "#ffe3c4", accent: "#9a4d00", outline: "#f5b97a" });
  });
});
