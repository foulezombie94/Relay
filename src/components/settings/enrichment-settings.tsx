"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import { Toggle } from "../ui/controls";
import styles from "./two-factor.module.css";

export function EnrichmentSettings() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const admin = ["owner", "admin"].includes(workspace.role);
  const [busy, setBusy] = useState(false);
  return (
    <section
      className={styles.card}
      aria-labelledby="enrichment-settings-title"
      style={{ marginBottom: 18 }}
    >
      <header className={styles.head}>
        <span className={styles.icon} data-on={workspace.auto_enrich !== false}>
          <Sparkles size={18} />
        </span>
        <div>
          <h3 id="enrichment-settings-title">Enrichissement automatique</h3>
          <p>
            Les entreprises sont complétées depuis leur site public (description, logo, réseaux
            sociaux) et, en France, l’Annuaire des entreprises (secteur, effectif, SIREN, ville).
            Les personnes sont rattachées à l’entreprise de leur email professionnel. Aucune donnée
            de votre CRM n’est envoyée à un tiers, hormis le nom de l’entreprise recherché dans
            l’annuaire public.
          </p>
        </div>
      </header>
      <Toggle
        label="Enrichir les nouvelles fiches"
        description={admin ? undefined : "Réglage réservé aux administrateurs."}
        checked={workspace.auto_enrich !== false}
        disabled={!admin || busy}
        onChange={async (value: boolean) => {
          setBusy(true);
          try {
            await request("/api/workspaces", "PATCH", {
              id: workspace.id,
              values: { auto_enrich: value },
            });
            await cache.invalidateQueries({ queryKey: ["workspaces"] });
            toast.success(value ? "Enrichissement activé" : "Enrichissement désactivé");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Modification impossible.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
