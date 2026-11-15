import { describe, expect, it } from "vitest";
import { BOARD_SCHEMA, STICKY_KINDS, STICKY_SIZE, createBoard, createSticky, parseBoard } from "./board.ts";
import { STICKY_INK, stickyStyle } from "./sticky-style.ts";

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

  it("rejects non-finite coordinates and sizes", () => {
    const result = parseBoard(boardWith({ ...validSticky(), x: Infinity, y: -Infinity, w: NaN, h: NaN }));
    expect(result).toEqual({
      ok: false,
      issues: ["x", "y", "w", "h"].map((field) => ({ path: `stickies.0.${field}`, code: "not_finite" })),
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

  it("rejects a repeated sticky id", () => {
    expect(parseBoard(boardWith(validSticky(), { ...validSticky(), x: 400 }))).toEqual({
      ok: false,
      issues: [{ path: "stickies.1.id", code: "duplicate_id" }],
    });
  });

  it("reports every repetition of a sticky id", () => {
    const sticky = (id: string) => ({ ...validSticky(), id });
    const result = parseBoard(boardWith(sticky("a"), sticky("b"), sticky("a"), sticky("b"), sticky("a")));
    expect(result.ok ? [] : result.issues).toEqual(
      ["stickies.2.id", "stickies.3.id", "stickies.4.id"].map((path) => ({ path, code: "duplicate_id" })),
    );
  });

  it("accepts stickies with distinct ids", () => {
    const board = boardWith({ ...validSticky(), id: "a" }, { ...validSticky(), id: "b" });
    expect(parseBoard(board)).toEqual({ ok: true, board });
  });

  it("keeps markup in text as plain text", () => {
    const text = '<img src=x onerror="alert(1)">';
    const result = parseBoard(boardWith({ ...validSticky(), text }));
    expect(result.ok && result.board.stickies[0]?.text).toBe(text);
  });
});

const BIG_PICTURE_LABELS = {
  domainEvent: "Domain Event",
  hotspot: "Hotspot",
  actor: "Actor",
  externalSystem: "External System",
  aggregate: "Aggregate",
};

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe("Big Picture kinds", () => {
  it("lists the five kinds in keyboard order", () => {
    expect(STICKY_KINDS).toEqual(["domainEvent", "hotspot", "actor", "externalSystem", "aggregate"]);
  });

  it.each(STICKY_KINDS)("parseBoard accepts a %s sticky", (kind) => {
    expect(parseBoard(boardWith({ ...validSticky(), kind })).ok).toBe(true);
  });
});

describe("stickyStyle", () => {
  it("gives the Domain Event its canonical orange", () => {
    expect(stickyStyle("domainEvent")).toMatchObject({ label: "Domain Event", bg: "#ffe3c4", outline: "#f5b97a" });
  });

  it.each(STICKY_KINDS)("labels %s in English with a Portuguese hint", (kind) => {
    const style = stickyStyle(kind);
    expect(style.label).toBe(BIG_PICTURE_LABELS[kind]);
    expect(style.hint.length).toBeGreaterThan(0);
  });

  it("gives each kind its own background", () => {
    expect(new Set(STICKY_KINDS.map((kind) => stickyStyle(kind).bg)).size).toBe(STICKY_KINDS.length);
  });

  it.each(STICKY_KINDS)("keeps the text on %s at WCAG AA contrast", (kind) => {
    expect(contrastRatio(STICKY_INK, stickyStyle(kind).bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STICKY_KINDS)("keeps the %s accent at WCAG AA contrast on its background", (kind) => {
    const { accent, bg } = stickyStyle(kind);
    expect(contrastRatio(accent, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("measures contrast like WCAG (black on white is 21:1)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
  });
});
