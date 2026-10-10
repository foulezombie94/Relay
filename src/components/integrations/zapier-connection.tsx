"use client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useWorkspace, request } from "../providers/data-provider";
import { Badge, ErrorMessage, date } from "../ui";
export type ZapierKey = {
  id: string;
  name: string;
  suffix: string;
  scopes: string[];
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};
export function ZapierConnection() {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const { workspace } = useWorkspace();
  const admin = ["owner", "admin"].includes(workspace.role);
  const [key, setKey] = useState("");
  const [name, setName] = useState("Zapier");
  const [write, setWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const q = useQuery({
    queryKey: ["zapier-keys", workspace.id],
    enabled: admin,
    queryFn: () =>
      request<{ data: ZapierKey[]; configured: boolean }>("/api/" + workspace.id + "/zapier"),
  });
  const active =
    q.data?.data.filter((k) => !k.revoked_at && Date.parse(k.expires_at) > clock) ?? [];
  async function create() {
    setBusy(true);
    setError("");
    setKey("");
    setResult("");
    try {
      const r = await request<{ data: { key: string } }>(
        "/api/" + workspace.id + "/zapier",
        "POST",
        { name, allow_write: write },
      );
      setKey(r.data.key);
      await q.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Création impossible");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await request("/api/" + workspace.id + "/zapier?id=" + id, "DELETE");
      setKey("");
      setResult("");
      await q.refetch();
      toast.success("Clé révoquée");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Révocation impossible");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="detail-card">
      <div className="card-head">
        <h3>Zapier</h3>
        <Badge value={active.length ? "Clé active" : "À connecter"} />
      </div>
      <p>
        Connectez vos Zaps via Webhooks by Zapier ou une intégration privée à clé API. Lecture des
        personnes, entreprises, opportunités et tâches ; création facultative de fiches et tâches.
        Les notes, messages, documents et données privées ne sont pas exposés.
      </p>
      {!admin ? (
        <p className="muted">Un administrateur peut créer et révoquer une clé pour cet espace.</p>
      ) : (
        <>
          <ErrorMessage error={q.error} />
          <ErrorMessage error={error ? new Error(error) : null} />
          {q.data && !q.data.configured && (
            <div className="alert error">
              SUPABASE_SECRET_KEY manque dans la configuration serveur.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
            className="stack"
          >
            <label>
              Nom de la connexion
              <input
                value={name}
                maxLength={100}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} />
              Autoriser aussi la création de fiches et de tâches
            </label>
            <button
              className="button primary small"
              type="submit"
              disabled={busy || !q.data?.configured}
            >
              Créer une clé valable 90 jours
            </button>
          </form>
          {key && (
            <div className="stack">
              <p>
                Copiez cette clé maintenant : elle ne sera plus affichée après fermeture. Seule son
                empreinte est conservée.
              </p>
              <input aria-label="Nouvelle clé Zapier" type="password" readOnly value={key} />
              <div className="row-actions">
                <button
                  className="button small"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(key);
                      toast.success("Clé copiée");
                    } catch {
                      setError("Sélectionnez la clé et copiez-la manuellement.");
                    }
                  }}
                >
                  Copier
                </button>
                <button
                  className="button small"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const r = await fetch("/api/zapier/auth", {
                        headers: { Authorization: "Bearer " + key },
                        cache: "no-store",
                      });
                      if (!r.ok) throw new Error((await r.json()).error);
                      setResult("Authentification de la clé réussie.");
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Test impossible");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Tester la clé
                </button>
                <button className="button small" onClick={() => setKey("")}>
                  Masquer définitivement
                </button>
              </div>
              {result && <p>{result}</p>}
            </div>
          )}
          <div className="stack">
            {q.data?.data.map((k) => (
              <div className="card-head" key={k.id}>
                <div>
                  <strong>
                    {k.name} · …{k.suffix}
                  </strong>
                  <p>
                    {k.revoked_at
                      ? "Révoquée"
                      : Date.parse(k.expires_at) <= clock
                        ? "Expirée"
                        : "Expire le " + date(k.expires_at)}{" "}
                    · {k.scopes.join(", ")}
                  </p>
                  {k.last_used_at && <small>Dernière utilisation : {date(k.last_used_at)}</small>}
                </div>
                {!k.revoked_at && (
                  <button className="button small" disabled={busy} onClick={() => revoke(k.id)}>
                    Révoquer
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <details>
        <summary>Brancher un Zap</summary>
        <p>
          Sur un hébergement HTTPS accessible à Zapier, utilisez Webhooks by Zapier → Custom
          Request. Ajoutez le header Authorization: Bearer VOTRE_CLE. L’API ne reçoit jamais la clé
          dans une URL.
        </p>
        <pre>
          GET https://votre-zyliad/api/zapier/auth{"\n"}GET
          https://votre-zyliad/api/zapier?resource=people&amp;page=0
        </pre>
        <p>
          GET retourne un tableau de 100 éléments maximum, trié par création (identifiant stable
          pour les déclencheurs). Les ressources sont people, companies, deals et tasks. Incrémentez
          page pour parcourir les suivantes.
        </p>
        <p>
          Pour créer une fiche, méthode POST, Content-Type: application/json, header Idempotency-Key
          unique et stable pour chaque événement du Zap :
        </p>
        <pre>
          {JSON.stringify(
            {
              resource: "people",
              values: {
                display_name: "Contact exemple",
                email: "contact@example.com",
              },
            },
            null,
            2,
          )}
        </pre>
        <p>
          Pour une tâche : resource tasks, values contenant title, et éventuellement description,
          record_id, due_date (ISO avec fuseau), priority. Une reprise avec la même Idempotency-Key
          ne crée pas de doublon. Limite : 60 requêtes/minute par clé.
        </p>
        <p>
          Les requêtes externes ne peuvent pas atteindre localhost. Aucun connecteur Zyliad publié
          dans le catalogue Zapier n’est annoncé ici.
        </p>
      </details>
    </article>
  );
}
