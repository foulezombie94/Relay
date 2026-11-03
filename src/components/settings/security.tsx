"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { request, useWorkspace } from "../providers/data-provider";
import { Toggle } from "../ui/controls";
import { TwoFactorSettings } from "./two-factor";
import styles from "./two-factor.module.css";

export function SecuritySettings() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const admin = ["owner", "admin"].includes(workspace.role);
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <TwoFactorSettings />
      <section className={styles.card} aria-labelledby="workspace-mfa-title">
        <header className={styles.head}>
          <span className={styles.icon} data-on={!!workspace.require_mfa}>
            <Lock size={18} />
          </span>
          <div>
            <h3 id="workspace-mfa-title">Exiger la double authentification</h3>
            <p>
              Tous les membres de « {workspace.name} » devront valider un code à chaque connexion.
              Sans second facteur, l’espace leur reste masqué jusqu’à son activation — y compris
              pour les accès directs à la base.
            </p>
          </div>
        </header>
        <Toggle
          label="Exiger pour tous les membres"
          description={admin ? undefined : "Seuls les administrateurs modifient ce réglage."}
          checked={!!workspace.require_mfa}
          disabled={!admin || busy}
          onChange={async (value: boolean) => {
            if (
              value &&
              !window.confirm(
                "Exiger la double authentification ? Les membres sans second facteur perdront l’accès à l’espace jusqu’à son activation.",
              )
            )
              return;
            setBusy(true);
            try {
              await request("/api/workspaces", "PATCH", {
                id: workspace.id,
                values: { require_mfa: value },
              });
              await cache.invalidateQueries({ queryKey: ["workspaces"] });
              toast.success(value ? "Double authentification exigée" : "Exigence retirée");
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Modification impossible.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </section>
    </div>
  );
}
