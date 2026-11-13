import { describe, expect, it } from "vitest";
import workshop from "../../tests/e2e/fixtures/oficina-sintetica.json";
import fixtureWithHotspotBox from "../../tests/e2e/fixtures/with-hotspot-box.json";
import { describeIssues, parseWorkspace } from "./validate";

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

    for (const input of [validDocument(), { ...validDocument(), schema: "pep-atlas-studio-v3" }, v3WithoutGraph, workshop, fixtureWithHotspotBox]) {
      const workspace = workspaceOf(input);
      expect(workspace.schema).toBe("pep-atlas-studio-v4");
      expect(Array.isArray(workspace.graph.edges)).toBe(true);
    }
    expect(workspaceOf(workshop).graph.edges.length).toBeGreaterThan(0);
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

  it("drops positions saved as null by older versions", () => {
    const input = validDocument({}, { layouts: { "lanes|chapter:c1": { "scene:a": { x: null, y: 450 }, "scene:b": { x: 10, y: 20 } } } });

    const workspace = workspaceOf(input);

    expect(workspace.graph.layouts["lanes|chapter:c1"]).toEqual({ "scene:b": { x: 10, y: 20 } });
  });

  it("rejects malformed containers instead of throwing", () => {
    const cases: [Record<string, unknown>, string][] = [
      [validDocument({ chapters: {} }), "chapters"],
      [validDocument({}, { edges: [null] }), "graph.edges.0"],
      [validDocument({}, { edges: {} }), "graph.edges"],
      [validDocument({ docs: [null] }), "docs.0"],
      [validDocument({ elementTypes: 5 }), "elementTypes"],
      [validDocument({}, { layouts: [] }), "graph.layouts"],
      [validDocument({}, { layouts: { all: "abc" } }), "graph.layouts.all"],
      [validDocument({}, { positions: [] }), "graph.positions"],
      [validDocument({ graph: "abc" }), "graph"],
      [validDocument({ lanes: [null] }), "lanes.0"],
      [validDocument({ natureOptions: "x" }), "natureOptions"],
      [validDocument({ scenes: [{ id: "a", title: "Cena", actor: 5 }] }), "documento"],
    ];

    for (const [input, path] of cases) {
      expect(() => parseWorkspace(input), path).not.toThrow();
      expect(issuesOf(input), path).toContainEqual({ path, code: "invalid_structure" });
    }
    expect(issuesOf(validDocument({}, { edges: [{ id: "r1", to: "scene:a" }] }))).toEqual([{ path: "graph.edges.0.from", code: "not_string" }]);
  });

  it("drops note and frame sizes saved as null", () => {
    const input = validDocument({
      canvasNotes: [{ id: "n1", text: "", w: null, h: 200, scope: "all" }],
      frames: [{ id: "f1", title: "Moldura", w: 600, h: null, scope: "all" }],
    });

    const workspace = workspaceOf(input);

    expect([workspace.canvasNotes[0].w, workspace.canvasNotes[0].h]).toEqual([320, 200]);
    expect([workspace.frames[0].w, workspace.frames[0].h]).toEqual([600, 360]);
  });

  it("drops view options outside the known values", () => {
    const injected = validDocument({
      view: { docsMode: 'split"><img src=x onerror=alert(1)>', area: "x", layoutMode: "grid", sidebarTab: "z", camera: { x: "1", y: 0, z: 1 }, docId: "d1" },
    });
    const knownView = { docsMode: "edit", area: "docs", layoutMode: "timeline", sidebarTab: "inventory", camera: { x: 10, y: -5, z: 0.5 } };

    expect(workspaceOf(injected).view).toEqual({ docId: "d1" });
    expect(workspaceOf(validDocument({ view: knownView })).view).toEqual(knownView);
  });
});

describe("describeIssues", () => {
  it("describes the first three issues without values", () => {
    const issues = [
      { path: "graph.layouts.all.scene:a.x", code: "not_number" },
      { path: "graph.layouts.all.scene:a.y", code: "not_finite" },
      { path: "scenes.0.id", code: "not_string" },
      { path: "frames.0.w", code: "not_number" },
    ] as const;

    expect(describeIssues([...issues])).toBe(
      "graph.layouts.all.scene:a.x (não é número), graph.layouts.all.scene:a.y (número inválido), scenes.0.id (não é texto) e mais 1",
    );
    expect(describeIssues([{ path: "schema", code: "unknown_schema" }])).toBe("schema (formato desconhecido)");
    expect(describeIssues([{ path: "chapters", code: "invalid_structure" }])).toBe("chapters (estrutura inválida)");
  });
});
