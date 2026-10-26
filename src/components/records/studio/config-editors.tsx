"use client";
import Link from "next/link";
import { ArrowUp, ArrowDown, Plus, Pin, X, GripVertical, Repeat2, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import type { StudioInput, StudioConfig } from "@/lib/domain/record-studio";
import type { ObjectDefinition, Row, Workflow } from "@/lib/domain/types";
import { RecordPicker } from "../picker";
import {
  formFields,
  questionType,
  sectionNames,
  localInZone,
  zonedIso,
  type StudioField,
} from "./fields";
import styles from "./studio.module.css";
type Spec<K extends StudioInput["kind"]> = Extract<StudioInput, { kind: K }>["config"];
export function Check({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
export function OrderButtons({
  index,
  length,
  onMove,
  onRemove,
}: {
  index: number;
  length: number;
  onMove: (delta: number) => void;
  onRemove?: () => void;
}) {
  return (
    <span className={styles.order}>
      <button
        type="button"
        className="icon-button"
        aria-label="Monter"
        disabled={!index}
        onClick={() => onMove(-1)}
      >
        <ArrowUp size={13} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Descendre"
        disabled={index === length - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDown size={13} />
      </button>
      {onRemove && (
        <button type="button" className="icon-button" aria-label="Retirer" onClick={onRemove}>
          <X size={14} />
        </button>
      )}
    </span>
  );
}
export function move<T>(list: T[], index: number, delta: number) {
  const result = [...list];
  [result[index], result[index + delta]] = [result[index + delta], result[index]];
  return result;
}
export function LayoutEditor({
  value,
  onChange,
  fields,
  company,
}: {
  value: Spec<"layout">;
  onChange: (v: Spec<"layout">) => void;
  fields: StudioField[];
  company: boolean;
}) {
  return (
    <>
      <section className={styles.editorSection}>
        <h3>
          <Pin size={15} /> Informations épinglées
        </h3>
        <p>Visibles sous le titre de chaque fiche. Jusqu’à 15 propriétés.</p>
        <div className={styles.choices}>
          {fields.map((f) => (
            <Check
              key={f.key}
              checked={value.pinned.includes(f.key)}
              disabled={value.pinned.length >= 15 && !value.pinned.includes(f.key)}
              onChange={(v) =>
                onChange({
                  ...value,
                  pinned: v ? [...value.pinned, f.key] : value.pinned.filter((k) => k !== f.key),
                })
              }
            >
              {f.label}
            </Check>
          ))}
        </div>
      </section>
      <section className={styles.editorSection}>
        <h3>Groupes de propriétés</h3>
        {value.groups.map((group, index) => (
          <div className={styles.groupEditor} key={group.id}>
            <div className={styles.row}>
              <GripVertical size={14} />
              <input
                aria-label="Nom du groupe"
                value={group.title}
                maxLength={160}
                onChange={(e) =>
                  onChange({
                    ...value,
                    groups: value.groups.map((g, i) =>
                      i === index ? { ...g, title: e.target.value } : g,
                    ),
                  })
                }
              />
              <OrderButtons
                index={index}
                length={value.groups.length}
                onMove={(delta) => onChange({ ...value, groups: move(value.groups, index, delta) })}
                onRemove={() =>
                  onChange({ ...value, groups: value.groups.filter((_, i) => i !== index) })
                }
              />
            </div>
            <div className={styles.choices}>
              {fields.map((f) => (
                <Check
                  key={f.key}
                  checked={group.fields.includes(f.key)}
                  onChange={(v) =>
                    onChange({
                      ...value,
                      groups: value.groups.map((g, i) =>
                        i === index
                          ? {
                              ...g,
                              fields: v
                                ? [...g.fields, f.key]
                                : g.fields.filter((k) => k !== f.key),
                            }
                          : g,
                      ),
                    })
                  }
                >
                  {f.label}
                </Check>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="button small"
          disabled={value.groups.length >= 12}
          onClick={() =>
            onChange({
              ...value,
              groups: [
                ...value.groups,
                { id: crypto.randomUUID(), title: "Nouveau groupe", fields: [] },
              ],
            })
          }
        >
          <Plus size={14} /> Ajouter un groupe
        </button>
      </section>
      <section className={styles.editorSection}>
        <h3>Sections de la fiche</h3>
        <p>Affichez et ordonnez les vues liées à la fiche ouverte.</p>
        {value.sections.map((section, index) => (
          <div className={styles.row} key={section}>
            <GripVertical size={14} />
            <span className={styles.grow}>{sectionNames[section]}</span>
            <OrderButtons
              index={index}
              length={value.sections.length}
              onMove={(delta) =>
                onChange({ ...value, sections: move(value.sections, index, delta) })
              }
              onRemove={
                value.sections.length > 1
                  ? () =>
                      onChange({ ...value, sections: value.sections.filter((k) => k !== section) })
                  : undefined
              }
            />
          </div>
        ))}
        <select
          aria-label="Ajouter une section"
          value=""
          onChange={(e) =>
            onChange({
              ...value,
              sections: [...value.sections, e.target.value as Spec<"layout">["sections"][number]],
            })
          }
        >
          <option value="">+ Ajouter une section</option>
          {Object.entries(sectionNames)
            .filter(
              ([key]) =>
                !value.sections.includes(key as Spec<"layout">["sections"][number]) &&
                (company || !["contacts", "deals"].includes(key)),
            )
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </select>
      </section>
      <Check checked={value.details} onChange={(details) => onChange({ ...value, details })}>
        Afficher les groupes dans un panneau de détails à droite
      </Check>
      <div className={styles.layoutPreview} aria-label="Aperçu de la disposition">
        <small>APERÇU DE LA FICHE</small>
        <h3>Nom de la fiche</h3>
        <div className={styles.previewPins}>
          {value.pinned.map((k) => (
            <span key={k}>{fields.find((f) => f.key === k)?.label}</span>
          ))}
        </div>
        <div className={styles.previewBody} data-side={value.details}>
          <div>
            {value.sections.map((k) => (
              <div className={styles.previewLine} key={k}>
                {sectionNames[k]}
              </div>
            ))}
          </div>
          <aside>
            {value.groups.map((g) => (
              <div key={g.id}>
                <strong>{g.title}</strong>
                {g.fields.map((k) => (
                  <span key={k}>
                    {fields.find((f) => f.key === k)?.label}
                    <i>Vide</i>
                  </span>
                ))}
              </div>
            ))}
          </aside>
        </div>
      </div>
    </>
  );
}
export function RelationEditor({
  value,
  onChange,
  objects,
}: {
  value: Spec<"relation">;
  onChange: (v: Spec<"relation">) => void;
  objects: ObjectDefinition[];
}) {
  return (
    <>
      <label>
        Relier à
        <select
          value={value.target_object_id}
          onChange={(e) => onChange({ ...value, target_object_id: e.target.value })}
        >
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Limite
        <select
          value={value.multiple ? "many" : "one"}
          onChange={(e) => onChange({ ...value, multiple: e.target.value === "many" })}
        >
          <option value="many">Aucune limite · plusieurs fiches</option>
          <option value="one">Une seule fiche</option>
        </select>
      </label>
      <Check checked={value.inverse} onChange={(inverse) => onChange({ ...value, inverse })}>
        Afficher la relation dans l’autre sens
      </Check>
      {value.inverse && (
        <div className={styles.groupEditor}>
          <label>
            Nom de la relation réciproque
            <input
              value={value.inverse_name}
              maxLength={160}
              onChange={(e) => onChange({ ...value, inverse_name: e.target.value })}
            />
          </label>
          <label>
            Limite réciproque
            <select
              value={value.inverse_multiple ? "many" : "one"}
              onChange={(e) => onChange({ ...value, inverse_multiple: e.target.value === "many" })}
            >
              <option value="many">Aucune limite</option>
              <option value="one">Une seule fiche</option>
            </select>
          </label>
        </div>
      )}
      <p className={styles.note}>
        <Link2 size={15} /> Les deux côtés sont synchronisés dès qu’une fiche est liée ou retirée.
      </p>
    </>
  );
}
export function RollupEditor({
  value,
  onChange,
  relations,
}: {
  value: Spec<"rollup">;
  onChange: (v: Spec<"rollup">) => void;
  relations: StudioConfig[];
}) {
  return (
    <>
      <label>
        Relation
        <select
          required
          value={value.relation_id}
          onChange={(e) => onChange({ ...value, relation_id: e.target.value })}
        >
          <option value="">Sélectionner une relation…</option>
          {relations.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Calculer
        <select
          value={value.calculation}
          onChange={(e) =>
            onChange({ ...value, calculation: e.target.value as Spec<"rollup">["calculation"] })
          }
        >
          <option value="count">Compter les fiches liées</option>
          <option value="sum_amount">Somme des montants · par devise</option>
          <option value="next_due">Prochaine échéance des tâches liées</option>
        </select>
      </label>
      {relations.some(
        (r) =>
          r.id === value.relation_id &&
          r.kind === "relation" &&
          r.object_id === r.config.target_object_id &&
          r.config.inverse,
      ) && (
        <label>
          Sens de la relation
          <select
            value={value.relation_side}
            onChange={(e) =>
              onChange({ ...value, relation_side: e.target.value as "source" | "target" })
            }
          >
            <option value="source">Relation principale</option>
            <option value="target">Relation réciproque</option>
          </select>
        </label>
      )}
      <p className={styles.note}>
        Le calcul se met à jour avec les données des fiches liées. Les devises sont conservées
        séparément.
      </p>
    </>
  );
}
export function ButtonEditor({
  value,
  onChange,
  workflows,
}: {
  value: Spec<"button">;
  onChange: (v: Spec<"button">) => void;
  workflows: Workflow[];
}) {
  return (
    <>
      <label>
        Workflow à exécuter
        <select
          required
          value={value.workflow_id}
          onChange={(e) => onChange({ ...value, workflow_id: e.target.value })}
        >
          <option value="">Sélectionner un workflow…</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Message avant confirmation
        <textarea
          value={value.confirmation}
          maxLength={500}
          onChange={(e) => onChange({ ...value, confirmation: e.target.value })}
        />
      </label>
      <p className={styles.note}>
        Le bouton prépare les actions pour la fiche ouverte. Vous relisez l’aperçu avant de
        confirmer leur lancement.
      </p>
      <Link className="button small" href="/app/workflows">
        Gérer les workflows
      </Link>
    </>
  );
}
function DefaultValue({
  field,
  value,
  onChange,
  members,
}: {
  field: StudioField;
  value: unknown;
  onChange: (value: unknown) => void;
  members: Row[];
}) {
  if (field.type === "boolean")
    return (
      <Check checked={value === true} onChange={onChange}>
        Oui
      </Check>
    );
  if (["user", "select"].includes(field.type))
    return (
      <select
        aria-label={field.label}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Non défini</option>
        {field.type === "user"
          ? members.map((m) => (
              <option key={String(m.user_id)} value={String(m.user_id)}>
                {String(m.display_name || m.user_id)}
              </option>
            ))
          : field.options.map((option) => <option key={option}>{option}</option>)}
      </select>
    );
  if (field.type === "relation")
    return (
      <RecordPicker name={field.key} initial={value} onChange={(id) => onChange(id || null)} />
    );
  if (field.type === "multi_select")
    return (
      <div className={styles.choices}>
        {field.options.map((option) => (
          <Check
            key={option}
            checked={Array.isArray(value) && value.includes(option)}
            onChange={(checked) =>
              onChange(
                checked
                  ? [...(Array.isArray(value) ? value : []), option]
                  : (Array.isArray(value) ? value : []).filter((v) => v !== option),
              )
            }
          >
            {option}
          </Check>
        ))}
      </div>
    );
  return (
    <input
      aria-label={field.label}
      type={
        ["number", "money"].includes(field.type)
          ? "number"
          : field.type === "date"
            ? "date"
            : field.type === "email"
              ? "email"
              : "text"
      }
      value={String(value ?? "")}
      placeholder="Non défini"
      onChange={(e) =>
        onChange(
          e.target.value === ""
            ? undefined
            : ["number", "money"].includes(field.type)
              ? Number(e.target.value)
              : e.target.value,
        )
      }
    />
  );
}
export function TemplateEditor({
  value,
  onChange,
  fields,
  members,
  onError,
}: {
  value: Spec<"template">;
  onChange: (v: Spec<"template">) => void;
  fields: StudioField[];
  members: Row[];
  onError: (s: string) => void;
}) {
  return (
    <>
      <section className={styles.editorSection}>
        <h3>Propriétés prédéfinies</h3>
        <p>Les champs laissés vides seront complétés lors de la création.</p>
        {fields
          .filter((f) => f.type !== "formula")
          .map((f) => (
            <div className={styles.propertyDefault} key={f.key}>
              <span>{f.label}</span>
              <DefaultValue
                field={f}
                members={members}
                value={
                  f.key.startsWith("attr_")
                    ? value.values.attributes?.[f.key.slice(5)]
                    : value.values[f.key as keyof typeof value.values]
                }
                onChange={(v) =>
                  onChange({
                    ...value,
                    values: f.key.startsWith("attr_")
                      ? {
                          ...value.values,
                          attributes: { ...value.values.attributes, [f.key.slice(5)]: v },
                        }
                      : { ...value.values, [f.key]: v },
                  })
                }
              />
            </div>
          ))}
      </section>
      <label>
        Contenu de la fiche
        <textarea
          rows={5}
          placeholder="Contexte, objectifs, compte rendu…"
          maxLength={10000}
          value={value.content}
          onChange={(e) => onChange({ ...value, content: e.target.value })}
        />
      </label>
      <label>
        Checklist · une étape par ligne
        <textarea
          rows={4}
          maxLength={12000}
          value={value.checklist.join("\n")}
          placeholder={"Vérifier les coordonnées\nPréparer la prochaine action"}
          onChange={(e) => onChange({ ...value, checklist: e.target.value.split("\n") })}
        />
      </label>
      <section className={styles.editorSection}>
        <h3>
          <Repeat2 size={15} /> Répéter ce modèle
        </h3>
        <select
          aria-label="Fréquence"
          value={value.repeat}
          onChange={(e) =>
            onChange({
              ...value,
              repeat: e.target.value as Spec<"template">["repeat"],
              repeat_start: e.target.value === "none" ? null : value.repeat_start,
            })
          }
        >
          <option value="none">Ne pas répéter</option>
          <option value="daily">Tous les jours</option>
          <option value="weekly">Toutes les semaines</option>
          <option value="monthly">Tous les mois</option>
        </select>
        {value.repeat !== "none" && (
          <>
            <label>
              Première création
              <input
                type="datetime-local"
                required
                value={localInZone(value.repeat_start, value.timezone)}
                onChange={(e) => {
                  try {
                    onChange({ ...value, repeat_start: zonedIso(e.target.value, value.timezone) });
                  } catch (error) {
                    onError(error instanceof Error ? error.message : "Date invalide");
                  }
                }}
              />
            </label>
            <label>
              Fuseau horaire
              <select
                value={value.timezone}
                onChange={(e) => onChange({ ...value, timezone: e.target.value })}
              >
                {Array.from(
                  new Set([
                    value.timezone,
                    "Europe/Paris",
                    "Europe/London",
                    "America/New_York",
                    "America/Montreal",
                    "UTC",
                  ]),
                ).map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
            </label>
            <p className={styles.note}>
              Chaque occurrence crée une nouvelle fiche complète avec ses propriétés, son contenu et
              sa checklist.
            </p>
          </>
        )}
      </section>
    </>
  );
}
export function FormEditor({
  value,
  onChange,
  fields,
}: {
  value: Spec<"form">;
  onChange: (v: Spec<"form">) => void;
  fields: StudioField[];
}) {
  const available = formFields(fields);
  return (
    <>
      <label>
        Description
        <textarea
          rows={2}
          maxLength={2000}
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
      </label>
      {value.questions.map((q, index) => {
        const patch = (changes: Partial<typeof q>) =>
          onChange({
            ...value,
            questions: value.questions.map((item, i) =>
              i === index ? { ...item, ...changes } : item,
            ),
          });
        return (
          <section className={styles.questionEditor} key={q.id}>
            <div className={styles.row}>
              <GripVertical size={15} />
              <strong className={styles.grow}>Question {index + 1}</strong>
              <OrderButtons
                index={index}
                length={value.questions.length}
                onMove={(delta) =>
                  onChange({ ...value, questions: move(value.questions, index, delta) })
                }
                onRemove={
                  q.property !== "display_name"
                    ? () =>
                        onChange({
                          ...value,
                          questions: value.questions
                            .filter((item) => item.id !== q.id)
                            .map((item) =>
                              item.show_if?.question_id === q.id
                                ? { ...item, show_if: null }
                                : item,
                            ),
                        })
                    : undefined
                }
              />
            </div>
            <label>
              Question
              <input
                value={q.label}
                maxLength={160}
                onChange={(e) => patch({ label: e.target.value })}
              />
            </label>
            <label>
              Propriété connectée
              <select
                value={q.property}
                disabled={q.property === "display_name"}
                onChange={(e) => {
                  const f = available.find((f) => f.key === e.target.value)!;
                  patch({ property: f.key, type: questionType(f), options: f.options });
                }}
              >
                {available
                  .filter(
                    (f) =>
                      f.key === q.property ||
                      !value.questions.some((item) => item.property === f.key),
                  )
                  .map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Aide à la réponse
              <input
                value={q.description}
                maxLength={500}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            {q.type === "text" || q.type === "textarea" ? (
              <Check
                checked={q.type === "textarea"}
                onChange={(v) => patch({ type: v ? "textarea" : "text" })}
              >
                Réponse longue
              </Check>
            ) : null}
            <Check
              checked={q.required}
              disabled={q.property === "display_name"}
              onChange={(required) => patch({ required })}
            >
              Réponse obligatoire
            </Check>
            {index > 0 && q.property !== "display_name" && (
              <>
                <label>
                  Afficher cette question
                  <select
                    value={q.show_if?.question_id ?? ""}
                    onChange={(e) =>
                      patch({
                        show_if: e.target.value ? { question_id: e.target.value, value: "" } : null,
                      })
                    }
                  >
                    <option value="">Toujours</option>
                    {value.questions
                      .slice(0, index)
                      .filter((prev) => ["select", "checkbox"].includes(prev.type))
                      .map((prev) => (
                        <option key={prev.id} value={prev.id}>
                          Si « {prev.label} »…
                        </option>
                      ))}
                  </select>
                </label>
                {q.show_if && (
                  <label>
                    Réponse égale à
                    <select
                      value={q.show_if.value}
                      onChange={(e) => patch({ show_if: { ...q.show_if!, value: e.target.value } })}
                    >
                      <option value="">Choisir une réponse…</option>
                      {(value.questions.find((prev) => prev.id === q.show_if!.question_id)?.type ===
                      "checkbox"
                        ? ["true", "false"]
                        : (value.questions.find((prev) => prev.id === q.show_if!.question_id)
                            ?.options ?? [])
                      ).map((option) => (
                        <option key={option} value={option}>
                          {option === "true" ? "Oui" : option === "false" ? "Non" : option}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </section>
        );
      })}
      <button
        className="button small"
        type="button"
        disabled={
          value.questions.length >= 40 ||
          available.every((f) => value.questions.some((q) => q.property === f.key))
        }
        onClick={() => {
          const f = available.find((f) => !value.questions.some((q) => q.property === f.key));
          if (f)
            onChange({
              ...value,
              questions: [
                ...value.questions,
                {
                  id: crypto.randomUUID(),
                  property: f.key,
                  label: f.label,
                  description: "",
                  type: questionType(f),
                  required: !!f.required,
                  options: f.options,
                  show_if: null,
                },
              ],
            });
        }}
      >
        <Plus size={14} /> Ajouter une question
      </button>
      <label>
        Texte du bouton
        <input
          maxLength={160}
          value={value.submit_label}
          onChange={(e) => onChange({ ...value, submit_label: e.target.value })}
        />
      </label>
      <label>
        Message de confirmation
        <input
          maxLength={160}
          value={value.success_message}
          onChange={(e) => onChange({ ...value, success_message: e.target.value })}
        />
      </label>
      <Check checked={value.published} onChange={(published) => onChange({ ...value, published })}>
        Publier le formulaire · toute personne avec le lien peut répondre
      </Check>
    </>
  );
}
