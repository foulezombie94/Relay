"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
function Unsubscribe() {
  const p = useSearchParams();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="onboarding">
      <span className="brand-mark">z</span>
      <h1>{done ? "Suivi arrêté" : "Arrêter les emails de suivi"}</h1>
      <p>
        {done
          ? "Votre adresse a été exclue des prochains suivis de cet espace."
          : "Confirmez pour ne plus recevoir de messages de cette entreprise via les séquences Zyliad."}
      </p>
      {error && <p role="alert">{error}</p>}
      {!done && (
        <button
          className="button primary"
          disabled={busy || !p.get("id") || !p.get("token")}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await fetch("/api/unsubscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: p.get("id"),
                  token: p.get("token"),
                }),
              });
              const value = await r.json();
              if (!r.ok) throw new Error(value.error);
              setDone(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Action impossible");
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirmer le désabonnement
        </button>
      )}
    </main>
  );
}
export default function Page() {
  return (
    <Suspense fallback={<main className="onboarding">Chargement…</main>}>
      <Unsubscribe />
    </Suspense>
  );
}
