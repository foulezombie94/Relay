"use client";
import { useRef, useState } from "react";
import { browserDb } from "@/lib/supabase/client";
import { authFailureMessage } from "@/lib/supabase/session";
import { PasswordInput } from "@/components/ui/password-input";
import { useRouter } from "next/navigation";
export default function ResetPassword() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsReauthentication, setNeedsReauthentication] = useState(false);
  const [nonce, setNonce] = useState("");
  const [notice, setNotice] = useState("");
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
          if (password.length < 8 || password.length > 128) {
            setError("Choisissez un mot de passe de 8 à 128 caractères.");
            return;
          }
          if (password !== String(new FormData(e.currentTarget).get("confirmation") ?? "")) {
            setError("Les deux mots de passe ne correspondent pas.");
            return;
          }
          inFlight.current = true;
          setBusy(true);
          setError("");
          try {
            const client = browserDb();
            const { data, error } = await client.auth.updateUser({
              password,
              ...(needsReauthentication ? { nonce: nonce.trim() } : {}),
            });
            if (
              error &&
              [
                "reauthentication_needed",
                "reauth_nonce_missing",
                "reauthentication_not_valid",
              ].includes(error.code ?? "")
            ) {
              setNeedsReauthentication(true);
              setError(
                "Confirmez votre identité avec un code reçu par e-mail avant de modifier le mot de passe.",
              );
              return;
            }
            if (error) throw error;
            if (!data.user?.id) throw new Error("Password update unconfirmed");
            const { error: signOutError } = await client.auth.signOut({ scope: "global" });
            if (signOutError) {
              setNotice(
                "Mot de passe enregistré. La fermeture des autres sessions n’a pas pu être confirmée. Réessayez de vous déconnecter.",
              );
              return;
            }
            router.replace("/login");
            router.refresh();
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
          <PasswordInput
            disabled={busy}
            name="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirmez le mot de passe
          <PasswordInput
            strength={false}
            name="confirmation"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            disabled={busy}
          />
        </label>
        {needsReauthentication && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (inFlight.current) return;
                inFlight.current = true;
                setBusy(true);
                setError("");
                try {
                  const { error } = await browserDb().auth.reauthenticate();
                  if (error) throw error;
                  setNotice("Un code de vérification a été envoyé à l’adresse de votre compte.");
                } catch (error) {
                  setError(authFailureMessage(error));
                } finally {
                  inFlight.current = false;
                  setBusy(false);
                }
              }}
            >
              Recevoir un code de vérification
            </button>
            <label>
              Code reçu par e-mail
              <input
                name="nonce"
                value={nonce}
                onChange={(e) => setNonce(e.target.value)}
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={16}
                disabled={busy}
              />
            </label>
          </>
        )}
        {notice && <p role="status">{notice}</p>}
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
