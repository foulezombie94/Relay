"use client";
import { useState } from "react";
import { DatePicker } from "./date-picker";
import { useRows, useWorkspace } from "../providers/data-provider";
import { stages } from "@/lib/domain/types";
import type { WorkflowDefinition } from "@/lib/domain/types";
type Entry = Record<string, unknown>;
export function SourceFields({
  name,
  initial,
}: {
  name: string;
  initial?: unknown;
}) {
  const [value, setValue] = useState<Entry>(
    initial && typeof initial === "object"
      ? (initial as Entry)
      : { label: "", quote: "", value: "" },
  );
  return (
    <div className="stack">
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      {[
        ["label", "Nom de la source"],
        ["quote", "Passage cité"],
        ["value", "Information retenue"],
      ].map(([key, label]) => (
        <label key={key}>
          {label}
          {key === "quote" ? (
            <textarea
              required
              value={String(value[key] ?? "")}
              onChange={(e) => setValue({ ...value, [key]: e.target.value })}
            />
          ) : (
            <input
              required
              value={String(value[key] ?? "")}
              onChange={(e) => setValue({ ...value, [key]: e.target.value })}
            />
          )}
        </label>
      ))}
    </div>
  );
}
export function RepeatFields({
  name,
  initial,
  kind,
}: {
  name: string;
  initial?: unknown;
  kind: "milestones" | "steps" | "options";
}) {
  const [rows, setRows] = useState<Entry[]>(
    Array.isArray(initial)
      ? initial.map((value) => (typeof value === "string" ? { value } : value))
      : [],
  );
  const update = (index: number, key: string, value: unknown) =>
    setRows(
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );
  return (
    <div className="stack">
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(
          kind === "options" ? rows.map((row) => row.value) : rows,
        )}
      />
      {rows.map((row, index) => (
        <div className="detail-card" key={index}>
          <div className="card-head">
            <strong>
              {kind === "steps"
                ? "Message"
                : kind === "milestones"
                  ? "Jalon"
                  : "Option"}{" "}
              {index + 1}
            </strong>
            <div>
              <button
                type="button"
                className="button small"
                disabled={index === 0}
                aria-label="Monter"
                onClick={() => {
                  const next = [...rows];
                  [next[index - 1], next[index]] = [
                    next[index],
                    next[index - 1],
                  ];
                  setRows(next);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="button small"
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
              >
                Retirer
              </button>
            </div>
          </div>
          {kind === "options" ? (
            <label>
              Valeur
              <input
                required
                value={String(row.value ?? "")}
                onChange={(e) => update(index, "value", e.target.value)}
              />
            </label>
          ) : kind === "milestones" ? (
            <>
              <label>
                Titre
                <input
                  required
                  value={String(row.title ?? "")}
                  onChange={(e) => update(index, "title", e.target.value)}
                />
              </label>
              <DatePicker
                key={index + String(row.date)}
                name={"milestone-date-" + index}
                label="Date du jalon"
                defaultValue={String(row.date ?? "")}
                onValueChange={(value) => update(index, "date", value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={!!row.done}
                  onChange={(e) => update(index, "done", e.target.checked)}
                />{" "}
                Réalisé
              </label>
            </>
          ) : (
            <>
              <label>
                Objet
                <input
                  required
                  maxLength={300}
                  value={String(row.subject ?? "")}
                  onChange={(e) => update(index, "subject", e.target.value)}
                />
              </label>
              <label>
                Message
                <textarea
                  required
                  maxLength={20000}
                  value={String(row.body ?? "")}
                  onChange={(e) => update(index, "body", e.target.value)}
                />
              </label>
              <label>
                Délai depuis le message précédent (jours)
                <input
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  value={Number(row.delay_days ?? 1)}
                  onChange={(e) =>
                    update(index, "delay_days", Number(e.target.value))
                  }
                />
              </label>
            </>
          )}
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={rows.length >= (kind === "steps" ? 30 : 100)}
        onClick={() =>
          setRows([
            ...rows,
            kind === "options"
              ? { value: "" }
              : kind === "milestones"
                ? { title: "", date: "", done: false }
                : { subject: "", body: "", delay_days: 1 },
          ])
        }
      >
        Ajouter{" "}
        {kind === "options"
          ? "une option"
          : kind === "milestones"
            ? "un jalon"
            : "un message"}
      </button>
      {kind === "steps" && (
        <p className="caption">
          Variables : {"{{display_name}}"}, {"{{email}}"}, {"{{domain}}"}. Le
          premier délai part de l’inscription.
        </p>
      )}
    </div>
  );
}
export function WorkflowFields({
  name,
  initial,
}: {
  name: string;
  initial?: unknown;
}) {
  const { objects } = useWorkspace();
  const members = useRows("memberships", { size: 100 });
  const [value, setValue] = useState<WorkflowDefinition>(
    (initial ?? {
      object_id: objects[0]?.id,
      conditions: [],
      actions: [{ type: "task", title: "Contacter le client", days: 1 }],
    }) as WorkflowDefinition,
  );
  const changeCondition = (index: number, patch: Entry) =>
    setValue({
      ...value,
      conditions: value.conditions.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  const changeAction = (index: number, patch: Entry) =>
    setValue({
      ...value,
      actions: value.actions.map((row, i) =>
        i === index ? { ...row, ...patch } : row,
      ),
    });
  return (
    <div className="stack">
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      <label>
        Type de fiches
        <select
          value={value.object_id}
          onChange={(e) => setValue({ ...value, object_id: e.target.value })}
        >
          {objects.map((object) => (
            <option key={object.id} value={object.id}>
              {object.name}
            </option>
          ))}
        </select>
      </label>
      <h3>Conditions · toutes doivent être respectées</h3>
      {value.conditions.map((condition, index) => (
        <div className="detail-card" key={index}>
          <label>
            Information
            <select
              value={condition.field}
              onChange={(e) =>
                changeCondition(index, { field: e.target.value })
              }
            >
              {[
                ["stage", "Étape"],
                ["amount", "Montant"],
                ["email", "Email"],
                ["domain", "Domaine"],
                ["display_name", "Nom"],
                ["close_date", "Clôture prévue"],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comparaison
            <select
              value={condition.operator}
              onChange={(e) =>
                changeCondition(index, { operator: e.target.value })
              }
            >
              {[
                ["equals", "Est égal à"],
                ["contains", "Contient"],
                ["gt", "Supérieur à"],
                ["lt", "Inférieur à"],
                ["exists", "Est renseigné"],
              ].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {condition.operator !== "exists" && (
            <label>
              Valeur
              <input
                value={String(condition.value ?? "")}
                onChange={(e) =>
                  changeCondition(index, { value: e.target.value })
                }
              />
            </label>
          )}
          <button
            type="button"
            className="button small"
            onClick={() =>
              setValue({
                ...value,
                conditions: value.conditions.filter((_, i) => i !== index),
              })
            }
          >
            Retirer cette condition
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={value.conditions.length >= 20}
        onClick={() =>
          setValue({
            ...value,
            conditions: [
              ...value.conditions,
              { field: "stage", operator: "equals", value: "Nouveau" },
            ],
          })
        }
      >
        Ajouter une condition
      </button>
      <h3>Actions</h3>
      {value.actions.map((action, index) => (
        <div className="detail-card" key={index}>
          <label>
            Action
            <select
              value={action.type}
              onChange={(e) =>
                changeAction(
                  index,
                  e.target.value === "task"
                    ? { type: "task", title: "Contacter le client", days: 1 }
                    : {
                        type: "set_field",
                        field: "stage",
                        value: "Qualification",
                      },
                )
              }
            >
              <option value="task">Créer une tâche</option>
              <option value="set_field">Modifier une information</option>
              {action.type === "email" && (
                <option value="email">Email existant · non exécuté</option>
              )}
            </select>
          </label>
          {action.type === "task" ? (
            <>
              <label>
                Titre de la tâche
                <input
                  required
                  value={action.title ?? ""}
                  onChange={(e) =>
                    changeAction(index, { title: e.target.value })
                  }
                />
              </label>
              <label>
                Échéance dans (jours)
                <input
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  value={action.days ?? 1}
                  onChange={(e) =>
                    changeAction(index, { days: Number(e.target.value) })
                  }
                />
              </label>
            </>
          ) : action.type === "set_field" ? (
            <>
              <label>
                Information
                <select
                  value={action.field}
                  onChange={(e) =>
                    changeAction(index, {
                      field: e.target.value,
                      value: e.target.value === "stage" ? "Qualification" : "",
                    })
                  }
                >
                  <option value="stage">Étape</option>
                  <option value="close_date">Clôture prévue</option>
                  <option value="owner_id">Responsable</option>
                </select>
              </label>
              {action.field === "stage" ? (
                <label>
                  Nouvelle étape
                  <select
                    value={action.value ?? ""}
                    onChange={(e) =>
                      changeAction(index, { value: e.target.value })
                    }
                  >
                    <option value="">Choisir une étape</option>
                    {stages.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>
              ) : action.field === "owner_id" ? (
                <label>
                  Responsable
                  <select
                    value={action.value ?? ""}
                    onChange={(e) =>
                      changeAction(index, { value: e.target.value })
                    }
                  >
                    <option value="">Sans responsable</option>
                    {members.data?.data.map((member) => (
                      <option key={member.id} value={String(member.user_id)}>
                        {String(member.display_name || member.user_id)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <DatePicker
                  key={index + "-" + action.field}
                  name={"workflow-date-" + index}
                  label="Clôture prévue"
                  defaultValue={action.value ?? ""}
                  onValueChange={(value) => changeAction(index, { value })}
                />
              )}
            </>
          ) : (
            <p>
              Remplacez cette action par une tâche ou un changement
              d’information.
            </p>
          )}
          <button
            type="button"
            className="button small"
            disabled={value.actions.length <= 1}
            onClick={() =>
              setValue({
                ...value,
                actions: value.actions.filter((_, i) => i !== index),
              })
            }
          >
            Retirer cette action
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={value.actions.length >= 20}
        onClick={() =>
          setValue({
            ...value,
            actions: [
              ...value.actions,
              { type: "task", title: "Contacter le client", days: 1 },
            ],
          })
        }
      >
        Ajouter une action
      </button>
    </div>
  );
}
