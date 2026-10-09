"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace, request } from "../providers/data-provider";
import { PageHeader, Badge, ErrorMessage, date, Loading } from "../ui";
import { ZapierConnection } from "../integrations/zapier-connection";
import { BackgroundJob } from "../jobs/background-job";
type Connector = {
  provider: string;
  name: string;
  status: string;
  configured: boolean;
  missing: string[];
  description: string;
  email?: string;
  last_sync?: string;
  auto_sync?: boolean;
  pending?: boolean;
  imported?: number;
  last_error?: string;
  worker_ready?: boolean;
};
export function IntegrationsPage({
  embedded = false,
  providers,
}: { embedded?: boolean; providers?: readonly string[] } = {}) {
  const { workspace } = useWorkspace();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const cache = useQueryClient();
  const search = useSearchParams();
  const q = useQuery({
    queryKey: ["connections", workspace.id],
    queryFn: () => request<{ data: Connector[] }>("/api/" + workspace.id + "/connections"),
  });
  async function action(p: string, method: "POST" | "DELETE" | "PATCH", enabled?: boolean) {
    setBusy(p);
    setError("");
    try {
      const r = await request<{
        queued?: boolean;
        job?: { id: string };
        data?: { synced: number; complete: boolean };
      }>(
        "/api/" + workspace.id + "/connections/" + p,
        method,
        method === "PATCH" ? { enabled } : undefined,
      );
      if (r.queued && r.job) setJobId(r.job.id);
      setMessage(
        method === "POST"
          ? r.queued
            ? "Synchronisation planifiée."
            : (r.data?.synced ?? 0) +
              (r.data?.complete
                ? " éléments importés. Synchronisation terminée."
                : " éléments importés. Cliquez sur Continuer pour importer la suite.")
          : method === "PATCH"
            ? "Préférence enregistrée."
            : "Service déconnecté. Les éléments importés sont conservés ; révoquez le consentement auprès du fournisseur si nécessaire.",
      );
      await q.refetch();
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusy("");
    }
  }
  async function connect(p: string) {
    setBusy(p);
    setError("");
    try {
      const r = await request<{ url: string }>("/api/" + workspace.id + "/oauth/" + p, "POST", {});
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible");
      setBusy("");
    }
  }
  return (
    <>
      {!embedded && (
        <PageHeader
          title="Intégrations"
          description="Connectez vos emails, calendriers et transcriptions. Les imports restent privés à votre compte. Meet, Teams et Zoom importent les transcriptions disponibles ; activez leur création chez le fournisseur."
        />
      )}
      <ErrorMessage error={q.error} />
      {jobId && (
        <BackgroundJob
          id={jobId}
          onComplete={(data) => {
            setMessage(
              String(data.synced ?? 0) +
                " éléments importés." +
                (data.complete
                  ? " Synchronisation terminée."
                  : " Continuez pour importer la suite."),
            );
            void q.refetch();
          }}
        />
      )}
      {(error || search.get("connection_error")) && (
        <div className="alert error" role="alert">
          {error || search.get("connection_error")}
        </div>
      )}
      {(message || search.get("connected")) && (
        <div className="alert info">{message || search.get("connected")}</div>
      )}
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="cards-grid">
          {q.data?.data
            .filter((c) => !providers || providers.includes(c.provider))
            .map((c) => (
              <article className="detail-card" key={c.provider}>
                <div className="card-head">
                  <h3>{c.name}</h3>
                  <Badge value={c.status} />
                </div>
                <p>{c.description}</p>
                {c.email && <p>{c.email}</p>}
                {c.last_sync && <small>Dernier import : {date(c.last_sync)}</small>}
                <p className="caption">
                  Import par lots de 100 avec reprise. Premier import des emails : 30 derniers
                  jours, puis nouveaux messages. Calendrier : 30 prochains jours.
                </p>
                {c.last_error && <p className="alert error">{c.last_error}</p>}
                {c.status === "connected" && workspace.role !== "viewer" && (
                  <label className="caption">
                    <input
                      type="checkbox"
                      checked={!!c.auto_sync}
                      disabled={!!busy || !c.worker_ready}
                      onChange={(e) => void action(c.provider, "PATCH", e.target.checked)}
                    />{" "}
                    Synchronisation automatique toutes les 5 minutes lorsque le service est actif
                  </label>
                )}
                {!c.configured && (
                  <div className="alert info">
                    Configuration serveur à compléter : {c.missing.join(", ")}. Le guide ci-dessous
                    indique les étapes.
                  </div>
                )}
                {workspace.role !== "viewer" && (
                  <div className="row-actions">
                    {c.status === "connected" ? (
                      <>
                        <button
                          className="button small"
                          disabled={!!busy}
                          onClick={() => action(c.provider, "POST")}
                        >
                          {c.pending ? "Continuer l’import" : "Synchroniser"}
                        </button>
                        <button
                          className="button small"
                          disabled={!!busy}
                          onClick={() => action(c.provider, "DELETE")}
                        >
                          Déconnecter
                        </button>
                      </>
                    ) : (
                      <button
                        className="button primary small"
                        disabled={!c.configured || !!busy}
                        onClick={() => connect(c.provider)}
                      >
                        {busy === c.provider
                          ? "Ouverture…"
                          : c.status === "error"
                            ? "Reconnecter"
                            : "Connecter"}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
        </div>
      )}
      {!embedded && <ZapierConnection />}
      {!embedded && (
        <details className="detail-card">
          <summary>Configurer Google et Microsoft</summary>
          <p>
            Créez une application OAuth Web dans Google Cloud et une inscription d’application Web
            dans Microsoft Entra. Ajoutez les identifiants serveur dans .env.local ou les variables
            de votre hébergeur, puis redémarrez le serveur. Aucun secret ne doit être ajouté dans
            une variable NEXT_PUBLIC.
          </p>
          <p>Ajoutez les quatre redirections exactes sous votre origine APP_URL :</p>
          <pre>
            /api/oauth/gmail/callback{"\n"}/api/oauth/google-calendar/callback
            {"\n"}/api/oauth/outlook/callback{"\n"}
            /api/oauth/outlook-calendar/callback
          </pre>
          <p>
            En local, autorisez localhost:3000 et 127.0.0.1:3000. Activez Gmail API et Google
            Calendar API ; ajoutez votre adresse comme utilisateur test tant que Google OAuth est en
            mode Test. Pour les comptes Outlook personnels, choisissez les comptes professionnels et
            personnels dans Entra et MICROSOFT_TENANT=common.
          </p>
          <p>
            <a
              href="https://developers.google.com/identity/protocols/oauth2/web-server"
              target="_blank"
              rel="noreferrer"
            >
              Documentation Google
            </a>{" "}
            ·{" "}
            <a
              href="https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow"
              target="_blank"
              rel="noreferrer"
            >
              Documentation Microsoft
            </a>
          </p>
        </details>
      )}
    </>
  );
}
