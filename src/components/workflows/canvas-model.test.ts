import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@/lib/domain/types";
import { duplicateAction, edgeState, workflowGraph, type StepState } from "./canvas-model";

const definition: WorkflowDefinition = {
  object_id: "70df58cb-a6be-4778-b6a3-14c53f86544a",
  trigger: { type: "record_created" },
  conditions: [],
  actions: [
    {
      id: "branch",
      type: "branch",
      then: [{ id: "yes", type: "task", title: "Oui" }],
      otherwise: [{ id: "no", type: "note", title: "Non", body: "Note" }],
    },
    { id: "after", type: "task", title: "Après les branches" },
  ],
};
describe("workflow canvas graph", () => {
  it("keeps exact worker keys and joins both branch paths before the following action", () => {
    const before = structuredClone(definition),
      graph = workflowGraph(definition);
    expect(definition).toEqual(before);
    expect(graph.nodes.map((n) => n.key)).toEqual([
      "trigger",
      "root.0",
      "root.0.yes.0",
      "root.0.no.0",
      "root.1",
      "end",
    ]);
    expect(graph.edges.filter((e) => e.to === "root.1").map((e) => e.from)).toEqual([
      "root.0.yes.0",
      "root.0.no.0",
    ]);
    expect(graph.nodes.find((n) => n.key === "root.0.yes.0")!.y).not.toBe(
      graph.nodes.find((n) => n.key === "root.0.no.0")!.y,
    );
    expect(new Set(graph.nodes.map((n) => n.key)).size).toBe(graph.nodes.length);
  });
  it("adds insertion targets in their actual branch, without changing the definition", () => {
    const graph = workflowGraph(
      {
        ...definition,
        actions: [{ ...definition.actions[0], otherwise: [] }, definition.actions[1]],
      },
      true,
    );
    expect(graph.nodes.find((n) => n.key === "root.0.no.add")!.target).toEqual({
      parent: "branch",
      side: "otherwise",
    });
    expect(graph.nodes.find((n) => n.key === "root.0.yes.0")!.target).toEqual({
      parent: "branch",
      side: "then",
    });
    expect(
      workflowGraph({ ...definition, actions: [] }, true).nodes.find((n) => n.key === "root.add")!
        .target,
    ).toEqual({});
    for (const edge of graph.edges) {
      expect(graph.nodes.some((n) => n.key === edge.from)).toBe(true);
      expect(graph.nodes.some((n) => n.key === edge.to)).toBe(true);
    }
  });
  it("keeps empty branches and their decision on the merge edge", () => {
    const graph = workflowGraph({
      ...definition,
      actions: [{ type: "branch", then: [], otherwise: [] }, definition.actions[1]],
    });
    expect(graph.edges.filter((e) => e.to === "root.1").map((e) => e.branch?.side)).toEqual([
      "yes",
      "no",
    ]);
  });
  it("colors only the path selected by the persisted branch output", () => {
    const graph = workflowGraph(definition);
    const states = new Map<string, StepState>([
      ["root.0", { step_key: "root.0", status: "completed", output: { branch: "yes" } }],
      ["root.0.yes.0", { step_key: "root.0.yes.0", status: "running" }],
      ["root.0.no.0", { step_key: "root.0.no.0", status: "skipped" }],
    ]);
    expect(
      edgeState(
        graph.edges.find((e) => e.to === "root.0.yes.0")!,
        states,
        "running",
      ),
    ).toBe("running");
    expect(
      edgeState(
        graph.edges.find((e) => e.to === "root.0.no.0")!,
        states,
        "running",
      ),
    ).toBe("skipped");
    states.get("root.0")!.output = {};
    expect(
      edgeState(
        graph.edges.find((e) => e.to === "root.0.yes.0")!,
        states,
        "running",
      ),
    ).toBe("queued");
  });
  it("does not show cancellation or unexecuted work as successful", () => {
    const graph = workflowGraph({ ...definition, actions: [definition.actions[1]] });
    const states = new Map<string, StepState>([
      ["root.0", { step_key: "root.0", status: "completed" }],
    ]);
    const last = graph.edges.find((e) => e.to === "end")!;
    expect(edgeState(last, states, "cancelled")).toBe("queued");
    expect(edgeState(last, states, "completed")).toBe("completed");
    expect(edgeState(last, states)).toBe("idle");
  });
  it("duplicates every child with a new ID", () => {
    const source = definition.actions[0],
      copy = duplicateAction(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.then![0].id).not.toBe(source.then![0].id);
    expect(copy.otherwise![0].id).not.toBe(source.otherwise![0].id);
    expect(copy.then![0].title).toBe("Oui");
    expect(source.then![0].id).toBe("yes");
  });
});
