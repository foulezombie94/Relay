"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace, request } from "../data-provider";
import { PageHeader, Badge, ErrorMessage, date, Loading } from "../ui";
import { ZapierConnection } from "../zapier-connection";
type Connector = {
  provider: string;
  name: string;
  status: string;
  configured: boolean;
  missing: string[];
  description: string;
  email?: string;
  last_sync?: string;
};
export function IntegrationsPage() {
  const { workspace } = useWorkspace();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const cache = useQueryClient();
  const search = useSearchParams();
  const q = useQuery({
    queryKey: ["connections", workspace.id],
    queryFn: () =>
      request<{ data: Connector[] }>("/api/" + workspace.id + "/connections"),
  });
  async function action(p: string, method: "POST" | "DELETE") {
    setBusy(p);
    setError("");
    try {
      const r = await request<{ data?: { synced: number } }>(
        "/api/" + workspace.id + "/connections/" + p,
        method,
      );
      setMessage(
        method === "POST"
          ? (r.data?.synced ?? 0) + " éléments synchronisés."
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
      const r = await request<{ url: string }>(
        "/api/" + workspace.id + "/oauth/" + p,
        "POST",
        {},
      );
      window.location.assign(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible");
      setBusy("");
    }
  }
  return (
    <>
      <PageHeader
        title="Intégrations"
        description="Connectez chaque service avec les permissions nécessaires. Vos messages et événements restent privés à votre compte."
      />
      <ErrorMessage error={q.error} />
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
          {q.data?.data.map((c) => (
            <article className="detail-card" key={c.provider}>
              <div className="card-head">
                <h3>{c.name}</h3>
                <Badge value={c.status} />
              </div>
              <p>{c.description}</p>
              {c.email && <p>{c.email}</p>}
              {c.last_sync && (
                <small>Dernier import : {date(c.last_sync)}</small>
              )}
              <p className="caption">
                Import manuel : 25 messages ou événements maximum ; événements
                des 30 prochains jours.
              </p>
              {!c.configured && (
                <div className="alert info">
                  Configuration serveur à compléter : {c.missing.join(", ")}. Le
                  guide ci-dessous indique les étapes.
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
                        Synchroniser
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
      <ZapierConnection />
      <details className="detail-card">
        <summary>Configurer Google et Microsoft</summary>
        <p>
          Créez une application OAuth Web dans Google Cloud et une inscription
          d’application Web dans Microsoft Entra. Ajoutez les identifiants
          serveur dans .env.local ou les variables de votre hébergeur, puis
          redémarrez le serveur. Aucun secret ne doit être ajouté dans une
          variable NEXT_PUBLIC.
        </p>
        <p>
          Ajoutez les quatre redirections exactes sous votre origine APP_URL :
        </p>
        <pre>
          /api/oauth/gmail/callback{"\n"}/api/oauth/google-calendar/callback
          {"\n"}/api/oauth/outlook/callback{"\n"}
          /api/oauth/outlook-calendar/callback
        </pre>
        <p>
          En local, autorisez localhost:3000 et 127.0.0.1:3000. Activez Gmail
          API et Google Calendar API ; ajoutez votre adresse comme utilisateur
          test tant que Google OAuth est en mode Test. Pour les comptes Outlook
          personnels, choisissez les comptes professionnels et personnels dans
          Entra et MICROSOFT_TENANT=common.
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
    </>
  );
}
