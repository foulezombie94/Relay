"use client";
import { useRef, useState, Suspense } from "react";
import { browserDb } from "@/lib/supabase/client";
import { ArrowRight, Check, Layers, Mail } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authEmail, authFailureMessage, loginDestination } from "@/lib/supabase/session";
function LoginForm() {
  const searchParams = useSearchParams();
  const destination = loginDestination(searchParams.get("next"));
  const [mode, setMode] = useState<"login" | "signup" | "reset">(
    searchParams.get("mode") === "signup" ? "signup" : "login",
  );
  const [email, setEmail] = useState(() => searchParams.get("email")?.slice(0, 254) ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    let address: string;
    try {
      address = authEmail(email);
      if (mode !== "reset" && password.length < 8)
        throw new Error("Le mot de passe doit contenir au moins 8 caractères.");
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
      } else if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email: address,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(destination)}`,
          },
        });
        if (error) throw error;
        if (!data.user && !data.session) throw new Error("Account creation unconfirmed");
        if (data.session) window.location.replace(destination);
        else
          setMessage(
            destination === "/invite"
              ? "Vérifiez votre email, puis revenez ici ou rouvrez votre lien d’invitation pour accepter."
              : "Vérifiez votre email pour confirmer votre compte.",
          );
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
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-mark">r</span>relay
          <span className="brand-suffix">CRM</span>
        </Link>
        <div>
          <span className="eyebrow">LE CONTEXTE FAIT LA DIFFÉRENCE</span>
          <h1>
            Vos relations.
            <br />
            La prochaine
            <br />
            <span>bonne action.</span>
          </h1>
          <p>
            Les clients, les échanges et les engagements de votre équipe, enfin au même endroit.
          </p>
          <div className="auth-proof">
            <Layers size={20} />
            <span>Un espace commun. Des accès maîtrisés.</span>
          </div>
        </div>
        <small>Conçu pour les équipes qui avancent ensemble.</small>
      </aside>
      <main className="auth-form">
        <div className="auth-form-inner">
          <span className="tiny-icon">
            <Mail size={22} />
          </span>
          <h2>
            {mode === "signup"
              ? "Bienvenue chez Relay"
              : mode === "reset"
                ? "Retrouver votre accès"
                : "Heureux de vous retrouver"}
          </h2>
          <p>
            {mode === "signup"
              ? "Créez votre compte, puis votre espace de travail."
              : "Connectez-vous à votre espace de travail."}
          </p>
          <form onSubmit={submit}>
            <label>
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
              <label>
                Mot de passe
                <input
                  type="password"
                  disabled={busy}
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Au moins 8 caractères"
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
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Un instant…"
                : mode === "signup"
                  ? "Créer mon compte"
                  : mode === "reset"
                    ? "Envoyer le lien"
                    : "Se connecter"}
              <ArrowRight size={16} />
            </button>
          </form>
          <button
            className="link-button"
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
            <button className="link-button muted" disabled={busy} onClick={() => setMode("reset")}>
              Mot de passe oublié
            </button>
          )}
          <div className="auth-divider" />
          <Link href="/demo" className="button full">
            Explorer la démonstration <ArrowRight size={16} />
          </Link>
          <p className="caption">La démonstration utilise uniquement des données fictives.</p>
        </div>
      </main>
    </div>
  );
}
export default function Login() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
