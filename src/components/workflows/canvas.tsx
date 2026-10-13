"use client";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Check,
  Circle,
  Clock3,
  Flag,
  Hand,
  LayoutGrid,
  List,
  Loader2,
  Maximize,
  Minus,
  MousePointer2,
  Plus,
  SkipForward,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import type { WorkflowDefinition } from "@/lib/domain/types";
import { actionLabel } from "@/lib/domain/workflows";
import { workflowActionTypes, workflowTriggers } from "@/lib/domain/workflow-templates";
import {
  workflowGraph,
  edgeState,
  NODE_HEIGHT,
  NODE_WIDTH,
  type AddTarget,
  type CanvasNode,
  type StepState,
} from "./canvas-model";
import { blockSummary } from "./block-presets";
import { blockMeta } from "./block-meta";
import styles from "./canvas.module.css";

export const stepLabels: Record<string, string> = {
  queued: "À venir",
  running: "En cours",
  waiting: "En attente",
  completed: "Réussi",
  failed: "Échec",
  skipped: "Non parcouru",
  unknown: "À vérifier",
  paused: "En pause",
  cancelled: "Arrêté",
};
const statusIcons = {
  queued: Circle,
  running: Loader2,
  waiting: Clock3,
  completed: Check,
  failed: AlertCircle,
  skipped: SkipForward,
  unknown: AlertCircle,
};
type Point = { x: number; y: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function WorkflowCanvas({
  definition,
  objectName,
  selected,
  onSelect,
  onAdd,
  steps = [],
  runStatus,
  replayKey,
  disabled = false,
  tools,
}: {
  definition: WorkflowDefinition;
  objectName?: string;
  selected?: string;
  onSelect: (node: CanvasNode) => void;
  onAdd?: (target: AddTarget) => void;
  steps?: StepState[];
  runStatus?: string;
  replayKey?: string;
  disabled?: boolean;
  tools?: ReactNode;
}) {
  const graph = useMemo(() => workflowGraph(definition, !!onAdd), [definition, onAdd]);
  const stepMap = useMemo(() => new Map(steps.map((s) => [s.step_key, s])), [steps]);
  const region = useRef<HTMLDivElement>(null);
  const arrow = useId().replaceAll(":", "");
  const [view, setView] = useState({ x: 40, y: 80, scale: 1 });
  const [outline, setOutline] = useState(false);
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [mode, setMode] = useState<"pointer" | "hand">("pointer");
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const drag = useRef<{
    pointer: number;
    start: Point;
    initial: Point;
    node?: string;
    scale: number;
  } | null>(null);
  const moved = useRef(false);
  const initialized = useRef(false);
  const positionKey = (node: CanvasNode) => (node.kind === "action" ? node.selection : node.key);
  const point = (node: CanvasNode) => positions[positionKey(node)] ?? node;
  const nodes = new Map(graph.nodes.map((n) => [n.key, n]));
  const worldWidth =
    Math.max(graph.width, ...Object.values(positions).map((p) => p.x + NODE_WIDTH)) + 120;
  const worldHeight =
    Math.max(graph.height, ...Object.values(positions).map((p) => p.y + NODE_HEIGHT)) + 120;

  useEffect(() => {
    const el = region.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry.contentRect.width) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      if (initialized.current) return;
      initialized.current = true;
      const first = graph.nodes[0];
      setView({
        x: 48,
        y: Math.max(40, entry.contentRect.height / 2 - first.y - NODE_HEIGHT / 2),
        scale: 1,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [graph]);

  useEffect(() => {
    const el = region.current;
    if (!el) return;
    function wheel(e: WheelEvent) {
      if (disabled) return;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el!.getBoundingClientRect(),
          x = e.clientX - rect.left,
          y = e.clientY - rect.top;
        setView((v) => {
          const scale = clamp(v.scale * Math.exp(-e.deltaY * 0.005), 0.01, 2);
          return {
            scale,
            x: x - ((x - v.x) * scale) / v.scale,
            y: y - ((y - v.y) * scale) / v.scale,
          };
        });
      } else setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [disabled]);

  function zoom(scale: number) {
    const rect = region.current?.getBoundingClientRect();
    const x = (rect?.width ?? 600) / 2,
      y = (rect?.height ?? 400) / 2;
    setView((v) => ({
      scale: clamp(scale, 0.01, 2),
      x: x - ((x - v.x) * clamp(scale, 0.01, 2)) / v.scale,
      y: y - ((y - v.y) * clamp(scale, 0.01, 2)) / v.scale,
    }));
  }
  function fit(organize = false) {
    if (organize) setPositions({});
    const rect = region.current?.getBoundingClientRect();
    const points = graph.nodes.map((n) => (organize ? n : point(n)));
    const minX = Math.min(...points.map((p) => p.x)),
      minY = Math.min(...points.map((p) => p.y));
    const width = Math.max(...points.map((p) => p.x)) + NODE_WIDTH - minX;
    const height = Math.max(...points.map((p) => p.y)) + NODE_HEIGHT - minY;
    const scale = clamp(
      Math.min(((rect?.width ?? 600) - 96) / width, ((rect?.height ?? 400) - 120) / height),
      0.01,
      1,
    );
    setView({
      scale,
      x: ((rect?.width ?? 600) - width * scale) / 2 - minX * scale,
      y: ((rect?.height ?? 400) - height * scale) / 2 - minY * scale,
    });
  }
  function focusNode(node: CanvasNode) {
    if (disabled) return;
    const p = point(node);
    setView({
      x: size.width / 2 - p.x - NODE_WIDTH / 2,
      y: size.height / 2 - p.y - NODE_HEIGHT / 2,
      scale: 1,
    });
    if (!["add", "end"].includes(node.kind)) onSelect(node);
    setOutline(false);
  }
  const navigable = graph.nodes.filter((n) => !["add", "end"].includes(n.kind));
  const nodeName = (node: CanvasNode) =>
    node.action
      ? actionLabel(node.action)
      : node.kind === "trigger"
        ? workflowTriggers[definition.trigger?.type ?? "manual"]
        : "Critères d’entrée";
  function select(node: CanvasNode) {
    if (!moved.current && !disabled) onSelect(node);
  }
  function status(node: CanvasNode) {
    if (!runStatus) return "idle";
    if (node.kind === "end") return runStatus === "completed" ? "completed" : "queued";
    if (node.kind === "trigger" || node.kind === "filter")
      return steps.some((s) => !["queued", "skipped"].includes(s.status)) ? "completed" : "queued";
    return stepMap.get(node.key)?.status ?? "queued";
  }
  return (
    <div
      className={styles.viewport}
      style={
        {
          "--node-width": `${NODE_WIDTH}px`,
          "--node-height": `${NODE_HEIGHT}px`,
          "--grid-size": `${Math.max(8, 24 * view.scale)}px`,
          "--grid-x": `${view.x}px`,
          "--grid-y": `${view.y}px`,
        } as CSSProperties
      }
      ref={region}
      tabIndex={0}
      role="region"
      aria-label={runStatus ? "Canvas de l’exécution" : "Canvas du workflow"}
      data-mode={mode}
      onKeyDown={(e) => {
        if (disabled || (e.target as HTMLElement).closest("input,textarea,select")) return;
        if ((e.metaKey || e.ctrlKey) && e.key === "0") {
          e.preventDefault();
          zoom(1);
        } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          if (e.key.toLowerCase() === "h") setMode("hand");
          if (e.key.toLowerCase() === "v") setMode("pointer");
          if (e.key.toLowerCase() === "b" && onAdd) {
            e.preventDefault();
            onAdd({});
          }
          if (e.key === "+" || e.key === "=") {
            e.preventDefault();
            zoom(view.scale + 0.1);
          }
          if (e.key === "-") {
            e.preventDefault();
            zoom(view.scale - 0.1);
          }
        }
      }}
      onPointerDown={(e) => {
        if (
          disabled ||
          (e.button !== 0 && e.button !== 1) ||
          (e.target as HTMLElement).closest("[data-canvas-control]")
        )
          return;
        moved.current = false;
        const key = (e.target as HTMLElement).closest<HTMLElement>("[data-node-key]")?.dataset
          .nodeKey;
        const node = key ? nodes.get(key) : undefined;
        if (node && !onAdd && mode !== "hand") return;
        const movingNode = mode === "pointer" && e.button === 0 ? node : undefined;
        if (movingNode?.kind === "add") return;
        region.current?.focus({ preventScroll: true });
        drag.current = {
          pointer: e.pointerId,
          start: { x: e.clientX, y: e.clientY },
          initial: movingNode ? point(movingNode) : view,
          node: movingNode ? positionKey(movingNode) : undefined,
          scale: view.scale,
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.pointer) return;
        const dx = e.clientX - d.start.x,
          dy = e.clientY - d.start.y;
        if (Math.abs(dx) + Math.abs(dy) < 5 && !moved.current) return;
        moved.current = true;
        if (!e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.setPointerCapture(e.pointerId);
        if (d.node)
          setPositions((p) => ({
            ...p,
            [d.node!]: {
              x: Math.max(0, d.initial.x + dx / d.scale),
              y: Math.max(0, d.initial.y + dy / d.scale),
            },
          }));
        else setView((v) => ({ ...v, x: d.initial.x + dx, y: d.initial.y + dy }));
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        moved.current = false;
      }}
    >
      <div className={styles.canvasLabel} data-canvas-control>
        <span>{runStatus ? "Version exécutée · Lecture seule" : "Éditeur de workflow"}</span>
        <button
          type="button"
          aria-expanded={outline}
          aria-label="Afficher le plan du workflow"
          disabled={disabled}
          onClick={() => setOutline(!outline)}
        >
          <List size={14} /> {navigable.length} blocs
        </button>
        {outline && (
          <div className={styles.outline} aria-label="Plan du workflow">
            {navigable.map((node, index) => (
              <button
                type="button"
                key={node.key}
                aria-label={`${index + 1} · ${nodeName(node)}`}
                onClick={() => focusNode(node)}
              >
                <span>{index + 1}</span>
                <strong>{nodeName(node)}</strong>
                {runStatus && <small>{stepLabels[status(node)] ?? status(node)}</small>}
              </button>
            ))}
          </div>
        )}
      </div>
      {tools && (
        <div className={styles.canvasTools} data-canvas-control>
          {tools}
        </div>
      )}
      <div
        className={styles.world}
        style={{
          width: worldWidth,
          height: worldHeight,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        }}
      >
        <svg className={styles.edges} width={worldWidth} height={worldHeight} aria-hidden="true">
          <defs>
            <marker
              id={arrow}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const from = point(nodes.get(edge.from)!),
              to = point(nodes.get(edge.to)!);
            const x = from.x + NODE_WIDTH,
              y = from.y + NODE_HEIGHT / 2,
              tx = to.x,
              ty = to.y + NODE_HEIGHT / 2;
            const bend = Math.max(44, Math.abs(tx - x) / 2),
              state = edgeState(edge, stepMap, runStatus);
            return (
              <g key={edge.key}>
                <path
                  className={styles.edge}
                  data-state={state}
                  data-animated={
                    state === "running" || (replayKey === edge.to && state === "completed")
                  }
                  data-from={edge.from}
                  data-to={edge.to}
                  d={`M ${x} ${y} C ${x + bend} ${y}, ${tx - bend} ${ty}, ${tx} ${ty}`}
                  markerEnd={`url(#${arrow})`}
                />
                {edge.branch && (
                  <g
                    data-branch={edge.branch.side}
                    transform={`translate(${x + 31},${y + (ty >= y ? 19 : -19)})`}
                  >
                    <rect x="-17" y="-10" width="36" height="20" rx="7" />
                    <text x="1" y="3" textAnchor="middle">
                      {edge.branch.side === "yes" ? "Oui" : "Non"}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        {graph.nodes.map((node) => {
          const p = point(node),
            state = status(node),
            meta = node.action ? blockMeta[node.action.type] : undefined;
          const Icon =
            meta?.icon ??
            (node.kind === "trigger" ? Zap : node.kind === "filter" ? SlidersHorizontal : Flag);
          const StatusIcon = statusIcons[state as keyof typeof statusIcons] ?? Circle;
          return (
            <div
              className={styles.nodePosition}
              key={node.key}
              data-node-key={node.key}
              style={{ left: p.x, top: p.y }}
            >
              {node.kind === "add" ? (
                <button
                  type="button"
                  className={styles.addCard}
                  data-canvas-control
                  disabled={disabled}
                  onClick={() => onAdd?.(node.target ?? {})}
                >
                  <Plus size={18} />
                  <span>Ajouter un bloc</span>
                </button>
              ) : node.kind === "end" ? (
                <div className={styles.end} data-state={state}>
                  <Flag size={14} />
                  Fin du workflow
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.card}
                    aria-label={`${node.kind === "trigger" ? "Déclencheur" : node.kind === "filter" ? "Critères d’entrée" : workflowActionTypes[node.action!.type]} : ${node.action ? actionLabel(node.action) : workflowTriggers[definition.trigger?.type ?? "manual"]}`}
                    aria-pressed={selected === node.selection || selected === node.key}
                    disabled={disabled}
                    data-color={meta?.color ?? (node.kind === "trigger" ? "amber" : "green")}
                    data-state={state}
                    data-replay={replayKey === node.key}
                    onClick={() => select(node)}
                  >
                    <span className={styles.cardHeading}>
                      <span className={styles.cardIcon}>
                        <Icon size={18} strokeWidth={1.8} />
                      </span>
                      <span className={styles.cardCategory}>
                        {meta?.category ?? (node.kind === "trigger" ? "Déclencheur" : "Logique")}
                      </span>
                      <span className={styles.cardOrder}>
                        {String(navigable.indexOf(node) + 1).padStart(2, "0")}
                      </span>
                    </span>
                    <strong>
                      {node.action
                        ? actionLabel(node.action)
                        : node.kind === "trigger"
                          ? workflowTriggers[definition.trigger?.type ?? "manual"]
                          : `${definition.conditions.length} condition(s) · ${definition.condition_mode === "any" ? "OU" : "ET"}`}
                    </strong>
                    <span className={styles.cardSummary}>
                      {node.action
                        ? blockSummary(node.action)
                        : node.kind === "trigger"
                          ? (objectName ?? "Fiches du workflow")
                          : "Vérifiées avant le lancement"}
                    </span>
                    <span className={styles.cardFooter}>
                      <span className={styles.cardTag} data-status={runStatus ? state : undefined}>
                        {runStatus && (
                          <StatusIcon
                            size={12}
                            className={state === "running" ? styles.spinner : undefined}
                          />
                        )}
                        {runStatus
                          ? (stepLabels[state] ?? state)
                          : node.action
                            ? workflowActionTypes[node.action.type]
                            : "Début du parcours"}
                      </span>
                      {node.action?.alias && (
                        <code title="Nom de sortie">{`{x} ${node.action.alias}`}</code>
                      )}
                    </span>
                  </button>
                  <span className={styles.inputPort} />
                  {onAdd && node.kind === "action" ? (
                    <button
                      type="button"
                      className={styles.outputPort}
                      data-canvas-control
                      aria-label={`Ajouter après ${actionLabel(node.action!)}`}
                      disabled={disabled}
                      onClick={() => onAdd({ ...node.target, after: node.action!.id })}
                    >
                      <Plus size={12} />
                    </button>
                  ) : (
                    <span className={styles.outputPort} />
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className={styles.minimap} data-canvas-control>
        <span>Vue d’ensemble</span>
        <svg
          viewBox={`-24 -24 ${worldWidth + 48} ${worldHeight + 48}`}
          aria-label="Mini-carte du workflow"
        >
          {graph.edges.map((edge) => {
            const from = point(nodes.get(edge.from)!),
              to = point(nodes.get(edge.to)!);
            return (
              <line
                key={edge.key}
                x1={from.x + NODE_WIDTH}
                y1={from.y + NODE_HEIGHT / 2}
                x2={to.x}
                y2={to.y + NODE_HEIGHT / 2}
              />
            );
          })}
          {navigable.map((node) => {
            const p = point(node);
            return (
              <rect
                key={node.key}
                x={p.x}
                y={p.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={14}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                aria-label={`Centrer sur ${nodeName(node)}`}
                data-selected={selected === node.selection || selected === node.key}
                onClick={() => focusNode(node)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    focusNode(node);
                  }
                }}
              />
            );
          })}
          <rect
            className={styles.miniViewport}
            x={-view.x / view.scale}
            y={-view.y / view.scale}
            width={size.width / view.scale}
            height={size.height / view.scale}
          />
        </svg>
      </div>
      <div className={styles.navigation} data-canvas-control aria-label="Navigation du canvas">
        <button
          type="button"
          title="Sélection (V)"
          aria-label="Mode sélection"
          aria-pressed={mode === "pointer"}
          disabled={disabled}
          onClick={() => setMode("pointer")}
        >
          <MousePointer2 size={16} />
        </button>
        <button
          type="button"
          title="Déplacer le canvas (H)"
          aria-label="Mode déplacement"
          aria-pressed={mode === "hand"}
          disabled={disabled}
          onClick={() => setMode("hand")}
        >
          <Hand size={16} />
        </button>
        <i />
        <button
          type="button"
          aria-label="Réduire le zoom"
          disabled={disabled || view.scale <= 0.01}
          onClick={() => zoom(view.scale - 0.1)}
        >
          <Minus size={15} />
        </button>
        <span className={styles.zoomValue} aria-live="polite">
          {Math.round(view.scale * 100)} %
        </span>
        <button
          type="button"
          aria-label="Augmenter le zoom"
          disabled={disabled || view.scale >= 2}
          onClick={() => zoom(view.scale + 0.1)}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          title="Afficher tout le workflow"
          aria-label="Ajuster le canvas"
          disabled={disabled}
          onClick={() => fit()}
        >
          <Maximize size={16} />
        </button>
        {onAdd && (
          <>
            <i />
            <button
              type="button"
              title="Organiser les blocs"
              aria-label="Organiser les blocs"
              disabled={disabled}
              onClick={() => fit(true)}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              className={styles.addButton}
              disabled={disabled}
              onClick={() => onAdd({})}
            >
              <Plus size={15} />
              Ajouter un bloc
            </button>
          </>
        )}
      </div>
      <span className={styles.canvasHint}>
        {runStatus
          ? "Cliquez sur un bloc pour consulter son résultat"
          : "H déplacer · V sélectionner · B ajouter · Ctrl/⌘ + molette pour zoomer"}
      </span>
    </div>
  );
}
