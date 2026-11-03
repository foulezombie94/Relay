"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MailOpen, MousePointerClick, UserPlus } from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import { Toggle } from "../ui/controls";
import styles from "./two-factor.module.css";

type Connection = {
  provider: string;
  email: string | null;
  status: string;
  capture_contacts: boolean;
};
const names: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  "google-calendar": "Google Agenda",
  "outlook-calendar": "Calendrier Outlook",
};

/** Settings › Emails et calendriers: contact capture (per mailbox) and sequence tracking (workspace). */
export function EmailAutomationSettings() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const admin = ["owner", "admin"].includes(workspace.role);
  const [busy, setBusy] = useState(false);
  const [domains, setDomains] = useState((workspace.capture_excluded_domains ?? []).join(", "));
  const q = useQuery({
    queryKey: ["rows", workspace.id, "contact-capture"],
    queryFn: () => request<{ data: Connection[] }>(`/api/${workspace.id}/contact-capture`),
  });
  async function updateWorkspace(values: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await request("/api/workspaces", "PATCH", { id: workspace.id, values });
      await cache.invalidateQueries({ queryKey: ["workspaces"] });
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modification impossible.");
    } finally {
      setBusy(false);
    }
  }
  const connected = (q.data?.data ?? []).filter((c) => c.status === "connected");
  return (
    <div style={{ display: "grid", gap: 16, marginBottom: 18 }}>
      <section className={styles.card} aria-labelledby="capture-title">
        <header className={styles.head}>
          <span className={styles.icon} data-on={connected.some((c) => c.capture_contacts)}>
            <UserPlus size={18} />
          </span>
          <div>
            <h3 id="capture-title">Création automatique des contacts</h3>
            <p>
              Chaque nouvel interlocuteur de vos emails et réunions synchronisés devient une
              personne, rattachée à son entreprise. Les collègues de votre domaine, les adresses
              automatiques (no-reply…), les messageries gratuites (en tant qu’entreprise) et les
              fiches supprimées ne sont jamais créés.
            </p>
          </div>
        </header>
        {connected.length === 0 ? (
          <p className="caption">
            Connectez une boîte mail ou un agenda ci-dessous pour l’activer.
          </p>
        ) : (
          connected.map((connection) => (
            <Toggle
              key={connection.provider}
              label={`${names[connection.provider] ?? connection.provider}${connection.email ? " · " + connection.email : ""}`}
              checked={connection.capture_contacts}
              disabled={busy || workspace.role === "viewer"}
              onChange={async (enabled: boolean) => {
                setBusy(true);
                try {
                  await request(`/api/${workspace.id}/contact-capture`, "POST", {
                    provider: connection.provider,
                    enabled,
                  });
                  await q.refetch();
                  toast.success(enabled ? "Capture activée" : "Capture désactivée");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Modification impossible.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          ))
        )}
        {admin && (
          <form
            style={{ display: "grid", gap: 6 }}
            onSubmit={(event) => {
              event.preventDefault();
              const list = [
                ...new Set(
                  domains
                    .split(/[\s,;]+/)
                    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
                    .filter(Boolean),
                ),
              ];
              void updateWorkspace(
                { capture_excluded_domains: list },
                "Domaines exclus enregistrés",
              );
            }}
          >
            <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
              Domaines jamais capturés (espace)
              <input
                value={domains}
                placeholder="partenaire.fr, cabinet-comptable.fr"
                onChange={(e) => setDomains(e.target.value)}
              />
            </label>
            <button className="button small" style={{ width: "fit-content" }} disabled={busy}>
              Enregistrer les exclusions
            </button>
          </form>
        )}
      </section>
      <section className={styles.card} aria-labelledby="tracking-title">
        <header className={styles.head}>
          <span
            className={styles.icon}
            data-on={!!workspace.track_email_opens || !!workspace.track_email_clicks}
          >
            <MailOpen size={18} />
          </span>
          <div>
            <h3 id="tracking-title">Suivi des emails de séquences</h3>
            <p>
              Mesurez ouvertures et clics des emails envoyés par vos séquences. Les ouvertures sont
              une estimation (certaines messageries chargent les images automatiquement) ; les
              robots de sécurité sont ignorés. Selon la CNIL, le pixel d’ouverture requiert le
              consentement des destinataires : activez-le seulement si vous l’avez recueilli.
            </p>
          </div>
        </header>
        <Toggle
          label="Suivre les ouvertures"
          description={admin ? undefined : "Réglage réservé aux administrateurs."}
          checked={!!workspace.track_email_opens}
          disabled={!admin || busy}
          onChange={(value: boolean) =>
            void updateWorkspace(
              { track_email_opens: value },
              value ? "Suivi des ouvertures activé" : "Suivi des ouvertures désactivé",
            )
          }
        />
        <Toggle
          label="Suivre les clics"
          description="Les liens passent par une redirection qui ne mène qu’à l’adresse d’origine."
          checked={!!workspace.track_email_clicks}
          disabled={!admin || busy}
          onChange={(value: boolean) =>
            void updateWorkspace(
              { track_email_clicks: value },
              value ? "Suivi des clics activé" : "Suivi des clics désactivé",
            )
          }
        />
        <p className="caption" style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <MousePointerClick size={14} /> Les compteurs apparaissent dans l’historique d’envoi de
          chaque contact inscrit à une séquence.
        </p>
      </section>
    </div>
  );
}
