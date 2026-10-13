import type { WorkflowAction, WorkflowDefinition } from "@/lib/domain/types";

export type AddTarget = { parent?: string; side?: "then" | "otherwise"; after?: string };
export type CanvasNode = {
  key: string;
  selection: string;
  kind: "trigger" | "filter" | "action" | "add" | "end";
  x: number;
  y: number;
  action?: WorkflowAction;
  target?: AddTarget;
};
export type CanvasEdge = {
  key: string;
  from: string;
  to: string;
  branch?: { key: string; side: "yes" | "no" };
};
export type CanvasGraph = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  width: number;
  height: number;
};
export const NODE_WIDTH = 288;
export const NODE_HEIGHT = 136;
const COLUMN = 388;
const ROW = 200;
type Link = Omit<CanvasEdge, "key" | "to">;

function lanes(actions: WorkflowAction[]): number {
  return Math.max(
    1,
    ...actions.map((a) =>
      a.type === "branch" ? lanes(a.then ?? []) + lanes(a.otherwise ?? []) : 1,
    ),
  );
}

/** Positions are presentation only. The validated sequence remains the execution authority. */
export function workflowGraph(definition: WorkflowDefinition, editable = false): CanvasGraph {
  const nodes: CanvasNode[] = [],
    edges: CanvasEdge[] = [];
  const height = lanes(definition.actions);
  function add(node: CanvasNode, incoming: Link[] = []) {
    nodes.push(node);
    incoming.forEach((link) =>
      edges.push({
        ...link,
        to: node.key,
        key: `${link.from}:${node.key}:${link.branch?.side ?? "next"}`,
      }),
    );
  }
  function sequence(
    actions: WorkflowAction[],
    prefix: string,
    column: number,
    top: number,
    area: number,
    incoming: Link[],
    target: AddTarget,
  ): { exits: Link[]; column: number } {
    let exits = incoming;
    for (const [i, action] of actions.entries()) {
      const key = `${prefix}.${i}`;
      add(
        {
          key,
          selection: action.id ?? key,
          kind: "action",
          action,
          target,
          x: column * COLUMN,
          y: (top + (area - 1) / 2) * ROW,
        },
        exits,
      );
      column++;
      exits = [{ from: key }];
      if (action.type === "branch") {
        const yesLanes = lanes(action.then ?? []),
          noLanes = lanes(action.otherwise ?? []);
        const branchTop = top + (area - yesLanes - noLanes) / 2;
        const yes = sequence(
          action.then ?? [],
          `${key}.yes`,
          column,
          branchTop,
          yesLanes,
          [{ from: key, branch: { key, side: "yes" } }],
          { parent: action.id ?? key, side: "then" },
        );
        const no = sequence(
          action.otherwise ?? [],
          `${key}.no`,
          column,
          branchTop + yesLanes,
          noLanes,
          [{ from: key, branch: { key, side: "no" } }],
          { parent: action.id ?? key, side: "otherwise" },
        );
        exits = [...yes.exits, ...no.exits];
        column = Math.max(yes.column, no.column);
      }
    }
    if (editable && !actions.length) {
      const key = `${prefix}.add`;
      add(
        {
          key,
          selection: key,
          kind: "add",
          target,
          x: column * COLUMN,
          y: (top + (area - 1) / 2) * ROW,
        },
        exits,
      );
      exits = [{ from: key }];
      column++;
    }
    return { exits, column };
  }
  add({ key: "trigger", selection: "trigger", kind: "trigger", x: 0, y: ((height - 1) * ROW) / 2 });
  let column = 1,
    incoming: Link[] = [{ from: "trigger" }];
  if (definition.conditions.length) {
    add(
      {
        key: "filter",
        selection: "trigger",
        kind: "filter",
        x: COLUMN,
        y: ((height - 1) * ROW) / 2,
      },
      incoming,
    );
    incoming = [{ from: "filter" }];
    column++;
  }
  const result = sequence(definition.actions, "root", column, 0, height, incoming, {});
  add(
    {
      key: "end",
      selection: "end",
      kind: "end",
      x: result.column * COLUMN,
      y: ((height - 1) * ROW) / 2,
    },
    result.exits,
  );
  return { nodes, edges, width: result.column * COLUMN + NODE_WIDTH, height: height * ROW };
}

export type StepState = { step_key: string; status: string; output?: Record<string, unknown> };
export function edgeState(
  edge: CanvasEdge,
  steps: Map<string, StepState>,
  runStatus?: string,
): string {
  if (!runStatus) return "idle";
  const source = steps.get(edge.from),
    target = steps.get(edge.to);
  if (edge.branch) {
    const decision = steps.get(edge.branch.key)?.output?.branch;
    if (decision === "yes" || decision === "no") {
      if (decision !== edge.branch.side) return "skipped";
    } else return "queued";
  }
  if (source?.status === "skipped" || target?.status === "skipped") return "skipped";
  const started = [...steps.values()].some((s) => !["queued", "skipped"].includes(s.status));
  const sourceDone =
    source?.status === "completed" || (["trigger", "filter"].includes(edge.from) && started);
  if (!sourceDone) return "queued";
  if (target) return target.status;
  return edge.to === "end" && runStatus === "completed" ? "completed" : "queued";
}

export function duplicateAction(action: WorkflowAction): WorkflowAction {
  return {
    ...action,
    id: crypto.randomUUID(),
    ...(action.type === "branch"
      ? {
          then: (action.then ?? []).map(duplicateAction),
          otherwise: (action.otherwise ?? []).map(duplicateAction),
        }
      : {}),
  };
}
