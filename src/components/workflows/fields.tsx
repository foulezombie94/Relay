"use client";
import { Plus, Trash2 } from "lucide-react";
import { useRows } from "../data-provider";
import { ErrorMessage } from "../ui";
import { DatePicker } from "../ui/date-picker";
import { useDestinations } from "./connections";
import { workflowVariables } from "@/lib/domain/workflow-variables";
import type { Attribute, Condition, Row, WorkflowAction } from "@/lib/domain/types";
import styles from "./workflows.module.css";

export const conditionFields = {
  stage: "Étape",
  amount: "Montant",
  probability: "Probabilité",
  email: "Email",
  domain: "Domaine",
  display_name: "Nom",
  close_date: "Clôture prévue",
  owner_id: "Responsable",
  pipeline_id: "Pipeline",
};
const operators: Record<Condition["operator"], string> = {
  equals: "Est égal à",
  not_equals: "Est différent de",
  contains: "Contient",
  gt: "Est supérieur à",
  lt: "Est inférieur à",
  exists: "Est renseigné",
  not_exists: "N’est pas renseigné",
  before: "Est avant",
  after: "Est après",
};
export function ConditionsEditor({
  value,
  mode = "all",
  objectId,
  onChange,
  onMode,
  outputs = false,
}: {
  value: Condition[];
  mode?: "all" | "any";
  objectId: string;
  onChange: (value: Condition[]) => void;
  onMode: (mode: "all" | "any") => void;
  outputs?: boolean;
}) {
  const attrs = useRows<Attribute>("attributes", { object_id: objectId, size: 100 });
  const fields = [
    ...Object.entries(conditionFields),
    ["event.subject", "Objet de l’événement"],
    ["event.kind", "Type d’événement"],
    ...(outputs
      ? [
          ["steps.analyse.intent", "Analyse IA · intention"],
          ["steps.analyse.confidence", "Analyse IA · confiance"],
          ["steps.analyse.summary", "Analyse IA · résumé"],
        ]
      : []),
    ...value
      .filter((c) => !Object.hasOwn(conditionFields, c.field) && !c.field.startsWith("attributes."))
      .map((c) => [c.field, c.field]),
    ...(attrs.data?.data.filter((a) => !a.archived).map((a) => ["attributes." + a.key, a.name]) ??
      []),
  ];
  const uniqueFields = [
    ...new Map(
      [
        ...fields,
        ...value
          .filter((condition) => !fields.some(([key]) => key === condition.field))
          .map((condition) => [condition.field, condition.field] as [string, string]),
      ].map(([key, label]) => [key, label] as const),
    ),
  ];
  return (
    <div className={styles.conditionEditor}>
      <label>
        Correspondance
        <select value={mode} onChange={(e) => onMode(e.target.value as "all" | "any")}>
          <option value="all">Toutes les conditions (ET)</option>
          <option value="any">Au moins une condition (OU)</option>
        </select>
      </label>
      <ErrorMessage error={attrs.error} />
      {value.map((c, i) => (
        <div key={i} className={styles.condition}>
          <label>
            Information
            <select
              value={c.field}
              onChange={(e) =>
                onChange(value.map((v, n) => (n === i ? { ...v, field: e.target.value } : v)))
              }
            >
              {uniqueFields.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comparaison
            {outputs && (
              <input
                aria-label="Chemin d’une sortie de bloc"
                value={c.field}
                maxLength={100}
                onChange={(e) =>
                  onChange(value.map((v, n) => (n === i ? { ...v, field: e.target.value } : v)))
                }
                placeholder="steps.analyse.intent"
              />
            )}
            <select
              value={c.operator}
              onChange={(e) =>
                onChange(
                  value.map((v, n) =>
                    n === i ? { ...v, operator: e.target.value as Condition["operator"] } : v,
                  ),
                )
              }
            >
              {Object.entries(operators).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {!["exists", "not_exists"].includes(c.operator) && (
            <label>
              Valeur
              {["before", "after"].includes(c.operator) ? (
                <DatePicker
                  key={String(c.value)}
                  name={"condition-date-" + i}
                  label="Date de comparaison"
                  defaultValue={String(c.value ?? "")}
                  onValueChange={(v) =>
                    onChange(value.map((old, n) => (n === i ? { ...old, value: v } : old)))
                  }
                />
              ) : (
                <input
                  maxLength={300}
                  value={String(c.value ?? "")}
                  placeholder={c.field === "stage" ? "Qualification" : "Valeur à comparer"}
                  onChange={(e) =>
                    onChange(value.map((v, n) => (n === i ? { ...v, value: e.target.value } : v)))
                  }
                />
              )}
            </label>
          )}
          <button
            className="button small"
            type="button"
            onClick={() => onChange(value.filter((_, n) => n !== i))}
          >
            <Trash2 size={13} />
            Retirer
          </button>
        </div>
      ))}
      {!value.length && (
        <p className="caption">Toutes les fiches de ce type remplissent les critères.</p>
      )}
      <button
        className="button small"
        type="button"
        disabled={value.length >= 20}
        onClick={() =>
          onChange([...value, { field: "stage", operator: "equals", value: "Qualification" }])
        }
      >
        <Plus size={13} />
        Ajouter une condition
      </button>
    </div>
  );
}
export function ActionEditor({
  action: a,
  objectId,
  onChange,
}: {
  action: WorkflowAction;
  objectId: string;
  onChange: (action: WorkflowAction) => void;
}) {
  const members = useRows<Row>("memberships", { size: 100 });
  const lists = useRows<Row>("lists", { object_id: objectId, size: 100 });
  const destinations = useDestinations();
  const patch = (value: Partial<WorkflowAction>) => onChange({ ...a, ...value });
  return (
    <div className={styles.actionEditor}>
      {["task", "commitment", "note", "calendar", "notify"].includes(a.type) && (
        <label>
          Titre
          <input
            required
            maxLength={300}
            value={a.title ?? ""}
            onChange={(e) => patch({ title: e.target.value })}
          />
        </label>
      )}
      {["task", "commitment", "notify"].includes(a.type) && (
        <>
          <label>
            Échéance après l’action (jours)
            <input
              type="number"
              min={0}
              max={365}
              value={a.days ?? 1}
              onChange={(e) => patch({ days: Number(e.target.value) })}
            />
          </label>
          <label>
            Responsable
            <select
              value={a.owner ?? "record"}
              onChange={(e) => patch({ owner: e.target.value as WorkflowAction["owner"] })}
            >
              <option value="record">Responsable de la fiche</option>
              <option value="runner">Personne qui lance ou publie</option>
              <option value="selected">Un membre précis</option>
            </select>
          </label>
          {a.owner === "selected" && (
            <label>
              Membre
              <select
                value={a.owner_id ?? ""}
                onChange={(e) => patch({ owner_id: e.target.value })}
              >
                <option value="">Choisir…</option>
                {members.data?.data
                  .filter((m) => m.role !== "viewer")
                  .map((m) => (
                    <option key={m.id} value={String(m.user_id)}>
                      {String(m.display_name || "Membre")}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <ErrorMessage error={members.error} />
          <p className="caption">
            Si la fiche n’a pas de responsable, la personne qui lance ou publie est choisie.
          </p>
        </>
      )}
      {a.type === "commitment" && (
        <p className={styles.help}>
          L’engagement sera proposé. Un membre doit confirmer le périmètre et la date avec le
          client.
        </p>
      )}
      {a.type === "note" && (
        <>
          <label>
            Contenu
            <textarea
              required
              rows={6}
              maxLength={10000}
              value={a.body ?? ""}
              onChange={(e) => patch({ body: e.target.value })}
            />
          </label>
          <p className="caption">
            Cette note sera partagée sur la fiche. Les notes privées existantes restent privées.
          </p>
        </>
      )}
      {a.type === "delay" && (
        <>
          <label>
            Attendre (minutes)
            <input
              type="number"
              min={1}
              max={43200}
              value={a.minutes ?? 1440}
              onChange={(e) => patch({ minutes: Number(e.target.value) })}
            />
          </label>
          <div className={styles.presets}>
            {[
              [60, "1 heure"],
              [1440, "1 jour"],
              [2880, "2 jours"],
              [10080, "7 jours"],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                className="button small"
                onClick={() => patch({ minutes: Number(v) })}
              >
                {label}
              </button>
            ))}
          </div>
          <p className={styles.help}>
            Le workflow reprendra après ce délai, si les critères d’entrée sont toujours remplis.
            Aucun serveur ne reste occupé pendant l’attente.
          </p>
        </>
      )}
      {a.type === "set_field" && (
        <>
          <label>
            Information
            <select
              value={a.field ?? "stage"}
              onChange={(e) =>
                patch({
                  field: e.target.value,
                  value: e.target.value === "stage" ? "Qualification" : "",
                })
              }
            >
              <option value="stage">Étape</option>
              <option value="owner_id">Responsable</option>
              <option value="close_date">Clôture prévue</option>
              <option value="probability">Probabilité (%)</option>
            </select>
          </label>
          <label>
            Nouvelle valeur
            {a.field === "owner_id" ? (
              <select value={a.value ?? ""} onChange={(e) => patch({ value: e.target.value })}>
                <option value="">Non attribué</option>
                {members.data?.data
                  .filter((m) => m.role !== "viewer")
                  .map((m) => (
                    <option key={m.id} value={String(m.user_id)}>
                      {String(m.display_name || "Membre")}
                    </option>
                  ))}
              </select>
            ) : a.field === "close_date" ? (
              <DatePicker
                key={a.value}
                name="workflow-close-date"
                label="Clôture prévue"
                defaultValue={a.value}
                onValueChange={(value) => patch({ value })}
              />
            ) : (
              <input
                maxLength={80}
                type={a.field === "probability" ? "number" : "text"}
                min={0}
                max={100}
                value={a.value ?? ""}
                onChange={(e) => patch({ value: e.target.value })}
              />
            )}
          </label>
          {a.field === "stage" && (
            <p className="caption">Utilisez le nom exact d’une étape du pipeline de la fiche.</p>
          )}
          {a.field === "stage" && a.value === "Perdu" && (
            <label>
              Raison de perte
              <textarea
                required
                maxLength={2000}
                value={a.lost_reason ?? ""}
                onChange={(e) => patch({ lost_reason: e.target.value })}
              />
            </label>
          )}
        </>
      )}
      {a.type === "add_to_list" && (
        <>
          <label>
            Liste de destination
            <select value={a.list_id ?? ""} onChange={(e) => patch({ list_id: e.target.value })}>
              <option value="">Choisir une liste…</option>
              {lists.data?.data.map((l) => (
                <option key={l.id} value={l.id}>
                  {String(l.name)}
                </option>
              ))}
            </select>
          </label>
          <ErrorMessage error={lists.error} />
          <p className="caption">
            La liste doit accepter ce type de fiche. Une fiche déjà présente ne sera pas ajoutée
            deux fois.
          </p>
        </>
      )}
      {a.type === "branch" && (
        <>
          <ConditionsEditor
            outputs
            value={a.conditions ?? []}
            mode={a.condition_mode}
            objectId={objectId}
            onChange={(conditions) => patch({ conditions })}
            onMode={(condition_mode) => patch({ condition_mode })}
          />
          <p className={styles.help}>
            Oui exécute la branche de gauche ; Non celle de droite. Les deux branches rejoignent
            ensuite la suite du workflow.
          </p>
        </>
      )}
      {["email", "calendar"].includes(a.type) && (
        <>
          <label>
            Compte d’exécution
            <select
              value={a.provider ?? (a.type === "email" ? "gmail" : "google-calendar")}
              onChange={(e) => patch({ provider: e.target.value as WorkflowAction["provider"] })}
            >
              {(a.type === "email"
                ? [
                    ["gmail", "Gmail"],
                    ["outlook", "Outlook"],
                  ]
                : [
                    ["google-calendar", "Google Calendar"],
                    ["outlook-calendar", "Outlook Calendar"],
                  ]
              ).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.help}>
            Le compte de la personne qui publie ou lance le workflow est utilisé. Pour créer des
            événements, reconnectez le calendrier pour autoriser l’écriture.
          </p>
        </>
      )}
      {a.type === "email" && (
        <>
          <label>
            Destinataire
            <input
              required
              maxLength={300}
              value={a.to ?? ""}
              onChange={(e) => patch({ to: e.target.value })}
              placeholder="{{contact.email}}"
            />
          </label>
          <label>
            Objet
            <input
              required
              maxLength={300}
              value={a.subject ?? ""}
              onChange={(e) => patch({ subject: e.target.value })}
            />
          </label>
        </>
      )}
      {a.type === "calendar" && (
        <>
          <label>
            Date de début
            <DatePicker
              key={a.id}
              name="event-start"
              label="Date et heure"
              withTime
              defaultValue={a.starts_at}
              onValueChange={(v) => patch({ starts_at: v ? new Date(v).toISOString() : "" })}
            />
          </label>
          <label>
            Durée (minutes)
            <input
              type="number"
              min={5}
              max={1440}
              value={a.duration_minutes ?? 30}
              onChange={(e) => patch({ duration_minutes: Number(e.target.value) })}
            />
          </label>
          <p className="caption">
            Crée un événement dans le calendrier principal. Aucun invité externe n’est ajouté
            automatiquement.
          </p>
        </>
      )}
      {["slack", "webhook"].includes(a.type) && (
        <>
          <label>
            Destination
            <select
              required
              value={a.destination_id ?? ""}
              onChange={(e) => patch({ destination_id: e.target.value })}
            >
              <option value="">Choisir une connexion…</option>
              {destinations.data?.data
                .filter((d) => d.kind === a.type && d.enabled)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </select>
          </label>
          <ErrorMessage error={destinations.error} />
          <p className="caption">
            Configurez la destination dans l’onglet Connexions. Un webhook reçoit un objet JSON et
            une clé Idempotency-Key.
          </p>
        </>
      )}
      {["email", "calendar", "slack", "webhook"].includes(a.type) && (
        <label>
          {a.type === "webhook" ? "Corps JSON" : "Message / description"}
          <textarea
            required={a.type !== "calendar"}
            rows={6}
            maxLength={10000}
            value={a.body ?? ""}
            onChange={(e) => patch({ body: e.target.value })}
          />
        </label>
      )}
      {a.type === "ai" && (
        <>
          <label>
            Instructions
            <textarea
              rows={3}
              required
              maxLength={2000}
              value={a.instruction ?? ""}
              onChange={(e) => patch({ instruction: e.target.value })}
            />
          </label>
          <label>
            Texte à analyser
            <textarea
              rows={5}
              required
              maxLength={6000}
              value={a.input ?? ""}
              onChange={(e) => patch({ input: e.target.value })}
              placeholder="{{event.body}}"
            />
          </label>
          <p className={styles.help}>
            Résultat structuré : summary, intent (interested, question, not_interested, other),
            next_action et confidence (0 à 1). Aucun envoi n’est décidé par l’IA seule.
          </p>
        </>
      )}
      {a.type === "wait_until" && (
        <>
          <label>
            Attendre jusqu’à
            <select
              value={a.wait_mode ?? "condition"}
              onChange={(e) => patch({ wait_mode: e.target.value as WorkflowAction["wait_mode"] })}
            >
              <option value="condition">Une condition est remplie</option>
              <option value="date">Une date et une heure</option>
              <option value="email_reply">Une réponse email du contact</option>
            </select>
          </label>
          {a.wait_mode === "date" && (
            <DatePicker
              key={a.id}
              name="wait-until"
              label="Date attendue"
              withTime
              defaultValue={a.until}
              onValueChange={(v) => patch({ until: v ? new Date(v).toISOString() : "" })}
            />
          )}{" "}
          {a.wait_mode === "condition" && (
            <ConditionsEditor
              outputs
              value={a.conditions ?? []}
              mode={a.condition_mode}
              objectId={objectId}
              onChange={(conditions) => patch({ conditions })}
              onMode={(condition_mode) => patch({ condition_mode })}
            />
          )}
          <label>
            Délai maximal (minutes)
            <input
              required
              type="number"
              min={1}
              max={43200}
              value={a.timeout_minutes ?? 10080}
              onChange={(e) => patch({ timeout_minutes: Number(e.target.value) })}
            />
          </label>
          <label>
            Si le délai maximal est dépassé
            <select
              value={a.timeout_behavior ?? "stop"}
              onChange={(e) =>
                patch({ timeout_behavior: e.target.value as WorkflowAction["timeout_behavior"] })
              }
            >
              <option value="stop">Arrêter avec une erreur explicite</option>
              <option value="continue">Continuer le processus</option>
            </select>
          </label>
          <p className="caption">
            Une réponse doit être reçue après l’entrée dans ce bloc, depuis l’email de la fiche, sur
            le compte d’exécution. La synchronisation email doit être active.
          </p>
        </>
      )}
      {a.type !== "branch" && (
        <label>
          Nom de sortie (variables)
          <input
            maxLength={40}
            pattern="[a-z][a-z0-9_]*"
            required={a.type === "ai"}
            value={a.alias ?? ""}
            placeholder="analyse"
            onChange={(e) => {
              const next = { ...a };
              if (e.target.value) next.alias = e.target.value;
              else delete next.alias;
              onChange(next);
            }}
          />
          <small>Exemple : {"{{steps.analyse.summary}}"}. Un nom unique, en minuscules.</small>
        </label>
      )}
      <details className={styles.help}>
        <summary>Variables disponibles</summary>
        <p>
          Copiez une variable dans un champ texte. Les informations liées à la fiche et les
          résultats de blocs précédents sont lus au moment de l’exécution.
        </p>
        {workflowVariables.map((v) => (
          <code key={v}>
            {`{{${v}}}`}
            <br />
          </code>
        ))}
        <p>
          Pour une autre sortie : {"{{steps.nom_de_sortie.entity_id}}"}. Dans une condition,
          utilisez le chemin sans accolades.
        </p>
      </details>
    </div>
  );
}
