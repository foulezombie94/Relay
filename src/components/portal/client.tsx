"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { request } from "../providers/data-provider";
import { Badge, date, Loading, str } from "../ui";
import type { Row } from "@/lib/domain/types";
export function PortalList() {
  const [rows, setRows] = useState<{ id: string; name: string }[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    request<{ data: { id: string; name: string }[] }>("/api/portal")
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="portal-page">
      <header className="portal-top">
        <span className="brand">
          <span className="brand-mark">z</span>Zyliad · Espace client
        </span>
        <Link href="/app/companies">Mon CRM</Link>
      </header>
      <h1>Vos espaces clients</h1>
      {error && <div className="alert error">{error}</div>}
      {rows === null && !error ? (
        <Loading />
      ) : rows?.length === 0 ? (
        <p>Aucun accès pour cette adresse. Contactez votre interlocuteur.</p>
      ) : (
        rows?.map((p) => (
          <a className="detail-card" key={p.id} href={"/portal/" + p.id}>
            {p.name} →
          </a>
        ))
      )}
    </main>
  );
}
export function PortalClient({ id }: { id: string }) {
  const [data, setData] = useState<{
    portal: { name: string };
    items: Row[];
    comments: Row[];
    can_comment: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const r = await request<{ data: NonNullable<typeof data> }>("/api/portal/" + id);
      setData(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Portail inaccessible");
    }
  }
  useEffect(() => {
    let ignore = false;
    request<{ data: NonNullable<typeof data> }>("/api/portal/" + id)
      .then((r) => {
        if (!ignore) setData(r.data);
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [id]);
  return (
    <main className="portal-page">
      <header className="portal-top">
        <span className="brand">
          <span className="brand-mark">z</span>Zyliad · Espace client
        </span>
        <Link href="/portal">Mes portails</Link>
      </header>
      {error && <div className="alert error">{error}</div>}
      {!data && !error ? (
        <Loading />
      ) : (
        data && (
          <>
            <h1>{data.portal.name}</h1>
            <p>Les informations partagées par votre interlocuteur.</p>
            <div className="stack">
              {data.items.map((item) => (
                <article className="detail-card" key={item.id}>
                  <div className="card-head">
                    <h3>{str(item.title)}</h3>
                    <Badge value={item.status} />
                  </div>
                  <p className="preserve">{str(item.content)}</p>
                  {item.due_date ? <small>Échéance : {date(item.due_date)}</small> : null}
                  {item.document_id ? (
                    <a
                      className="button small"
                      target="_blank"
                      rel="noreferrer"
                      href={"/api/portal/" + id + "?document=" + str(item.document_id)}
                    >
                      Ouvrir le document partagé
                    </a>
                  ) : null}
                </article>
              ))}
            </div>
            <h2>Échanges</h2>
            {data.comments.map((c) => (
              <article className="detail-card" key={c.id}>
                <p className="preserve">{str(c.content)}</p>
                <small>{date(c.created_at)}</small>
              </article>
            ))}
            {data.can_comment && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  setBusy(true);
                  try {
                    await request("/api/portal/" + id, "POST", {
                      content: String(new FormData(form).get("content")),
                    });
                    form.reset();
                    await load();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Message impossible");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Votre message
                  <textarea name="content" required maxLength={10000} />
                </label>
                <button className="button primary" disabled={busy}>
                  Envoyer
                </button>
              </form>
            )}
          </>
        )
      )}
    </main>
  );
}
