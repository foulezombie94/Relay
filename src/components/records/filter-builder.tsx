"use client";
import * as Popover from "@radix-ui/react-popover";
import { ListFilter, Plus, Trash2, X, FolderPlus } from "lucide-react";
import type { Attribute, Row } from "@/lib/domain/types";
import { str } from "../ui/display";
import {
  filterCount,
  isFilterGroup,
  maxFilterConditions,
  maxFilterDepth,
  type FilterGroup,
  type RecordFilter,
} from "@/lib/domain/record-filters";
import styles from "./filter-builder.module.css";

type Operator = RecordFilter["operator"];
type Kind = "text" | "number" | "date" | "choice";
export type FilterField = {
  key: string;
  label: string;
  kind: Kind;
  options?: { value: string; label: string }[];
  /** Custom JSON attributes compare as text: no ordered comparisons. */
  ordered?: boolean;
};
const operatorLabels: Record<Operator, string> = {
  equals: "est",
  not_equals: "n’est pas",
  contains: "contient",
  gt: "supérieur à",
  lt: "inférieur à",
  before: "avant le",
  after: "après le",
  exists: "est renseigné",
  not_exists: "est vide",
};
export function operatorsFor(field: FilterField): Operator[] {
  const base: Operator[] = ["equals", "not_equals"];
  if (field.kind === "text") base.push("contains");
  if (field.kind === "number" && field.ordered) base.push("gt", "lt");
  if (field.kind === "date" && field.ordered) base.push("before", "after");
  return [...base, "exists", "not_exists"];
}
export function filterFields({
  attributes,
  deals,
  stageOptions,
  members,
  pipelines,
}: {
  attributes: Attribute[];
  deals: boolean;
  stageOptions: { value: string; label: string }[];
  members: Row[];
  pipelines: { id: string; name: string }[];
}): FilterField[] {
  const fields: FilterField[] = [
    { key: "display_name", label: "Nom", kind: "text" },
    { key: "email", label: "Email", kind: "text" },
    { key: "domain", label: "Domaine", kind: "text" },
    {
      key: "owner_id",
      label: "Responsable",
      kind: "choice",
      options: members.map((m) => ({
        value: str(m.user_id),
        label: str(m.display_name) || "Membre",
      })),
    },
  ];
  if (deals)
    fields.push(
      { key: "stage", label: "Étape", kind: "choice", options: stageOptions },
      {
        key: "pipeline_id",
        label: "Pipeline",
        kind: "choice",
        options: pipelines.map((p) => ({ value: p.id, label: p.name })),
      },
      { key: "amount", label: "Montant", kind: "number", ordered: true },
      { key: "probability", label: "Probabilité", kind: "number", ordered: true },
      { key: "close_date", label: "Clôture prévue", kind: "date", ordered: true },
    );
  for (const attr of attributes) {
    if (attr.archived || attr.type === "formula" || !/^[a-z][a-z0-9_]{0,49}$/.test(attr.key))
      continue;
    const key = "attributes." + attr.key;
    if (attr.type === "select")
      fields.push({
        key,
        label: attr.name,
        kind: "choice",
        options: (attr.options ?? []).map((o) => ({ value: o, label: o })),
      });
    else if (attr.type === "boolean")
      fields.push({
        key,
        label: attr.name,
        kind: "choice",
        options: [
          { value: "true", label: "Oui" },
          { value: "false", label: "Non" },
        ],
      });
    else if (["number", "money"].includes(attr.type))
      fields.push({ key, label: attr.name, kind: "number" });
    else if (attr.type === "date") fields.push({ key, label: attr.name, kind: "date" });
    else fields.push({ key, label: attr.name, kind: "text" });
  }
  return fields;
}
function blankCondition(field: FilterField): RecordFilter {
  return field.kind === "choice" && field.options?.[0]
    ? { field: field.key, operator: "equals", value: field.options[0].value }
    : field.kind === "text"
      ? { field: field.key, operator: "contains", value: "" }
      : { field: field.key, operator: "exists" };
}

