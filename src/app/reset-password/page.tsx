"use client";
import { useState } from "react";
import { browserDb } from "@/lib/supabase/client";
export default function ResetPassword() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="onboarding">
      <span className="brand-mark">r</span>
      <h1>Nouveau mot de passe</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const password = String(new FormData(e.currentTarget).get("password"));
          const { error } = await browserDb().auth.updateUser({ password });
          if (error) setError(error.message);
          else window.location.assign("/app/companies");
          setBusy(false);
        }}
      >
        <label>
          Mot de passe
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {error && <div className="alert error">{error}</div>}
        <button className="button primary" disabled={busy}>
          Enregistrer
        </button>
      </form>
      <a href="/login">Retour à la connexion</a>
    </main>
  );
}
