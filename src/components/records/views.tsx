"use client";
import { useState } from "react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { Editor, ErrorMessage, type Field, str } from "../ui";
import { defaultRecordView, normalizeView, type ViewConfig } from "@/lib/domain/views";
import type { ObjectDefinition, Attribute } from "@/lib/domain/types";
import { stages } from "@/lib/domain/types";
export function RecordViews({
  object,
  attributes,
  config,
  mode,
  onChange,
  onMode,
}: {
  object: ObjectDefinition;
  attributes: Attribute[];
  config: ViewConfig;
  mode: string;
  onChange: (v: ViewConfig) => void;
  onMode: (v: string) => void;
}) {
  const { workspace } = useWorkspace();
  const views = useRows("views", { object_id: object.id, size: 100 });
  const members = useRows("memberships", { size: 100 });
  const { save, remove, busy } = useSave();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const [updating, setUpdating] = useState(false);
  const current = views.data?.data.find((v) => v.id === selected);
  const modified =
    current &&
    (JSON.stringify({
      ...normalizeView(current.config, object.slug === "deals"),
      layout: mode,
    }) !== JSON.stringify({ ...config, layout: mode }) ||
      (normalizeView(current.config, object.slug === "deals").layout ?? current.type) !== mode);
  const salesFields = !object.standard || object.slug === "deals";
  const columns = [
    { key: "display_name", label: "Nom" },
    { key: "email", label: "Email" },
    { key: "domain", label: "Site" },
    ...(salesFields
      ? [
          { key: "amount", label: "Montant" },
          { key: "stage", label: "Étape" },
          { key: "close_date", label: "Clôture" },
        ]
      : []),
    ...attributes.map((a) => ({ key: "attr_" + a.key, label: a.name })),
  ];
  const field: Field = {
    key: "name",
    label: "Nom de la vue partagée",
    required: true,
  };
  return (
    <>
      <div className="view-toolbar">
        <select
          aria-label="Vue sauvegardée"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const row = views.data?.data.find((v) => v.id === e.target.value);
            const loaded = row
              ? normalizeView(row.config, object.slug === "deals")
              : defaultRecordView(object.slug);
            const allowed = new Set([
              "display_name",
              "email",
              "domain",
              ...(salesFields ? ["amount", "stage", "close_date"] : []),
              ...attributes.map((a) => "attr_" + a.key),
            ]);
            const visible = loaded.columns.filter((c) => allowed.has(c));
            onChange({
              ...loaded,
              stage: salesFields ? loaded.stage : "",
              minimum: salesFields ? loaded.minimum : "",
              sort: !salesFields && loaded.sort === "amount" ? "updated_at" : loaded.sort,
              columns: visible.length ? visible : ["display_name"],
            });
            onMode(loaded.layout ?? (str(row?.type) || "table"));
          }}
        >
          <option value="">Vue personnalisée</option>
          {views.data?.data.map((v) => (
            <option value={v.id} key={v.id}>
              {str(v.name)}
            </option>
          ))}
        </select>
        {salesFields && (
          <select
            aria-label="Filtrer par étape"
            value={config.stage}
            onChange={(e) => onChange({ ...config, stage: e.target.value })}
          >
            <option value="">Toutes les étapes</option>
            {stages.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        <select
          aria-label="Filtrer par responsable"
          value={config.owner}
          onChange={(e) => onChange({ ...config, owner: e.target.value })}
        >
          <option value="">Tous les responsables</option>
          <option value="me">Moi</option>
          <option value="unassigned">Sans responsable</option>
          {members.data?.data.map((m) => (
            <option key={m.id} value={str(m.user_id)}>
              {str(m.display_name) || str(m.user_id)}
            </option>
          ))}
        </select>
        <select
          aria-label="Tri"
          value={config.sort}
          onChange={(e) => onChange({ ...config, sort: e.target.value as ViewConfig["sort"] })}
        >
          {Object.entries({
            updated_at: "Dernière modification",
            created_at: "Création",
            display_name: "Nom",
            ...(salesFields ? { amount: "Montant" } : {}),
          }).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="button small"
          onClick={() =>
            onChange({
              ...config,
              direction: config.direction === "asc" ? "desc" : "asc",
            })
          }
        >
          {config.direction === "asc" ? "Croissant ↑" : "Décroissant ↓"}
        </button>
        {salesFields && (
          <input
            aria-label="Montant minimum"
            type="number"
            min={0}
            step=".01"
            placeholder="Montant minimum"
            value={config.minimum}
            onChange={(e) => onChange({ ...config, minimum: e.target.value })}
          />
        )}
        <details className="column-picker">
          <summary className="button small">Colonnes</summary>
          <div>
            {columns.map((c) => (
              <label className="inline-check" key={c.key}>
                <input
                  type="checkbox"
                  checked={config.columns.includes(c.key)}
                  disabled={config.columns.includes(c.key) && config.columns.length === 1}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      columns: e.target.checked
                        ? [...config.columns, c.key]
                        : config.columns.filter((k) => k !== c.key),
                    })
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </details>
        <button
          className="button small"
          disabled={workspace.role === "viewer"}
          onClick={() => {
            setUpdating(false);
            setAdding(true);
          }}
        >
          Nouvelle vue sauvegardée
        </button>
        {current && (
          <>
            <button
              className="button small"
              disabled={workspace.role === "viewer"}
              onClick={() => {
                setUpdating(true);
                setAdding(true);
              }}
            >
              Mettre à jour
            </button>
            <button
              className="button small"
              disabled={workspace.role === "viewer"}
              onClick={async () => {
                if (window.confirm("Supprimer cette vue partagée ?"))
                  try {
                    await remove("views", current.id);
                    setSelected("");
                  } catch {}
              }}
            >
              Supprimer la vue
            </button>
            {modified && <span className="pill">Modifications non sauvegardées</span>}
          </>
        )}
      </div>
      <ErrorMessage error={views.error || members.error} />
      {adding && (
        <Editor
          open
          onClose={() => setAdding(false)}
          title={updating ? "Mettre à jour cette vue" : "Sauvegarder cette vue"}
          fields={[field]}
          initial={updating ? { name: current?.name } : {}}
          busy={busy}
          onSave={async (v) => {
            const saved = await save(
              "views",
              {
                ...v,
                ...(!updating ? { object_id: object.id } : {}),
                type: mode === "cards" ? "table" : mode,
                config: { ...config, layout: mode },
              },
              updating ? current : undefined,
            );
            setSelected(saved.id);
          }}
        />
      )}
    </>
  );
}
