import { describe, expect, it } from "vitest";
import seed from "../data/seed.json";
import fixtureWithHotspotBox from "../../tests/e2e/fixtures/with-hotspot-box.json";
import { parseWorkspace } from "./validate";

const validDocument = (overrides: Record<string, unknown> = {}, graph: Record<string, unknown> = {}) => ({
  schema: "pep-atlas-studio-v4",
  journeys: [{ id: "j1", name: "Jornada", semanticType: "Processo" }],
  scenes: [{ id: "a", title: "Cena", chapter: "", time: "", semanticType: "Cena" }],
  graph: { positions: {}, edges: [], layouts: {}, ...graph },
  ...overrides,
});

const issuesOf = (input: unknown) => {
  const result = parseWorkspace(input);
  if (result.ok) throw new Error("esperava documento rejeitado");
  return result.issues;
};

const workspaceOf = (input: unknown) => {
  const result = parseWorkspace(input);
  if (!result.ok) throw new Error("esperava documento aceito: " + JSON.stringify(result.issues));
  return result.workspace;
};

describe("parseWorkspace", () => {
  it("rejects non-numeric x in graph.layouts", () => {
    const input = validDocument({}, { layouts: { all: { "scene:a": { x: "1px;background:url(javascript:alert(1))", y: 10 } } } });

    expect(issuesOf(input)[0]).toEqual({ path: "graph.layouts.all.scene:a.x", code: "not_number" });
  });

  it("rejects Infinity and NaN coordinates", () => {
    const input = validDocument({}, { positions: { "event:b": { x: 1, y: Infinity } }, layouts: { all: { "scene:a": { x: Number.NaN, y: 3 } } } });

    expect(issuesOf(input)).toEqual([
      { path: "graph.positions.event:b.y", code: "not_finite" },
      { path: "graph.layouts.all.scene:a.x", code: "not_finite" },
    ]);
  });

  it("rejects w/h non-numeric on notes and frames", () => {
    const input = validDocument({
      canvasNotes: [{ id: "n1", text: "", format: "text", w: "320px", h: 180, scope: "all", semanticType: "Nota" }],
      frames: [{ id: "f1", title: "Área", color: "#dbeafe", w: 560, h: "1\"><img src=x onerror=alert(1)>", scope: "all", semanticType: "Moldura" }],
    });

    expect(issuesOf(input)).toEqual([
      { path: "canvasNotes.0.w", code: "not_number" },
      { path: "frames.0.h", code: "not_number" },
    ]);
  });

  it("rejects layout keys that are not node keys", () => {
    const input = validDocument({}, { layouts: { all: { "bogus:1": { x: 1, y: 1 }, semcolon: { x: 1, y: 1 } } } });

    expect(issuesOf(input)).toEqual([
      { path: "graph.layouts.all.bogus:1", code: "invalid_key" },
      { path: "graph.layouts.all.semcolon", code: "invalid_key" },
    ]);
  });

  it("rejects non-string entity ids", () => {
    const input = validDocument({ scenes: [{ id: { toString: "x" }, title: "Cena", chapter: "", time: "", semanticType: "Cena" }, null] });

    expect(issuesOf(input)).toEqual([
      { path: "scenes.0.id", code: "not_string" },
      { path: "scenes.1.id", code: "not_string" },
    ]);
  });

  it("normalizes invalid edge color to default", () => {
    const edge = (id: string, color: string) => ({ id, from: "scene:a", to: "journey:j1", label: "", status: "Hipótese", source: "", evidence: "", color, accessMode: "" });
    const input = validDocument({}, { edges: [edge("r1", "red;}</style><script>alert(1)</script>"), edge("r2", "#AABBCC")] });

    const workspace = workspaceOf(input);

    expect(workspace.graph.edges.map((e) => e.color)).toEqual(["", "#AABBCC"]);
  });

  it("rejects unknown schema", () => {
    for (const input of [{ schema: "outro-app" }, {}, null, "pep-atlas-studio-v4", [validDocument()], { ...validDocument(), schema: ["pep-atlas-studio-v4"] }]) {
      expect(issuesOf(input)).toEqual([{ path: "schema", code: "unknown_schema" }]);
    }
  });

  it("accepts every ACCEPTED_SCHEMAS input", () => {
    const v3WithoutGraph = {
      schema: "pep-atlas-studio-v3",
      journeys: [{ id: "j1", name: "Jornada", semanticType: "Processo" }],
      chapters: [{ id: "c1", label: "Capítulo", title: "Capítulo", journeyId: "j1", date: "", semanticType: "Etapa" }],
      scenes: [{ id: "s1", title: "Cena", chapter: "c1", time: "", semanticType: "Cena" }],
    };

    for (const input of [validDocument(), { ...validDocument(), schema: "pep-atlas-studio-v3" }, v3WithoutGraph, seed, fixtureWithHotspotBox]) {
      const workspace = workspaceOf(input);
      expect(workspace.schema).toBe("pep-atlas-studio-v4");
      expect(Array.isArray(workspace.graph.edges)).toBe(true);
    }
    expect(workspaceOf(seed).graph.edges.length).toBeGreaterThan(0);
    expect(workspaceOf(v3WithoutGraph).graph.edges).toContainEqual(expect.objectContaining({ from: "chapter:c1", to: "scene:s1", label: "contém" }));
  });

  it("round-trips unknown fields", () => {
    const input = validDocument(
      { customTopLevel: { owner: "produto" }, scenes: [{ id: "a", title: "Cena", chapter: "", time: "", semanticType: "Cena", customSceneField: [1, 2] }] },
      { edges: [{ id: "r1", from: "scene:a", to: "journey:j1", label: "", status: "", source: "", evidence: "", color: "", accessMode: "", customEdgeField: true }], customGraphField: "g" },
    );
    const original = structuredClone(input);

    const roundTripped = JSON.parse(JSON.stringify(workspaceOf(input)));

    expect(roundTripped.customTopLevel).toEqual({ owner: "produto" });
    expect(roundTripped.scenes[0].customSceneField).toEqual([1, 2]);
    expect(roundTripped.graph.edges[0].customEdgeField).toBe(true);
    expect(roundTripped.graph.customGraphField).toBe("g");
    expect(input).toEqual(original);
  });
});
