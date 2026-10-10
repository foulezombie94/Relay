"use client";
import { useRef, useState } from "react";
import { browserDb } from "@/lib/supabase/client";
import { authFailureMessage } from "@/lib/supabase/session";
import { useRouter } from "next/navigation";
export default function ResetPassword() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const router = useRouter();
  return (
    <main className="onboarding">
      <span className="brand-mark">z</span>
      <h1>Nouveau mot de passe</h1>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (inFlight.current) return;
          const password = String(new FormData(e.currentTarget).get("password") ?? "");
          if (password.length < 8) {
            setError("Le mot de passe doit contenir au moins 8 caractères.");
            return;
          }
          inFlight.current = true;
          setBusy(true);
          setError("");
          try {
            const { data, error } = await browserDb().auth.updateUser({ password });
            if (error) throw error;
            if (!data.user?.id) throw new Error("Password update unconfirmed");
            router.replace("/app/companies");
          } catch (error) {
            setError(authFailureMessage(error));
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      >
        <label>
          Mot de passe
          <input
            type="password"
            disabled={busy}
            name="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button className="button primary" disabled={busy}>
          Enregistrer
        </button>
      </form>
      <a href="/login">Retour à la connexion</a>
    </main>
  );
}
