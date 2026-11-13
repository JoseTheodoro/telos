import { describe, expect, it } from "vitest";
import seed from "../data/seed.json";
import { graphInit, syncMaps, upgradeWorkspace } from "./model";

const containmentEdges = (edges: { from: string; to: string; label: string }[], fromKind: string, toKind: string) =>
  edges.filter((edge) => edge.label === "contém" && edge.from.startsWith(fromKind + ":") && edge.to.startsWith(toKind + ":"));

describe("graphInit", () => {
  it("graphInit converts pep-discovery-atlas-v1 seed", () => {
    const seedCopy = structuredClone(seed);
    const workspace = graphInit(seedCopy);

    expect(seed.schema).toBe("pep-discovery-atlas-v1");
    expect(workspace.schema).toBe("pep-atlas-studio-v3");
    expect(containmentEdges(workspace.graph.edges, "chapter", "scene")).toHaveLength(28);
    expect(containmentEdges(workspace.graph.edges, "scene", "event")).toHaveLength(45);
    expect(workspace.graph.edges).toContainEqual(
      expect.objectContaining({ from: "chapter:consulta", to: "scene:preconsulta", label: "contém", status: "Registrado" }),
    );
    expect(seedCopy).toEqual(seed);
  });

  it("graphInit creates one default journey for legacy input without journeys", () => {
    for (const legacyInput of [structuredClone(seed), { ...structuredClone(seed), journeys: [] }]) {
      const workspace = graphInit(legacyInput);

      expect(workspace.journeys).toHaveLength(1);
      expect(workspace.journeys[0]).toMatchObject({ id: "jornada-exemplo", name: "Jornada de exemplo" });
    }
  });
});

describe("upgradeWorkspace", () => {
  it("upgradeWorkspace keeps journeys empty after user deleted all", () => {
    const workspace = upgradeWorkspace({
      schema: "pep-atlas-studio-v4",
      journeys: [],
      chapters: [{ id: "c1", label: "Capítulo", title: "Capítulo", journeyId: "j1", date: "", semanticType: "Etapa" }],
      graph: { positions: {}, edges: [], layouts: {} },
    });

    expect(workspace.journeys).toEqual([]);
    expect(workspace.chapters[0].journeyId).toBe("");
  });

  it("upgradeWorkspace creates the default journey for saves that predate journeys", () => {
    const workspace = upgradeWorkspace({
      schema: "pep-atlas-studio-v3",
      chapters: [{ id: "c1", label: "Capítulo", title: "Capítulo", date: "", semanticType: "Etapa" }],
      graph: { positions: {}, edges: [], layouts: {} },
    });

    expect(workspace.journeys.map(({ id, name }) => ({ id, name }))).toEqual([{ id: "jornada-exemplo", name: "Jornada de exemplo" }]);
    expect(workspace.chapters[0].journeyId).toBe("jornada-exemplo");
  });

  it("upgradeWorkspace keeps extra fields", () => {
    const workspace = upgradeWorkspace({
      schema: "pep-atlas-studio-v4",
      customTopLevel: { owner: "time de produto", tags: ["a", "b"] },
      journeys: [{ id: "j1", name: "Jornada", semanticType: "Processo", customJourneyField: 7 }],
      chapters: [{ id: "c1", label: "Capítulo", title: "Capítulo", journeyId: "j1", date: "", semanticType: "Etapa" }],
      scenes: [{ id: "s1", title: "Cena", chapter: "c1", time: "", semanticType: "Cena", customSceneField: "keep" }],
      graph: { positions: {}, edges: [], layouts: {} },
    });

    expect(workspace.customTopLevel).toEqual({ owner: "time de produto", tags: ["a", "b"] });
    expect(workspace.journeys[0].customJourneyField).toBe(7);
    expect(workspace.scenes[0].customSceneField).toBe("keep");
  });
});

describe("syncMaps", () => {
  it("syncMaps derives sceneMappings from edges", () => {
    const edge = (from: string, to: string) => ({ id: from + to, from, to, label: "", status: "Hipótese", source: "", evidence: "", color: "", accessMode: "" });
    const workspace = upgradeWorkspace({
      schema: "pep-atlas-studio-v4",
      journeys: [{ id: "j1", name: "Jornada", semanticType: "Processo" }],
      chapters: [{ id: "c1", label: "Capítulo", title: "Capítulo", journeyId: "j1", date: "", semanticType: "Etapa" }],
      scenes: [{ id: "s1", title: "Cena", chapter: "c1", time: "", semanticType: "Cena" }],
      domains: [{ id: "d1", name: "Domínio", semanticType: "Domínio" }],
      systems: [{ id: "y1", name: "Sistema", semanticType: "Sistema" }],
      screens: [
        { id: "t1", name: "Tela 1", semanticType: "Tela" },
        { id: "t2", name: "Tela 2", semanticType: "Tela" },
      ],
      graph: {
        positions: {},
        layouts: {},
        edges: [edge("scene:s1", "domain:d1"), edge("scene:s1", "system:y1"), edge("scene:s1", "screen:t1"), edge("scene:s1", "screen:t2")],
      },
    });

    syncMaps(workspace);

    expect(workspace.sceneMappings.s1).toEqual({ domainId: "d1", systemIds: ["y1"], screenIds: ["t1", "t2"], tableIds: [] });
  });
});
