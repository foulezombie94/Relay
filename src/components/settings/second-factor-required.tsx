"use client";
import { ShieldAlert } from "lucide-react";
import { TwoFactorSettings } from "./two-factor";

/** Shown instead of the CRM when a workspace requires 2FA and the account has none yet. */
export function SecondFactorRequired({
  workspaces,
}: {
  workspaces: { id: string; name: string }[];
}) {
  return (
    <main className="page-loader" style={{ maxWidth: 640, margin: "0 auto", textAlign: "left" }}>
      <ShieldAlert size={28} aria-hidden />
      <h1>Double authentification requise</h1>
      <p>
        {workspaces.length === 1 ? "L’espace" : "Les espaces"}{" "}
        <strong>{workspaces.map((w) => w.name).join(", ")}</strong>{" "}
        {workspaces.length === 1 ? "exige" : "exigent"} un second facteur. Activez-le pour continuer
        : vos données restent inaccessibles d’ici là.
      </p>
      <TwoFactorSettings onEnabled={() => window.location.reload()} />
    </main>
  );
}
