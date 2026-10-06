"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { TemplateComposer } from "../template-composer";
import { useWorkspace, useRows } from "../data-provider";
import {
  PageHeader,
  Empty,
  Badge,
  str,
  date,
  ErrorMessage,
  Loading,
} from "../ui";
export function CommunicationsPage() {
  const { workspace } = useWorkspace();
  const template = useSearchParams().get("template") ?? "";
  const q = useRows("communications", { size: 100 });
  const connections = useRows("integrations", { size: 100 });
  const [compose, setCompose] = useState(false);
  const [message, setMessage] = useState("");

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
        <TemplateComposer
          accounts={mail}
          initialTemplate={template}
          onClose={() => setCompose(false)}
          onSent={() => {
            setMessage("Email transmis au fournisseur.");
            void q.refetch();
          }}
        />
      )}
    </>
  );
}