function ConditionRow({
  condition,
  fields,
  onChange,
}: {
  condition: RecordFilter;
  fields: FilterField[];
  onChange: (next: RecordFilter) => void;
}) {
  const field = fields.find((f) => f.key === condition.field) ?? fields[0];
  const operators = operatorsFor(field);
  const needsValue = !["exists", "not_exists"].includes(condition.operator);
  return (
    <>
      <select
        aria-label="Propriété"
        className={styles.field}
        value={field.key}
        onChange={(event) => {
          const next = fields.find((f) => f.key === event.target.value);
          if (next) onChange(blankCondition(next));
        }}
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Condition"
        className={styles.operator}
        value={operators.includes(condition.operator) ? condition.operator : operators[0]}
        onChange={(event) => {
          const operator = event.target.value as Operator;
          onChange(
            ["exists", "not_exists"].includes(operator)
              ? { field: condition.field, operator }
              : { ...condition, operator, value: condition.value ?? "" },
          );
        }}
      >
        {operators.map((op) => (
          <option key={op} value={op}>
            {operatorLabels[op]}
          </option>
        ))}
      </select>
      {needsValue ? (
        field.kind === "choice" ? (
          <select
            aria-label="Valeur"
            className={styles.value}
            value={condition.value ?? ""}
            onChange={(event) => onChange({ ...condition, value: event.target.value })}
          >
            {(field.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label="Valeur"
            className={styles.value}
            type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
            maxLength={300}
            placeholder="Valeur"
            value={condition.value ?? ""}
            onChange={(event) => onChange({ ...condition, value: event.target.value })}
          />
        )
      ) : (
        <span className={styles.value} />
      )}
    </>
  );
}

function GroupEditor({
  group,
  fields,
  depth,
  total,
  onChange,
  onRemove,
}: {
  group: FilterGroup;
  fields: FilterField[];
  depth: number;
  total: number;
  onChange: (next: FilterGroup) => void;
  onRemove?: () => void;
}) {
  const setItem = (index: number, item: RecordFilter | FilterGroup) =>
    onChange({ ...group, items: group.items.map((current, i) => (i === index ? item : current)) });
  const removeItem = (index: number) =>
    onChange({ ...group, items: group.items.filter((_, i) => i !== index) });
  const full = total >= maxFilterConditions || group.items.length >= 20;
  return (
    <div className={styles.group} data-depth={depth}>
      {group.items.map((item, index) => (
        <div className={styles.row} key={index}>
          <span className={styles.conjunction}>
            {index === 0 ? (
              "Où"
            ) : index === 1 ? (
              <select
                aria-label="Combiner les conditions"
                value={group.mode}
                onChange={(event) =>
                  onChange({ ...group, mode: event.target.value as FilterGroup["mode"] })
                }
              >
                <option value="and">Et</option>
                <option value="or">Ou</option>
              </select>
            ) : group.mode === "and" ? (
              "Et"
            ) : (
              "Ou"
            )}
          </span>
          {isFilterGroup(item) ? (
            <GroupEditor
              group={item}
              fields={fields}
              depth={depth + 1}
              total={total}
              onChange={(next) => setItem(index, next)}
              onRemove={() => removeItem(index)}
            />
          ) : (
            <>
              <ConditionRow
                condition={item}
                fields={fields}
                onChange={(next) => setItem(index, next)}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Supprimer la condition"
                onClick={() => removeItem(index)}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      ))}
      <div className={styles.add}>
        <button
          type="button"
          disabled={full}
          onClick={() => onChange({ ...group, items: [...group.items, blankCondition(fields[0])] })}
        >
          <Plus size={14} /> Ajouter un filtre
        </button>
        {depth < maxFilterDepth && (
          <button
            type="button"
            disabled={full}
            onClick={() =>
              onChange({
                ...group,
                items: [
                  ...group.items,
                  { mode: group.mode === "and" ? "or" : "and", items: [blankCondition(fields[0])] },
                ],
              })
            }
          >
            <FolderPlus size={14} /> Ajouter un groupe
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove}>
            <X size={14} /> Supprimer le groupe
          </button>
        )}
      </div>
    </div>
  );
}

/** Notion-style advanced filter: nested AND/OR groups saved with the view. */
export function FilterBuilder({
  value,
  fields,
  onChange,
}: {
  value?: FilterGroup;
  fields: FilterField[];
  onChange: (next: FilterGroup | undefined) => void;
}) {
  const count = filterCount(value);
  const group = value ?? { mode: "and" as const, items: [] };
  return (
    <Popover.Root>
      <Popover.Trigger
        className="button small"
        data-active={count > 0}
        aria-label={count ? `Filtres avancés, ${count} condition(s)` : "Filtres avancés"}
      >
        <ListFilter size={14} />
        Filtrer
        {count > 0 && <span className={styles.count}>{count}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.panel}
          align="start"
          sideOffset={6}
          collisionPadding={12}
        >
          <div className={styles.head}>
            <strong>Filtres avancés</strong>
            {count > 0 && (
              <button type="button" className={styles.clear} onClick={() => onChange(undefined)}>
                Tout effacer
              </button>
            )}
          </div>
          {group.items.length === 0 ? (
            <p className={styles.empty}>
              Combinez des conditions avec Et / Ou, puis regroupez-les pour des segments précis. Les
              filtres sont enregistrés avec la vue.
            </p>
          ) : null}
          <GroupEditor
            group={group}
            fields={fields}
            depth={1}
            total={count}
            onChange={(next) => onChange(next.items.length ? next : undefined)}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
