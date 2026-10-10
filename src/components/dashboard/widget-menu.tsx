"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Maximize2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import type { ReportTile } from "@/lib/domain/dashboards";
import styles from "./dashboard.module.css";
export function WidgetMenu({
  editing,
  canEdit,
  canDuplicate,
  canRemove,
  first,
  last,
  onEdit,
  onDuplicate,
  onRemove,
  onMove,
  onExpand,
}: {
  editing: boolean;
  canEdit: boolean;
  canDuplicate: boolean;
  canRemove: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (amount: number) => void;
  onExpand: () => void;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button className="icon-button" aria-label="Actions du widget">
          <MoreHorizontal size={17} />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className={styles.widgetMenu} align="end" sideOffset={4}>
          <Dropdown.Item onSelect={onExpand}>
            <Maximize2 size={14} />
            Agrandir
          </Dropdown.Item>
          {canEdit && (
            <Dropdown.Item onSelect={onEdit}>
              <Pencil size={14} />
              Configurer
            </Dropdown.Item>
          )}
          {editing && (
            <>
              <Dropdown.Item disabled={!canDuplicate} onSelect={onDuplicate}>
                <Copy size={14} />
                Dupliquer
              </Dropdown.Item>
              <Dropdown.Separator />
              <Dropdown.Item disabled={first} onSelect={() => onMove(-1)}>
                <ArrowLeft size={14} />
                Déplacer avant
              </Dropdown.Item>
              <Dropdown.Item disabled={last} onSelect={() => onMove(1)}>
                <ArrowRight size={14} />
                Déplacer après
              </Dropdown.Item>
              <Dropdown.Separator />
              <Dropdown.Item
                disabled={!canRemove}
                onSelect={onRemove}
                className={styles.destructive}
              >
                <Trash2 size={14} />
                Retirer du dashboard
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
const widths: ReportTile["size"][] = ["small", "third", "medium", "large"];
/** Pointer resize and native keyboard range support share the same discrete saved widths. */
export function WidgetResize({
  tile,
  onChange,
}: {
  tile: ReportTile;
  onChange: (patch: Partial<ReportTile>) => void;
}) {
  return (
    <div className={styles.resizeControls}>
      <label>
        Largeur
        <input
          type="range"
          aria-label={"Largeur de " + tile.title}
          min={0}
          max={3}
          step={1}
          value={widths.indexOf(tile.size)}
          aria-valuetext={["¼", "⅓", "½", "Ligne entière"][widths.indexOf(tile.size)]}
          onChange={(e) => onChange({ size: widths[Number(e.target.value)] })}
        />
      </label>
      <select
        aria-label={"Hauteur de " + tile.title}
        value={tile.height ?? "standard"}
        onChange={(e) => onChange({ height: e.target.value as ReportTile["height"] })}
      >
        <option value="compact">Compact</option>
        <option value="standard">Standard</option>
        <option value="tall">Grand</option>
      </select>
    </div>
  );
}
