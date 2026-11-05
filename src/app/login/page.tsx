"use client";
import { useRef, useState, Suspense } from "react";
import { browserDb } from "@/lib/supabase/client";
import { ArrowRight, Check, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authEmail, authFailureMessage, loginDestination } from "@/lib/supabase/session";
import { SignupFlow } from "@/components/onboarding/signup-flow";
import { AuthFrame } from "@/components/onboarding/auth-frame";
import styles from "@/components/onboarding/onboarding.module.css";
function LoginForm() {
  const searchParams = useSearchParams();
  const destination = loginDestination(searchParams.get("next"));
  const [mode, setMode] = useState<"login" | "signup" | "reset">(
    searchParams.get("mode") === "signup"
      ? "signup"
      : searchParams.get("mode") === "reset"
        ? "reset"
        : "login",
  );
  const [email, setEmail] = useState(() => searchParams.get("email")?.slice(0, 254) ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(
    searchParams.get("error") === "expired"
      ? "Ce lien a expiré. Reconnectez-vous ou demandez un nouveau lien."
      : "",
  );
  const inFlight = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    let address: string;
    try {
      address = authEmail(email);
      if (mode !== "reset" && !password) throw new Error("Saisissez votre mot de passe.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Informations invalides.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const client = browserDb();
      if (mode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(address, {
          redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
        });
        if (error) throw error;
        setMessage("Si ce compte existe, un lien de récupération a été envoyé.");
      } else {
        const { data, error } = await client.auth.signInWithPassword({
          email: address,
          password,
        });
        if (error) throw error;
        if (!data.session?.user?.id) throw new Error("Session unconfirmed");
        // Start with fresh server state after the SDK has persisted the cookies.
        window.location.replace(destination);
      }
    } catch (e) {
      setError(authFailureMessage(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (mode === "signup") return <SignupFlow />;
  return (
    <AuthFrame>
      <span className="tiny-icon">
        <Mail size={22} />
      </span>
      <h1>{mode === "reset" ? "Retrouver votre accès" : "Heureux de vous retrouver"}</h1>
      <p className={styles.subtitle}>
        {mode === "reset"
          ? "Recevez un lien pour choisir un nouveau mot de passe."
          : "Connectez-vous à votre espace de travail."}
      </p>
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <label className={styles.field}>
          Email professionnel
          <input
            type="email"
            disabled={busy}
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@entreprise.fr"
          />
        </label>
        {mode !== "reset" && (
          <label className={styles.field}>
            Mot de passe
            <input
              type="password"
              disabled={busy}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Votre mot de passe"
            />
          </label>
        )}
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="alert success">
            <Check size={16} />
            {message}
          </div>
        )}
        <button className={styles.primary} disabled={busy}>
          {busy ? "Un instant…" : mode === "reset" ? "Envoyer le lien" : "Se connecter"}
          <ArrowRight size={16} />
        </button>
      </form>
      <button
        className={styles.secondary}
        disabled={busy}
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError("");
          setMessage("");
        }}
      >
        {mode === "login"
          ? "Pas encore de compte ? Créer un compte"
          : "Vous avez un compte ? Se connecter"}
      </button>
      {mode === "login" && (
        <button className={styles.secondary} disabled={busy} onClick={() => setMode("reset")}>
          Mot de passe oublié
        </button>
      )}
      <div className="auth-divider" />
      <Link href="/demo" className="button full">
        Explorer la démonstration <ArrowRight size={16} />
      </Link>
      <p className="caption">La démonstration utilise uniquement des données fictives.</p>
    </AuthFrame>
  );
}
export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
