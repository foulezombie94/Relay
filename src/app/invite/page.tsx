"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { browserDb } from "@/lib/supabase/client";
import { teamRoles } from "@/lib/domain/team";
import type { Role } from "@/lib/domain/types";

type Info = { name: string; email: string; role: Role; expires_at: string };
export default function Invite() {
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [status, setStatus] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const boot = useRef<Promise<{ status: number; data: Info & { error?: string } }> | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const secret = new URLSearchParams(window.location.hash.slice(1)).get("token");
        // Strip the secret before navigation or telemetry; the API stores it in an HttpOnly cookie.
        window.history.replaceState(null, "", "/invite");
        if (secret) {
          if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Lien d’invitation invalide.");
          const opened = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "open", token: secret }) });
          if (!opened.ok) throw new Error("Impossible d’ouvrir ce lien. Rouvrez l’invitation.");
        }
        const response = await fetch("/api/invitations", { cache: "no-store" }); const data = await response.json();
        return { status: response.status, data };
      } catch (err) { throw err; }
    }
    boot.current ??= load();
    void boot.current.then(result => {
      if (!active) return;
      setStatus(result.status);
      if (result.status === 200) setInfo(result.data); else setError(result.data.error ?? "Invitation indisponible.");
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Invitation indisponible."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function accept() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }) });
      const data = await response.json();
      if (!response.ok) { setStatus(response.status); throw new Error(data.error ?? "Invitation indisponible."); }
      router.replace("/app/companies?workspace=" + encodeURIComponent(data.workspace)); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Invitation indisponible."); setBusy(false); }
  }
  return <main className="auth-page" style={{ justifyContent: "center" }}><div className="auth-form" style={{ maxWidth: 580, width: "100%" }}><div className="auth-form-inner">
    <Link href="/" className="brand"><span className="brand-mark">r</span>relay</Link>
    <div className="tiny-icon" style={{ marginTop: 36 }}><ShieldCheck size={24} /></div>
    <h1 style={{ fontSize: 28 }}>Rejoindre votre équipe</h1>
    {loading ? <p role="status">Vérification de votre invitation…</p> : <>
      {info && <><p>Vous êtes invité dans <strong>{info.name}</strong>.</p><div className="detail-card"><p><strong>{info.email}</strong></p><p>Rôle : {teamRoles[info.role].label}</p><p className="caption">{teamRoles[info.role].description}</p><p className="caption">Valable jusqu’au {new Date(info.expires_at).toLocaleDateString("fr-FR")}.</p></div></>}
      {error && <div role="alert" className="alert error">{error}</div>}
      {info && status === 200 && <button className="button primary full" disabled={busy} onClick={accept}>{busy ? "Confirmation…" : "Accepter et rejoindre l’espace"}<ArrowRight size={16} /></button>}
      {status === 401 && <><p>Connectez-vous ou créez un compte avec l’adresse invitée, puis vérifiez votre email.</p><Link href="/login?next=/invite" className="button primary full">Se connecter</Link><Link href="/login?mode=signup&next=/invite" className="button full" style={{ marginTop: 12 }}>Créer mon compte</Link></>}
      {status !== 401 && <button className="link-button" disabled={busy} onClick={async () => { setBusy(true); try { const { error } = await browserDb().auth.signOut({ scope: "local" }); if (error) throw error; window.location.replace("/login?next=/invite"); } catch { setError("Impossible de changer de compte. Réessayez."); setBusy(false); } }}>Utiliser un autre compte</button>}
      <p className="caption">Ce lien est personnel. Il exige l’adresse invitée vérifiée et peut être annulé par l’administrateur.</p>
    </>}
  </div></div></main>;
}
