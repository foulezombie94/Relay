"use client";
import { useState } from "react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { Modal, Editor, Badge, str, date, Empty, type Field } from "../ui";
import type { Row } from "@/lib/domain/types";
export function PortalDetails({
  portal,
  onClose,
}: {
  portal: Row;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const items = useRows("portal_items", { portal_id: portal.id, size: 100 });
  const members = useRows("portal_members", {
    portal_id: portal.id,
    size: 100,
  });
  const docs = useRows("documents", {
    record_id: str(portal.record_id),
    size: 100,
  });
  const { save, remove, busy } = useSave();
  const [editor, setEditor] = useState<{ resource: string; row?: Row } | null>(
    null,
  );
  const admin = ["owner", "admin"].includes(workspace.role);
  const fields: Field[] =
    editor?.resource === "portal_members"
      ? [
          {
            key: "email",
            label: "Email du client",
            type: "email",
            required: true,
          },
          {
            key: "can_comment",
            label: "Autoriser les commentaires",
            type: "checkbox",
          },
          { key: "expires_at", label: "Expiration", type: "datetime-local" },
          { key: "revoked", label: "Révoquer cet accès", type: "checkbox" },
        ]
      : [
          { key: "title", label: "Titre", required: true },
          { key: "content", label: "Contenu partagé", type: "textarea" },
          {
            key: "type",
            label: "Type",
            type: "select",
            options: ["update", "step", "decision", "document"].map((s) => ({
              value: s,
              label: s,
            })),
          },
          {
            key: "status",
            label: "Statut",
            type: "select",
            options: ["open", "done", "approved"].map((s) => ({
              value: s,
              label: s,
            })),
          },
          {
            key: "document_id",
            label: "Document explicitement partagé",
            type: "select",
            options: (docs.data?.data ?? []).map((d) => ({
              value: d.id,
              label: str(d.name),
            })),
          },
        ];
  return (
    <Modal open onClose={onClose} title={str(portal.name)} wide>
      <div className="alert info">
        Lien du client :{" "}
        <a href={"/portal/" + portal.id}>
          {typeof window === "undefined" ? "" : window.location.origin}/portal/
          {portal.id}
        </a>
        <p>
          Le client doit créer un compte et vérifier l’adresse invitée. L’ajout
          d’un accès n’envoie pas d’e-mail.
        </p>
      </div>
      <h3>Personnes autorisées</h3>
      {admin && (
        <button
          className="button small"
          onClick={() => setEditor({ resource: "portal_members" })}
        >
          Autoriser un client
        </button>
      )}
      {members.data?.data.map((m) => (
        <div className="detail-card" key={m.id}>
          <div className="card-head">
            <span>{str(m.email)}</span>
            <Badge value={m.revoked ? "cancelled" : "confirmed"} />
            {admin && (
              <button
                className="button small"
                onClick={() =>
                  setEditor({ resource: "portal_members", row: m })
                }
              >
                Modifier
              </button>
            )}
          </div>
          <small>
            {m.expires_at
              ? "Expire le " + date(m.expires_at)
              : "Sans expiration"}
          </small>
        </div>
      ))}
      <h3>Éléments visibles du client</h3>
      <button
        className="button small"
        disabled={workspace.role === "viewer"}
        onClick={() => setEditor({ resource: "portal_items" })}
      >
        Partager un élément
      </button>
      {items.data?.data.map((i) => (
        <article key={i.id} className="detail-card">
          <div className="card-head">
            <strong>{str(i.title)}</strong>
            <div className="row-actions">
              <Badge value={i.status} />
              <button
                className="button small"
                disabled={workspace.role === "viewer"}
                onClick={() => setEditor({ resource: "portal_items", row: i })}
              >
                Modifier
              </button>
              <button
                className="button small"
                disabled={workspace.role === "viewer"}
                onClick={() =>
                  void remove("portal_items", i.id).catch(() => {})
                }
              >
                Retirer
              </button>
            </div>
          </div>
          <p>{str(i.content)}</p>
        </article>
      ))}
      {items.data?.data.length === 0 && (
        <Empty description="Le client ne verra que les éléments partagés ici." />
      )}
      {editor && (
        <Editor
          key={editor.row?.id ?? editor.resource}
          open
          onClose={() => setEditor(null)}
          title={
            editor.resource === "portal_members"
              ? "Accès client"
              : "Élément partagé"
          }
          fields={fields}
          initial={
            editor.row ?? { type: "update", status: "open", can_comment: true }
          }
          busy={busy}
          onSave={(v) =>
            save(
              editor.resource,
              { ...v, ...(!editor.row ? { portal_id: portal.id } : {}) },
              editor.row,
            )
          }
        />
      )}
    </Modal>
  );
}
