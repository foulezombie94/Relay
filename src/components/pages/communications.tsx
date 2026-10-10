"use client";
import Link from "next/link";
import { CommunicationsThread } from "../communications/thread";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Pagination } from "../ui/pagination";
import { TemplateComposer } from "../communications/template-composer";
import { useWorkspace, useRows } from "../providers/data-provider";
import { PageHeader, Empty, Badge, str, date, ErrorMessage, Loading } from "../ui";
export function CommunicationsPage() {
  const { workspace } = useWorkspace();
  const url = useSearchParams();
  const template = url.get("template") ?? "";
  const [thread, setThread] = useState(url.get("focus") ?? "");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const [kind, setKind] = useState("");
  const q = useRows("communications", { size: 25, page, q: debounced, kind });
  const connections = useRows("integrations", { size: 100 });
  const [compose, setCompose] = useState(false);
  const [message, setMessage] = useState("");

  const mail = (connections.data?.data ?? []).filter(
    (c) => c.status === "connected" && ["gmail", "outlook"].includes(str(c.provider)),
  );
  return (
    <>
      <PageHeader
        title="Messages et calendrier"
        description="Vos éléments importés restent privés à votre compte."
        action={
          <div className="row-actions">
            <Link className="button" href="/app/email-templates">
              Modèles email
            </Link>
            <button
              className="button primary"
              disabled={workspace.role === "viewer" || !mail.length}
              onClick={() => setCompose(true)}
            >
              Rédiger un email
            </button>
          </div>
        }
      />
      <div className="toolbar">
        <input
          aria-label="Rechercher les échanges"
          placeholder="Rechercher un message ou un événement…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Type d’échange"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Messages et événements</option>
          <option value="email">Emails</option>
          <option value="calendar">Calendrier</option>
        </select>
      </div>
      <ErrorMessage error={q.error} />
      <ErrorMessage error={connections.error} />
      {message && <div className="alert info">{message}</div>}
      <p className="footer-note">
        Retrouvez les emails et événements importés depuis Intégrations. Les emails proposent leurs
        fils et un chargement du contenu complet. Les actions calendrier sont accessibles dans Ask
        Zyliad.
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
              <p className="preserve">{str(r.body).slice(0, 1000)}</p>
              {r.kind === "email" && (
                <button className="button small" onClick={() => setThread(r.id)}>
                  Ouvrir le fil
                </button>
              )}
            </article>
          ))}
          {q.data?.data.length === 0 && (
            <Empty
              title="Aucun échange importé"
              action={
                <Link className="button" href="/app/integrations">
                  Connecter un service
                </Link>
              }
            />
          )}
        </div>
      )}
      <Pagination
        page={page}
        size={25}
        total={q.data?.count ?? 0}
        busy={q.isFetching}
        onChange={setPage}
      />
      {thread && <CommunicationsThread id={thread} accounts={mail} onClose={() => setThread("")} />}
      {compose && (
        <TemplateComposer
          accounts={mail}
          initialTemplate={template}
          onClose={() => setCompose(false)}
          onSent={() => {
            setMessage("Email en attente du worker. L’envoi reste à confirmer par le fournisseur.");
            void q.refetch();
          }}
        />
      )}
    </>
  );
}
