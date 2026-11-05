"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, MailCheck, ShieldCheck } from "lucide-react";
import { browserDb } from "@/lib/supabase/client";
import { authFailureMessage } from "@/lib/supabase/session";
import { AuthFrame } from "./auth-frame";
import styles from "./onboarding.module.css";

export function EmailConfirmation({
  email,
  destination,
  onEdit,
}: {
  email: string;
  destination: "/invite" | "/onboarding";
  onEdit: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(true);
  const [resends, setResends] = useState(0);
  const inFlight = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setCooldown(false), 60_000);
    return () => clearTimeout(timer);
  }, [resends]);
  return (
    <AuthFrame step={0}>
      <div className={styles.verificationIcon}>
        <MailCheck size={28} strokeWidth={1.6} />
      </div>
      <span className={styles.verificationEyebrow}>UNE DERNIÈRE ÉTAPE</span>
      <h1>Votre espace vous attend.</h1>
      <p className={styles.subtitle}>
        Saisissez le code reçu à <strong>{email}</strong> pour confirmer votre adresse.
      </p>
      <form
        className={styles.form}
        aria-busy={busy}
        onSubmit={async (event) => {
          event.preventDefault();
          if (inFlight.current) return;
          if (!/^\d{6,10}$/.test(code)) {
            setError("Saisissez le code complet reçu par e-mail.");
            return;
          }
          inFlight.current = true;
          setBusy(true);
          setError("");
          try {
            const { data, error } = await browserDb().auth.verifyOtp({
              email,
              token: code,
              type: "signup",
            });
            if (error) {
              setError("Ce code est invalide ou a expiré. Vérifiez-le ou demandez-en un nouveau.");
              return;
            }
            if (!data.session?.user?.id) throw new Error("Session unconfirmed");
            window.location.replace(destination);
          } catch (error) {
            setError(authFailureMessage(error));
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      >
        <label className={styles.field}>
          Code de confirmation
          <input
            className={styles.verificationCode}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="00000000"
            pattern="[0-9]{6,10}"
            minLength={6}
            maxLength={10}
            required
            autoFocus
            disabled={busy}
          />
        </label>
        {error && (
          <div className={styles.error} role="alert">
            {error}
          </div>
        )}
        {notice && (
          <p className={styles.hint} role="status">
            {notice}
          </p>
        )}
        <button className={styles.primary} disabled={busy}>
          {busy ? "Vérification…" : "Confirmer mon adresse"}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className={styles.verificationHelp}>
        <ShieldCheck size={16} />
        <span>Un code personnel, valable quelques minutes. Ne le partagez avec personne.</span>
      </div>
      <p className={styles.account}>Rien reçu ? Vérifiez les indésirables.</p>
      <button
        type="button"
        className={styles.secondary}
        disabled={busy || cooldown}
        onClick={async () => {
          if (inFlight.current || cooldown) return;
          inFlight.current = true;
          setBusy(true);
          setError("");
          setCooldown(true);
          setResends((n) => n + 1);
          try {
            const { error } = await browserDb().auth.resend({
              type: "signup",
              email,
              options: {
                emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(destination)}`,
              },
            });
            if (error) throw error;
            setNotice(
              "Si votre compte est en attente, un nouveau code vous sera envoyé. Utilisez le plus récent.",
            );
          } catch (error) {
            setError(authFailureMessage(error));
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      >
        {cooldown ? "Renvoi disponible après une minute" : "Recevoir un nouveau code"}
      </button>
      <button type="button" className={styles.secondary} disabled={busy} onClick={onEdit}>
        Corriger mon adresse e-mail
      </button>
      <p className={styles.account}>
        Déjà inscrit ? <Link href="/login">Se connecter</Link>
      </p>
    </AuthFrame>
  );
}
