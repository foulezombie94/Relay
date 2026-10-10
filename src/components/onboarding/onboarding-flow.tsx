"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Mail, Upload, Users } from "lucide-react";
import { browserDb } from "@/lib/supabase/client";
import { authFailureMessage } from "@/lib/supabase/session";
import { request, confirmedRow, RequestError } from "@/lib/api/request";
import { creationAttempt } from "@/lib/api/save-attempt";
import { onboardingWorkspace, profileName } from "@/lib/domain/onboarding";
import { z } from "zod";
import { AuthFrame } from "./auth-frame";
import styles from "./onboarding.module.css";

type InitialUser = { id: string; email?: string; name: string; pending?: boolean };
type Space = { id: string; name: string; role: string };
const spacesResponse = z.object({
  data: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      role: z.enum(["owner", "admin", "member", "viewer"]),
    }),
  ),
  user: z.object({ id: z.string().min(1) }),
});
export function OnboardingFlow({ user }: { user: InitialUser }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fullName, setFullName] = useState(user.name);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Europe/Paris");
  const [workspace, setWorkspace] = useState<Space | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const load = useCallback(async () => {
    const parsed = spacesResponse.safeParse(await request("/api/workspaces"));
    if (!parsed.success || parsed.data.user.id !== user.id)
      throw new RequestError(
        "Le chargement de votre espace n’a pas été confirmé. Reconnectez-vous ou réessayez.",
        502,
      );
    return parsed.data.data;
  }, [user.id]);
  useEffect(() => {
    let active = true;
    void load()
      .then((rows) => {
        if (!active) return;
        setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris");
        setSpaces(rows);
        if (rows[0]) {
          setWorkspace(rows[0]);
          setStep(user.pending && !profileName.safeParse(user.name).success ? 1 : 3);
        } else if (profileName.safeParse(user.name).success) setStep(2);
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : "Chargement impossible.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, user.name, user.pending]);

  async function act(task: () => Promise<void>) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof RequestError ? e.message : authFailureMessage(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    const parsed = profileName.safeParse(fullName);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    await act(async () => {
      const { data, error } = await browserDb().auth.updateUser({
        data: { full_name: parsed.data, relay_onboarding_pending: true },
      });
      if (error) throw error;
      if (data.user?.id !== user.id)
        throw new RequestError("Votre profil n’a pas été enregistré. Réessayez.", 502);
      setFullName(parsed.data);
      setStep(workspace ? 3 : 2);
    });
  }
  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const parsed = onboardingWorkspace
      .omit({ attemptId: true })
      .safeParse({ name, fullName, timezone });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    await act(async () => {
      const attempt = await creationAttempt(
        `${process.env.NEXT_PUBLIC_RELAY_ENVIRONMENT}:${process.env.NEXT_PUBLIC_SUPABASE_URL}:${user.id}`,
        "onboarding-workspace",
        parsed.data,
      );
      const saved = confirmedRow(
        await request<{ id: string }>("/api/onboarding", "POST", {
          ...parsed.data,
          attemptId: attempt.id,
        }),
      );
      // Read back membership and setup before showing success. Keep the attempt
      // on uncertain responses so a retry resumes the committed transaction.
      const rows = await load();
      const created = rows.find((row) => row.id === saved.id);
      if (!created)
        throw new RequestError(
          "Votre espace n’a pas encore pu être chargé. Réessayez pour reprendre sa création.",
          502,
        );
      attempt.confirm();
      setSpaces(rows);
      setWorkspace(created);
      setStep(3);
    });
  }
  async function finish(path: string) {
    if (!workspace) return;
    await act(async () => {
      const { data, error } = await browserDb().auth.updateUser({
        data: { relay_onboarding_pending: false },
      });
      if (error) throw error;
      if (data.user?.id !== user.id)
        throw new RequestError("La finalisation n’a pas été confirmée. Réessayez.", 502);
      const url = new URL(path, window.location.origin);
      url.searchParams.set("workspace", workspace.id);
      window.location.replace(url.pathname + url.search + url.hash);
    });
  }
  return (
    <AuthFrame step={step}>
      {loading ? (
        <p className={styles.loading} role="status">
          Préparation de votre espace…
        </p>
      ) : loadError ? (
        <>
          <h1>Reprenons ensemble.</h1>
          <p role="alert" className={styles.error}>
            {loadError}
          </p>
          <button className={styles.primary} onClick={() => window.location.reload()}>
            Réessayer
          </button>
          <p className={styles.account}>
            <Link href="/login?next=/onboarding">Se reconnecter</Link>
          </p>
        </>
      ) : step === 1 ? (
        <>
          <h1>Comment vous appeler ?</h1>
          <p className={styles.subtitle}>
            Un nom pour vous retrouver dans votre équipe et sur vos échanges.
          </p>
          <form className={styles.form} onSubmit={saveProfile} aria-busy={busy}>
            <label className={styles.field}>
              Votre nom complet
              <input
                autoComplete="name"
                autoFocus
                required
                minLength={2}
                maxLength={80}
                disabled={busy}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Camille Martin"
              />
            </label>
            <span className={styles.hint}>{user.email}</span>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            <button className={styles.primary} disabled={busy}>
              {busy ? "Enregistrement…" : "Continuer"}
              <ArrowRight size={16} />
            </button>
          </form>
        </>
      ) : step === 2 ? (
        <>
          <h1>Un espace pour votre équipe.</h1>
          <p className={styles.subtitle}>
            Choisissez un nom. Vos personnes, entreprises et opportunités seront prêtes à accueillir
            vos données.
          </p>
          <form className={styles.form} onSubmit={createWorkspace} aria-busy={busy}>
            <label className={styles.field}>
              Nom de votre espace
              <input
                autoFocus
                required
                maxLength={120}
                disabled={busy}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Votre entreprise ou votre équipe"
              />
            </label>
            <label className={styles.field}>
              Fuseau horaire
              <input
                required
                maxLength={80}
                list="onboarding-timezones"
                disabled={busy}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                aria-describedby="timezone-hint"
              />
              <datalist id="onboarding-timezones">
                {[
                  "Europe/Paris",
                  "Europe/Brussels",
                  "Europe/Zurich",
                  "Europe/London",
                  "Africa/Casablanca",
                  "America/Montreal",
                  "America/New_York",
                  "UTC",
                ].map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              <span id="timezone-hint" className={styles.hint}>
                Détecté depuis votre appareil. Vous pourrez le modifier dans les paramètres.
              </span>
            </label>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            <button className={styles.primary} disabled={busy}>
              {busy ? "Création de votre espace…" : "Créer mon espace"}
              <ArrowRight size={16} />
            </button>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => {
                setStep(1);
                setError("");
              }}
            >
              Revenir à mon profil
            </button>
          </form>
          <p className={styles.account}>
            Vous accédez à un portail client ? <Link href="/portal">Ouvrir le portail</Link>
          </p>
        </>
      ) : workspace ? (
        <>
          <span className={styles.successIcon}>
            <Check size={25} />
          </span>
          <h1>Votre espace est prêt.</h1>
          <p className={styles.subtitle}>
            Bienvenue dans {workspace.name}. Choisissez votre première étape ou explorez votre
            espace dès maintenant.
          </p>
          {spaces.length > 1 && (
            <label className={styles.field}>
              Espace à ouvrir
              <select
                disabled={busy}
                value={workspace.id}
                onChange={(event) =>
                  setWorkspace(spaces.find((row) => row.id === event.target.value) ?? workspace)
                }
              >
                {spaces.map((space) => (
                  <option value={space.id} key={space.id}>
                    {space.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className={styles.actions}>
            <button
              className={styles.action}
              disabled={busy || workspace.role === "viewer"}
              onClick={() => void finish("/app/integrations")}
            >
              <Mail size={19} />
              <span>
                <strong>Connecter mes échanges</strong>
                <small>Choisir Gmail ou Outlook dans les intégrations.</small>
              </span>
              <ArrowRight size={15} />
            </button>
            <button
              className={styles.action}
              disabled={busy || workspace.role === "viewer"}
              onClick={() => void finish("/app/people?import=1")}
            >
              <Upload size={19} />
              <span>
                <strong>Importer mes contacts</strong>
                <small>Ouvrir l’import CSV et associer vos colonnes.</small>
              </span>
              <ArrowRight size={15} />
            </button>
            {["owner", "admin"].includes(workspace.role) && (
              <button
                className={styles.action}
                disabled={busy}
                onClick={() => void finish("/app/settings#equipe")}
              >
                <Users size={19} />
                <span>
                  <strong>Inviter mon équipe</strong>
                  <small>Gérer les invitations et les accès.</small>
                </span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <button
            className={styles.primary}
            disabled={busy}
            onClick={() => void finish("/app/dashboard")}
          >
            {busy ? "Ouverture…" : "Ouvrir mon espace"}
            <ArrowRight size={16} />
          </button>
          <p className={styles.account}>Ces premières étapes sont facultatives.</p>
        </>
      ) : null}
    </AuthFrame>
  );
}
