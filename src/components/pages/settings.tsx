"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Cable, Database, History, Users, SlidersHorizontal } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace, useRows, useSave, request } from "../data-provider";
import {
  PageHeader,
  Editor,
  str,
  type Field,
} from "../ui";
import { RepeatFields } from "../structured-fields";
import styles from "./settings.module.css";
import { TeamSettings } from "../team-settings";
export function SettingsPage() {
  const { workspace, objects } = useWorkspace();
  const admin = ["owner", "admin"].includes(workspace.role);
  const cache = useQueryClient();
  const attrs = useRows("attributes", { size: 100 });
  const audit = useRows("audit_events", { size: 30 });
  const { save, busy } = useSave();
  const [edit, setEdit] = useState<string | null>(null);
  const forms: Record<string, Field[]> = {
    workspace: [
      { key: "name", label: "Nom de l’espace", required: true },
      { key: "timezone", label: "Fuseau horaire", required: true },
      { key: "currency", label: "Devise par défaut", required: true },
      {
        key: "locale",
        label: "Langue",
        type: "select",
        options: [
          { value: "fr", label: "Français" },
          { value: "en", label: "English" },
        ],
      },
    ],
    objects: [
      { key: "name", label: "Nom de l’objet", required: true },
      {
        key: "slug",
        label: "Identifiant — lettres minuscules",
        required: true,
      },
    ],
    attributes: [
      {
        key: "object_id",
        label: "Objet",
        type: "select",
        required: true,
        options: objects.map((o) => ({ value: o.id, label: o.name })),
      },
      { key: "name", label: "Nom affiché", required: true },
      { key: "key", label: "Identifiant — lettres minuscules", required: true },
      {
        key: "type",
        label: "Type",
        type: "select",
        required: true,
        options: [
          "text",
          "number",
          "money",
          "date",
          "datetime",
          "boolean",
          "select",
          "multi_select",
          "email",
          "phone",
          "url",
          "location",
          "user",
          "relation",
        ].map((v) => ({ value: v, label: v })),
      },
      { key: "required", label: "Champ obligatoire", type: "checkbox" },
      {
        key: "options",
        label: "Options proposées",
        type: "custom",
        render: (initial, name) => (
          <RepeatFields kind="options" initial={initial} name={name} />
        ),
      },
    ],
  };
  return (
    <>
      <PageHeader
        title="Paramètres"
        description="Votre espace, votre modèle de données et votre équipe."
      />
      <div className={styles.layout}>
        <nav className={styles.navigation} aria-label="Sections des paramètres">
          <span>ESPACE DE TRAVAIL</span>
          <a href="#organisation"><Building2 size={16} /> Général</a>
          <a href="#equipe"><Users size={16} /> Équipe et accès</a>
          <a href="#donnees"><Database size={16} /> Objets et champs</a>
          <span>CONFIGURATION</span>
          <Link href="/app/integrations"><Cable size={16} /> Intégrations <ArrowUpRight size={13} /></Link>
          <Link href="/app/pipelines"><SlidersHorizontal size={16} /> Pipelines <ArrowUpRight size={13} /></Link>
          <a href="#activite"><History size={16} /> Historique</a>
        </nav>
        <main className={styles.main}>
          <div className={styles.overview}>
            <div className={styles.overviewIcon}><Building2 size={20} /></div>
            <div className={styles.overviewTitle}><span>VOTRE ESPACE</span><h2>{workspace.name}</h2><p>Gérez les informations de l’espace, les personnes qui y travaillent et les données de votre CRM.</p></div>
            <div className={styles.stats}><div><span>Accès actuel</span><strong>{({ owner: "Propriétaire", admin: "Administrateur", member: "Membre", viewer: "Lecteur" } as Record<string, string>)[workspace.role] ?? workspace.role}</strong></div><div><span>Objets CRM</span><strong>{objects.length}</strong></div><div><span>Champs personnalisés</span><strong>{attrs.data?.data.filter((attribute) => !attribute.archived).length ?? "—"}</strong></div></div>
          </div>
          <div className={styles.sections}>
          <section className={`detail-card ${styles.card}`} id="organisation">
        <div className="card-head">
          <h3>Organisation</h3>
          <button
            className="button small"
            disabled={!admin}
            onClick={() => setEdit("workspace")}
          >
            Modifier
          </button>
        </div>
        <p>
          {workspace.name} · {workspace.timezone} · {workspace.currency}
        </p>
        <p className="caption">
          La langue est sauvegardée comme préférence. L’interface actuelle est
          en français.
        </p>
      </section>
      <TeamSettings />
      <section className={`detail-card ${styles.card}`} id="donnees">
        <div className="card-head">
          <h3>Objets et champs</h3>
          <div className="row-actions">
            <button
              className="button small"
              disabled={!admin}
              onClick={() => setEdit("objects")}
            >
              Créer un objet
            </button>
            <button
              className="button small"
              disabled={!admin}
              onClick={() => setEdit("attributes")}
            >
              Ajouter un attribut
            </button>
          </div>
        </div>
        {objects.map((o) => (
          <div key={o.id}>
            <h4>{o.name}</h4>
            {attrs.data?.data
              .filter((a) => a.object_id === o.id)
              .map((a) => (
                <div className="card-head" key={a.id}>
                  <span>
                    {str(a.name)} · {str(a.type)}{" "}
                    {a.required ? "· obligatoire" : ""}
                  </span>
                  <button
                    className="button small"
                    disabled={!admin}
                    onClick={() =>
                      save("attributes", { archived: !a.archived }, a).catch(
                        () => {},
                      )
                    }
                  >
                    {a.archived ? "Réactiver" : "Archiver"}
                  </button>
                </div>
              ))}
          </div>
        ))}
      </section>
      <section className={`detail-card ${styles.card}`}>
        <h3>Paramètres complémentaires</h3>
        <p>Configurez les étapes de vente et les services reliés à votre espace.</p>
        <div className={styles.shortcuts}>
          <Link href="/app/pipelines"><span className={styles.shortcutIcon}><SlidersHorizontal size={18} /></span><span><strong>Pipelines commerciaux</strong><small>Étapes de vente et probabilités du forecast.</small></span><ArrowUpRight size={16} /></Link>
          <Link href="/app/integrations"><span className={styles.shortcutIcon}><Cable size={18} /></span><span><strong>Intégrations</strong><small>Messagerie, calendrier et automatisations connectées.</small></span><ArrowUpRight size={16} /></Link>
        </div>
      </section>
      <section className={`detail-card ${styles.card}`} id="activite">
        <h3>Activité récente</h3>
        {audit.data?.data.map((a) => (
          <p key={a.id}>
            <strong>{str(a.entity)}</strong> · {str(a.action)} ·{" "}
            {new Date(a.created_at).toLocaleString("fr-FR")}
          </p>
        ))}
      </section>
          </div>
        </main>
      </div>
      {edit && (
        <Editor
          open
          key={edit}
          title={
            edit === "workspace"
              ? "Organisation"
              : edit === "objects"
                  ? "Nouvel objet"
                  : "Nouvel attribut"
          }
          fields={forms[edit]}
          initial={
            edit === "workspace"
              ? workspace
              : edit === "attributes"
                  ? { type: "text", options: [] }
                  : {}
          }
          onClose={() => setEdit(null)}
          busy={busy}
          onSave={async (v) => {
            if (edit === "workspace") {
              await request("/api/workspaces", "PATCH", {
                id: workspace.id,
                values: v,
              });
              await cache.invalidateQueries({ queryKey: ["workspaces"] });
            } else await save(edit, v);
          }}
        />
      )}
    </>
  );
}
