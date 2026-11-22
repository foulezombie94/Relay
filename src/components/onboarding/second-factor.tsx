"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { browserDb } from "@/lib/supabase/client";
import { OtpInput } from "@/components/ui/otp-input";
import { AuthFrame } from "./auth-frame";
import styles from "./onboarding.module.css";

export function totpCode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

/** Second login step: a 6-digit code from the authenticator app upgrades the session to aal2. */
export function SecondFactorStep({ destination }: { destination: string }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      const auth = browserDb().auth;
      const { data: level, error: levelError } = await auth.mfa.getAuthenticatorAssuranceLevel();
      if (!active) return;
      if (levelError || !level) return window.location.replace("/login");
      if (level.currentLevel === "aal2" || level.nextLevel !== "aal2")
        return window.location.replace(destination);
      const { data, error: factorsError } = await auth.mfa.listFactors();
      if (!active) return;
      const factor = data?.totp.find((item) => item.status === "verified");
      if (factorsError || !factor) return window.location.replace("/login");
      setFactorId(factor.id);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [destination]);
  async function verify(value: string) {
    if (!factorId || inFlight.current || value.length !== 6) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { error } = await browserDb().auth.mfa.challengeAndVerify({ factorId, code: value });
      if (error) throw error;
      window.location.replace(destination);
    } catch {
      setError("Code incorrect ou expiré. Saisissez le code affiché actuellement.");
      setCode("");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <AuthFrame>
      <span className="tiny-icon">
        <ShieldCheck size={22} />
      </span>
      <h1>Vérification en deux étapes</h1>
      <p className={styles.subtitle}>
        Saisissez le code à 6 chiffres affiché par votre application d’authentification.
      </p>
      <form
        className={styles.form}
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
      >
        <div className={styles.field}>
          Code de vérification
          <OtpInput
            length={6}
            label="Code de vérification"
            autoFocus
            disabled={busy || !ready}
            value={code}
            status={error ? "error" : "idle"}
            onChange={(next) => setCode(totpCode(next))}
            onComplete={(next) => void verify(totpCode(next))}
          />
        </div>
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
        <button className={styles.primary} disabled={busy || !ready || code.length !== 6}>
          {busy ? "Vérification…" : "Vérifier"}
          <ArrowRight size={16} />
        </button>
      </form>
      <button
        className={styles.secondary}
        disabled={busy}
        onClick={async () => {
          await browserDb().auth.signOut();
          window.location.replace("/login");
        }}
      >
        Utiliser un autre compte
      </button>
      <p className="caption">
        Appareil perdu ? Un administrateur de votre espace ou le support peut réinitialiser votre
        second facteur après vérification de votre identité.
      </p>
    </AuthFrame>
  );
}
