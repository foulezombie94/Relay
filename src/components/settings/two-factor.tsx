"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { browserDb } from "@/lib/supabase/client";
import { totpCode } from "../onboarding/second-factor";
import { OtpInput } from "@/components/ui/otp-input";
import styles from "./two-factor.module.css";

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };
type Enrollment = { id: string; qr: string; secret: string };

/** Enrol, verify and remove an authenticator-app (TOTP) second factor. */
export function TwoFactorSettings({ onEnabled }: { onEnabled?: () => void }) {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [aal2, setAal2] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const auth = browserDb().auth;
    const [{ data }, { data: level }] = await Promise.all([
      auth.mfa.listFactors(),
      auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    setFactors((data?.all ?? []) as Factor[]);
    setAal2(level?.currentLevel === "aal2");
  }, []);
  useEffect(() => {
    let active = true;
    const auth = browserDb().auth;
    Promise.all([auth.mfa.listFactors(), auth.mfa.getAuthenticatorAssuranceLevel()])
      .then(([{ data }, { data: level }]) => {
        if (!active) return;
        setFactors((data?.all ?? []) as Factor[]);
        setAal2(level?.currentLevel === "aal2");
      })
      .catch(() => {
        if (active) setError("Impossible de lire vos facteurs. Réessayez.");
      });
    return () => {
      active = false;
    };
  }, []);
  const verified = (factors ?? []).filter((f) => f.status === "verified");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const auth = browserDb().auth;
      // Abandoned enrolments block a new one with the same name: remove them first.
      for (const factor of (factors ?? []).filter((f) => f.status !== "verified"))
        await auth.mfa.unenroll({ factorId: factor.id });
      const { data, error } = await auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Application ${new Date().toLocaleDateString("fr-FR")}`,
      });
      if (error || !data) throw error ?? new Error("enroll");
      setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch {
      setError("L’activation n’a pas pu démarrer. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }
  async function confirm(value: string) {
    if (!enrollment || value.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await browserDb().auth.mfa.challengeAndVerify({
        factorId: enrollment.id,
        code: value,
      });
      if (error) throw error;
      setEnrollment(null);
      toast.success("Double authentification activée");
      await load();
      onEnabled?.();
    } catch {
      setError("Code incorrect. Vérifiez l’heure de votre téléphone et saisissez le code actuel.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  async function remove(factor: Factor) {
    if (
      !window.confirm(
        "Désactiver la double authentification ? Votre compte ne sera plus protégé par un second facteur.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const { error } = await browserDb().auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
      await browserDb().auth.refreshSession();
      toast.success("Double authentification désactivée");
      await load();
    } catch {
      setError(
        aal2
          ? "La désactivation a échoué. Réessayez."
          : "Reconnectez-vous avec votre code de vérification avant de désactiver ce facteur.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="two-factor-title">
      <header className={styles.head}>
        <span className={styles.icon} data-on={verified.length > 0}>
          {verified.length ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}
        </span>
        <div>
          <h3 id="two-factor-title">Double authentification</h3>
          <p>
            {verified.length
              ? "Activée : un code de votre application est demandé à chaque connexion."
              : "Protégez votre compte avec un code temporaire généré par une application (Google Authenticator, 1Password, Authy…)."}
          </p>
        </div>
        <span className={styles.status} data-on={verified.length > 0}>
          {factors === null ? "…" : verified.length ? "Activée" : "Désactivée"}
        </span>
      </header>
      {verified.map((factor) => (
        <div className={styles.factor} key={factor.id}>
          <Smartphone size={16} />
          <div>
            <strong>{factor.friendly_name || "Application d’authentification"}</strong>
            <small>Ajoutée le {new Date(factor.created_at).toLocaleDateString("fr-FR")}</small>
          </div>
          <button className="button small" disabled={busy} onClick={() => void remove(factor)}>
            Désactiver
          </button>
        </div>
      ))}
      {!verified.length && !enrollment && (
        <button
          className="button primary small"
          disabled={busy || factors === null}
          onClick={start}
        >
          <KeyRound size={14} /> Activer la double authentification
        </button>
      )}
      {enrollment && (
        <div className={styles.enroll}>
          <ol className={styles.steps}>
            <li>Scannez ce QR code avec votre application d’authentification.</li>
            <li>Saisissez le code à 6 chiffres affiché pour confirmer.</li>
          </ol>
          <div className={styles.enrollBody}>
            {/* Supabase returns the QR code as an SVG data URI generated locally. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.qr} src={enrollment.qr} alt="QR code d’activation" />
            <div className={styles.manual}>
              <span>Ou saisissez cette clé manuellement :</span>
              <code>{enrollment.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
              <button
                type="button"
                className="button small"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(enrollment.secret)
                    .then(() => toast.success("Clé copiée"))
                    .catch(() => toast.error("Copie impossible"))
                }
              >
                <Copy size={13} /> Copier la clé
              </button>
              <div className={styles.otpField}>
                Code de vérification
                <OtpInput
                  length={6}
                  size="sm"
                  label="Code de vérification"
                  autoFocus
                  disabled={busy}
                  value={code}
                  onChange={(next) => setCode(totpCode(next))}
                  onComplete={(next) => void confirm(totpCode(next))}
                />
              </div>
              <div className={styles.actions}>
                <button
                  className="button primary small"
                  disabled={busy || code.length !== 6}
                  onClick={() => void confirm(code)}
                >
                  Confirmer
                </button>
                <button
                  className="button small"
                  disabled={busy}
                  onClick={async () => {
                    await browserDb()
                      .auth.mfa.unenroll({ factorId: enrollment.id })
                      .catch(() => undefined);
                    setEnrollment(null);
                    await load();
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
