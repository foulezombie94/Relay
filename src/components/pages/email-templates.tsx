"use client";
import { workspaceHref } from "@/lib/domain/workspace-navigation";
import { useState } from "react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { PageHeader, AddButton, Editor, Loading, Empty, ErrorMessage, str } from "../ui";
import type { Row } from "@/lib/domain/types";
export function EmailTemplatesPage() {
  const { workspace } = useWorkspace();
  const q = useRows("email_templates", { size: 100 });
  const { save, remove, busy } = useSave();
  const [edit, setEdit] = useState<Row | true | null>(null);
  const [error, setError] = useState("");
  const readonly = workspace.role === "viewer";
  return (
    <>
      <PageHeader
        title="Modèles d’emails"
        description="Préparez des messages partagés, puis adaptez-les avant chaque envoi."
        action={
          <AddButton label="Nouveau modèle" disabled={readonly} onClick={() => setEdit(true)} />
        }
      />
      <p className="footer-note">
        Variables disponibles : {"{{name}}"}, {"{{email}}"}, {"{{domain}}"} et {"{{workspace}}"}.
        Aucun email ne part lors de la création ou de la modification du modèle.
      </p>
      <ErrorMessage error={q.error || (error ? new Error(error) : null)} />
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="stack">
          {q.data?.data.map((t) => (
            <article className="detail-card" key={t.id}>
              <div className="card-head">
                <h3>{str(t.name)}</h3>
                <div className="row-actions">
                  <button className="button small" disabled={readonly} onClick={() => setEdit(t)}>
                    Modifier
                  </button>
                  <button
                    className="button small danger"
                    disabled={readonly || busy}
                    onClick={async () => {
                      if (window.confirm("Supprimer ce modèle ?"))
                        try {
                          await remove("email_templates", t.id);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Suppression impossible.");
                        }
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
              <strong>{str(t.subject)}</strong>
              <p className="preserve-lines">{str(t.body)}</p>
              <a
                className="button small"
                href={workspaceHref("/app/communications?template=" + t.id, workspace.id)}
              >
                Utiliser ce modèle
              </a>
            </article>
          ))}
          {!q.data?.data.length && (
            <Empty
              title="Votre premier modèle"
              description="Créez un message pour vos prises de contact, relances ou comptes rendus."
            />
          )}
        </div>
      )}
      {edit && (
        <Editor
          open
          key={edit === true ? "new" : edit.id}
          onClose={() => setEdit(null)}
          title={edit === true ? "Nouveau modèle" : "Modifier le modèle"}
          fields={[
            { key: "name", label: "Nom", required: true },
            { key: "subject", label: "Objet", required: true },
            { key: "body", label: "Message", type: "textarea", required: true },
          ]}
          initial={edit === true ? {} : edit}
          busy={busy}
          onSave={(values) => save("email_templates", values, edit === true ? undefined : edit)}
        />
      )}
    </>
  );
}
