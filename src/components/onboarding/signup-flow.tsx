"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import { browserDb } from "@/lib/supabase/client";
import { authEmail, authFailureMessage } from "@/lib/supabase/session";
import { AuthFrame } from "./auth-frame";
import styles from "./onboarding.module.css";
import { EmailConfirmation } from "./email-confirmation";

export function SignupFlow() {
  const params = useSearchParams();
  const destination = params.get("next") === "/invite" ? "/invite" : "/onboarding";
  const [email, setEmail] = useState(() => params.get("email")?.slice(0, 254) ?? "");
  const [password, setPassword] = useState("");
  const [passwordStep, setPasswordStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const saving = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    let address: string;
    try {
      address = authEmail(email);
      if (passwordStep && (password.length < 8 || password.length > 128))
        throw new Error("Choisissez un mot de passe de 8 à 128 caractères.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Informations invalides.");
      return;
    }
    setError("");
    if (!passwordStep) {
      setEmail(address);
      setPasswordStep(true);
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      const { data, error } = await browserDb().auth.signUp({
        email: address,
        password,
        options: {
          data: { relay_onboarding_pending: true },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(destination)}`,
        },
      });
      if (error) throw error;
      // A successful pending signup must not be presented as a failed request.
      // Keep the response neutral, including for an existing email address.
      if (!data.session?.user?.id) {
        setPassword("");
        setAwaitingConfirmation(true);
        return;
      }
      window.location.replace(destination);
    } catch (e) {
      setError(authFailureMessage(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (awaitingConfirmation)
    return (
      <EmailConfirmation
        email={email}
        destination={destination}
        onEdit={() => {
          setAwaitingConfirmation(false);
          setPasswordStep(false);
          setError("");
        }}
      />
    );
  return (
    <AuthFrame step={0}>
      <h1>{passwordStep ? "Un accès à vous." : "Votre prochain chapitre commence ici."}</h1>
      <p className={styles.subtitle}>
        {passwordStep
          ? "Choisissez votre mot de passe. Ensuite, faisons connaissance."
          : "Créez votre compte et construisez un espace à l’image de votre équipe."}
      </p>
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        {!passwordStep ? (
          <label className={styles.field}>
            Votre adresse email
            <input
              type="email"
              autoComplete="email"
              autoFocus
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@entreprise.fr"
            />
          </label>
        ) : (
          <>
            <div className={styles.email}>
              <span>{email}</span>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => {
                  setPasswordStep(false);
                  setError("");
                }}
              >
                Modifier
              </button>
            </div>
            <div className={styles.field}>
              <label htmlFor="signup-password">Mot de passe</label>
              <PasswordInput
                id="signup-password"
                autoComplete="new-password"
                autoFocus
                required
                minLength={8}
                maxLength={128}
                disabled={busy}
                value={password}
                onChange={setPassword}
                aria-describedby="password-hint"
                placeholder="Au moins 8 caractères"
              />
              <span className={styles.hint} id="password-hint">
                Au moins 8 caractères. Utilisez un mot de passe unique.
              </span>
            </div>
          </>
        )}
        {error && (
          <div role="alert" className={styles.error}>
            {error}
          </div>
        )}
        <button className={styles.primary} disabled={busy}>
          {busy
            ? "Création de votre compte…"
            : passwordStep
              ? "Créer mon compte"
              : "Continuer avec mon email"}
          <ArrowRight size={16} />
        </button>
      </form>
      <p className={styles.account}>
        Déjà un compte ?{" "}
        <Link href={destination === "/invite" ? "/login?next=/invite" : "/login?next=/onboarding"}>
          Se connecter
        </Link>
      </p>
      <p className={styles.account}>
        <Link href="/demo">Découvrir Zyliad avant de commencer</Link>
      </p>
    </AuthFrame>
  );
}
