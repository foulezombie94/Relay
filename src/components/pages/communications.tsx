"use client";
import { useState } from "react";
import { useWorkspace, useRows, request } from "../data-provider";
import {
  PageHeader,
  Editor,
  Empty,
  Badge,
  str,
  date,
  ErrorMessage,
  Loading,
} from "../ui";
export function CommunicationsPage() {
  const { workspace } = useWorkspace();
  const q = useRows("communications", { size: 100 });
  const connections = useRows("integrations", { size: 100 });
  const [compose, setCompose] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const mail = (connections.data?.data ?? []).filter(
    (c) =>
      c.status === "connected" &&
      ["gmail", "outlook"].includes(str(c.provider)),
  );
  return (
    <>
      <PageHeader
        title="Messages et calendrier"
        description="Vos éléments importés restent privés à votre compte."
        action={
          <button
            className="button primary"
            disabled={workspace.role === "viewer" || !mail.length}
            onClick={() => setCompose(true)}
          >
            Rédiger un email
          </button>
        }
      />
      <ErrorMessage error={q.error} />
      <ErrorMessage error={connections.error} />
      {message && <div className="alert info">{message}</div>}
      <p className="footer-note">
        Chaque service s’importe séparément depuis Intégrations, avec 25
        éléments maximum. Les calendriers disposent uniquement d’un accès en
        lecture.
      </p>
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="stack">
          {q.data?.data.map((r) => (
            <article className="detail-card" key={r.id}>
              <div className="card-head">
                <h3>{str(r.subject)}</h3>
                <Badge value={r.kind} />
              </div>
              <small>
                {str(r.sender)} · {date(r.received_at || r.starts_at)}
              </small>
              <p className="preserve">{str(r.body)}</p>
            </article>
          ))}
          {q.data?.data.length === 0 && (
            <Empty
              title="Aucun échange importé"
              action={
                <a className="button" href="/app/integrations">
                  Connecter un service
                </a>
              }
            />
          )}
        </div>
      )}
      {compose && (
        <Editor
          open
          onClose={() => setCompose(false)}
          title="Envoyer un email"
          busy={busy}
          fields={[
            {
              key: "provider",
              label: "Compte expéditeur",
              type: "select",
              required: true,
              options: mail.map((c) => ({
                value: str(c.provider),
                label:
                  (c.provider === "gmail" ? "Gmail" : "Outlook") +
                  " · " +
                  str(c.email),
              })),
            },
            { key: "to", label: "Destinataire", type: "email", required: true },
            { key: "subject", label: "Objet", required: true },
            { key: "body", label: "Message", type: "textarea", required: true },
          ]}
          onSave={async (v) => {
            if (
              !window.confirm(
                "Envoyer réellement cet email au destinataire indiqué ?",
              )
            )
              throw new Error("Envoi annulé.");
            setBusy(true);
            try {
              await request("/api/" + workspace.id + "/send", "POST", v);
              setMessage("Email transmis au fournisseur.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
