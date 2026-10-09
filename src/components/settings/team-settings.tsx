"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, LoaderCircle, Search, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { request, useWorkspace } from "../providers/data-provider";
import { Avatar, date, ErrorMessage, Modal } from "../ui";
import { canManageTeamMember, invitationState, teamRoles, type TeamInvitation, type TeamMember } from "@/lib/domain/team";
import type { Role } from "@/lib/domain/types";
import { ReaderAccessEditor } from "./reader-access-editor";
import styles from "./team-settings.module.css";
type TeamResponse = { data: (TeamMember | TeamInvitation)[]; count: number };
export function TeamSettings() {
  const { workspace, user } = useWorkspace();
  const admin = workspace.role === "owner" || workspace.role === "admin";
  const cache = useQueryClient();
  const [kind, setKind] = useState<"members" | "invitations">("members");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<Role, "owner">>("member");
  const [change, setChange] = useState<{ member: TeamMember; role: "admin" | "member" | "viewer" | "remove" } | null>(null);
  const [replacement, setReplacement] = useState(user.id);
  const [access, setAccess] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [links, setLinks] = useState<Record<string, { url: string; issued: string }>>({});
  const [ready, setReady] = useState<{ url: string; email: string } | null>(null);
  function remember(result: { invitation_url?: string; invitation?: TeamInvitation }) {
    if (!result.invitation_url || !result.invitation) return;
    const url = result.invitation_url, invitation = result.invitation;
    setLinks(current => ({ ...current, [invitation.id]: { url, issued: invitation.last_issued_at } }));
    setReady({ url, email: invitation.email });
  }
  const q = useQuery({ queryKey: ["team", workspace.id, kind, page, filter, roleFilter], enabled: admin,
    queryFn: () => request<TeamResponse>("/api/" + workspace.id + "/team?" + new URLSearchParams({ kind, page: String(page), q: filter, role: roleFilter })),
  });
  const candidates = useQuery({ queryKey: ["team", workspace.id, "candidates"], enabled: admin && change?.role === "remove", queryFn: () => request<TeamResponse>("/api/" + workspace.id + "/team?candidates=true") });
  const impact = useQuery({ queryKey: ["team", workspace.id, "impact", change?.member.user_id], enabled: admin && change?.role === "remove", queryFn: () => request<{ counts: Record<string, number> }>("/api/" + workspace.id + "/team?impact=" + change!.member.user_id) });
  async function refresh() { await Promise.all([cache.invalidateQueries({ queryKey: ["team", workspace.id] }), cache.invalidateQueries({ queryKey: ["rows", workspace.id] })]); }
  async function mutate(body: unknown) {
    setBusy(true); setError("");
    try {
      const result = await request<{ message?: string; invitation_url?: string; invitation?: TeamInvitation }>("/api/" + workspace.id + "/team", "PATCH", body);
      remember(result); await refresh(); if (result.message) setMessage(result.message); return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Modification impossible."); await refresh(); return false; }
    finally { setBusy(false); }
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); toast.success("Lien d’invitation copié."); }
    catch { setError("La copie a été bloquée. Sélectionnez le lien et copiez-le manuellement."); }
  }
  const allowedRoles = ["admin", "member", "viewer"] as const;
  return <section id="equipe" className={styles.root}>
    <header className={styles.heading}><div><h3>Équipe et accès</h3><p>Invitez vos collaborateurs, choisissez leurs droits et suivez leurs accès.</p></div>{admin && <button className="button primary" onClick={() => { setError(""); setEmail(""); setInviteRole("member"); setInviting(true); }}><UserPlus size={15} />Inviter</button>}</header>
    <details className={styles.roles}><summary><ShieldCheck size={16} />Comprendre les rôles</summary><div>{Object.entries(teamRoles).map(([key, value]) => <article key={key}><strong>{value.label}</strong><p>{value.description}</p></article>)}</div><p>Les membres et administrateurs travaillent dans tout l’espace. Pour chaque lecteur, choisissez tout l’espace ou des fiches précises. Les notes et messages privés conservent leurs restrictions. Les clients externes utilisent les portails.</p></details>
    {!admin ? <p className={styles.notice}>Votre rôle : {teamRoles[workspace.role].label}. Seuls les administrateurs et le propriétaire peuvent gérer les accès.</p> : <>
      <div className={styles.tabs} role="group" aria-label="Afficher les accès">{(["members", "invitations"] as const).map(tab => <button key={tab} aria-pressed={kind === tab} onClick={() => { setKind(tab); setPage(0); setRoleFilter(""); }}>{tab === "members" ? "Membres" : "Invitations"}</button>)}</div>
      <div className={styles.toolbar}><form onSubmit={event => { event.preventDefault(); setFilter(search); setPage(0); }}><Search size={15} /><input aria-label="Rechercher dans l’équipe" placeholder={kind === "members" ? "Rechercher un membre…" : "Rechercher une adresse…"} value={search} maxLength={120} onChange={event => setSearch(event.target.value)} /><button className="button small" type="submit">Rechercher</button></form><select aria-label="Filtrer par rôle" value={roleFilter} onChange={event => { setRoleFilter(event.target.value); setPage(0); }}><option value="">Tous les rôles</option>{Object.entries(teamRoles).filter(([key]) => kind === "members" || key !== "owner").map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div>
      {message && <div className="alert info" role="status">{message}</div>}{error && <div className="alert error" role="alert">{error}</div>}<ErrorMessage error={q.error} />
      {q.isPending ? <p className={styles.notice}><LoaderCircle size={16} className="spin" />Chargement de l’équipe…</p> : <div className={styles.table}><table><thead><tr><th>{kind === "members" ? "Personne" : "Adresse invitée"}</th><th>Rôle</th><th>{kind === "members" ? "Accès" : "Statut"}</th><th>Actions</th></tr></thead><tbody>
        {kind === "members" ? (q.data?.data as TeamMember[] | undefined)?.map(member => {
          const editable = canManageTeamMember(workspace.role, user.id, member);
          return <tr key={member.id}><td><span className={styles.identity}><Avatar name={member.display_name || "Membre"} /><span><strong>{member.display_name || "Membre"}</strong><small>Depuis le {date(member.created_at)}{member.user_id === user.id ? " · Vous" : ""}</small></span></span></td><td><select aria-label={"Rôle de " + member.display_name} value={member.role} disabled={!editable || busy} onChange={event => { setError(""); setChange({ member, role: event.target.value as "admin" | "member" | "viewer" }); }}>
            {member.role === "owner" && <option value="owner">Propriétaire</option>}{allowedRoles.map(role => <option key={role} value={role}>{teamRoles[role].label}</option>)}</select></td><td><span className={styles.status}>{member.role === "viewer" ? member.reader_scope === "selected" ? "Fiches choisies" : "Tout l’espace" : "Actif"}</span></td><td><div className={styles.actions}>{member.role === "viewer" && <button className="button small" disabled={busy} onClick={() => setAccess(member)}>Données visibles</button>}{editable ? <button className="button small danger" disabled={busy} onClick={() => { setError(""); setReplacement(user.id); setChange({ member, role: "remove" }); }}>Retirer l’accès</button> : <span className={styles.protected}>Accès protégé</span>}</div></td></tr>;
        }) : (q.data?.data as TeamInvitation[] | undefined)?.map(invitation => {
          const status = invitationState(invitation);
          const editable = !invitation.accepted_at;
          return <tr key={invitation.id}><td><strong>{invitation.email}</strong><small className={styles.date}>Échéance : {date(invitation.expires_at)}</small></td><td>{teamRoles[invitation.role].label}</td><td><span className={styles.status} data-state={status}>{status}</span></td><td><div className={styles.actions}>
            {editable && <><button className="button small" disabled={busy} onClick={() => { if (window.confirm("Créer un nouveau lien valable 7 jours ? L’ancien lien ne fonctionnera plus.")) void mutate({ invitation_id: invitation.id, action: "renew" }); }}>Renouveler le lien</button>{!invitation.revoked_at && <button className="button small danger" disabled={busy} onClick={() => { if (window.confirm("Annuler cette invitation ? Elle ne donnera plus accès à l’espace.")) void mutate({ invitation_id: invitation.id, action: "cancel" }); }}>Annuler</button>}</>}
            {status === "En attente" && links[invitation.id]?.issued === invitation.last_issued_at && <button className="icon-button" aria-label={"Copier le lien pour " + invitation.email} onClick={() => copy(links[invitation.id].url)}><Copy size={15} /></button>}
          </div></td></tr>;
        })}
        {!q.error && q.data?.data.length === 0 && <tr><td colSpan={4} className={styles.empty}>Aucun résultat. Modifiez les filtres ou invitez une personne.</td></tr>}
      </tbody></table></div>}
      <footer className={styles.pagination}><span>{q.data?.count ?? 0} résultat{q.data?.count === 1 ? "" : "s"} · Page {page + 1}</span><div><button className="button small" disabled={page === 0 || q.isFetching} onClick={() => setPage(current => current - 1)}>Précédente</button><button className="button small" disabled={q.isFetching || (page + 1) * 25 >= (q.data?.count ?? 0)} onClick={() => setPage(current => current + 1)}>Suivante</button></div></footer>
      {kind === "invitations" && <p className={styles.notice}>Aucun email d’invitation n’est envoyé. Copiez le lien affiché après création ou renouvellement et partagez-le avec la personne invitée. Il expire après 7 jours et exige son adresse vérifiée. Si vous n’avez plus le lien, renouvelez-le : l’ancien sera invalidé.</p>}
    </>}
    {access && <ReaderAccessEditor member={access} onClose={() => setAccess(null)} onSaved={refresh} />}
    {inviting && <Modal open title="Inviter dans l’espace" description="La personne recevra les droits du rôle choisi après vérification de son adresse." onClose={() => { if (!busy) setInviting(false); }}>
      <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { const result = await request<{ message: string; invitation_url: string; invitation: TeamInvitation }>("/api/" + workspace.id + "/team", "POST", { email, role: inviteRole }); remember(result); setMessage(result.message); setInviting(false); setKind("invitations"); setPage(0); setFilter(""); setSearch(""); setRoleFilter(""); await refresh(); } catch (err) { setError(err instanceof Error ? err.message : "Invitation impossible."); } finally { setBusy(false); } }}>
        <label>Email professionnel<input type="email" autoFocus required maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label><label className={styles.modalLabel}>Rôle<select value={inviteRole} disabled={busy} onChange={event => setInviteRole(event.target.value as Exclude<Role, "owner">)}>{allowedRoles.map(role => <option key={role} value={role}>{teamRoles[role].label}</option>)}</select></label><p className={styles.notice}>{teamRoles[inviteRole].description}</p>
        {error && <div className="alert error" role="alert">{error}</div>}<div className="dialog-footer"><button className="button" type="button" disabled={busy} onClick={() => setInviting(false)}>Annuler</button><button className="button primary" disabled={busy}>{busy ? "Création…" : "Créer l’invitation"}</button></div>
      </form>
    </Modal>}
    {ready && <Modal open title="Votre lien d’invitation" description={ready.email} onClose={() => setReady(null)}>
      <p>Partagez ce lien uniquement avec cette personne. Elle devra se connecter avec son adresse vérifiée et confirmer son entrée dans l’espace.</p>
      <label>Lien personnel<input readOnly value={ready.url} onFocus={event => event.currentTarget.select()} /></label>
      <p className={styles.notice}>Valable 7 jours. Le lien est affiché uniquement après sa génération ; si vous le perdez, renouvelez-le depuis Invitations. Aucun email d’invitation n’est envoyé.</p>
      {error && <div className="alert error" role="alert">{error}</div>}<div className="dialog-footer"><button className="button" onClick={() => setReady(null)}>Fermer</button><button className="button primary" onClick={() => copy(ready.url)}><Copy size={15} />Copier le lien</button></div>
    </Modal>}
    {change && <Modal open title={change.role === "remove" ? "Retirer l’accès à l’espace" : "Confirmer le changement de rôle"} description={change.member.display_name || "Membre"} onClose={() => { if (!busy) setChange(null); }}>
      {change.role === "remove" ? <><p>Ses fiches, tâches, engagements et réalisations seront réattribués. Les notes et l’historique restent conservés. Ses accès aux portails de cet espace seront également retirés. Ses connexions et traitements en cours seront désactivés.</p><ErrorMessage error={impact.error ?? candidates.error} /><div className={styles.impact}>{Object.entries(impact.data?.counts ?? {}).map(([key, count]) => <span key={key}>{({ records: "Fiches", tasks: "Tâches", commitments: "Engagements", handovers: "Réalisations" } as Record<string, string>)[key]}<strong>{count}</strong></span>)}</div><label>Réattribuer à<select value={replacement} disabled={busy} onChange={event => setReplacement(event.target.value)}><option value={user.id}>Moi · {user.email}</option>{(candidates.data?.data as TeamMember[] | undefined)?.filter(member => member.user_id !== change.member.user_id && member.user_id !== user.id).map(member => <option key={member.id} value={member.user_id}>{member.display_name || "Membre"}</option>)}</select></label>{(candidates.data?.count ?? 0) > 100 && <p className={styles.notice}>Les 100 premiers responsables sont proposés. Vous pouvez vous attribuer les éléments puis les répartir depuis le CRM.</p>}</> : <><p>Passer de <strong>{teamRoles[change.member.role].label}</strong> à <strong>{teamRoles[change.role].label}</strong>.</p><p>{teamRoles[change.role].description}</p>{change.role === "viewer" && <p>Ses connexions et ses traitements seront désactivés, car le rôle Lecteur ne peut plus modifier les données.</p>}</>}
      {change.role === "viewer" && <p className={styles.notice}>Aucune fiche ne sera visible par défaut. Après confirmation, utilisez Données visibles pour choisir les fiches ou autoriser tout l’espace.</p>}
      {error && <div className="alert error" role="alert">{error}</div>}<div className="dialog-footer"><button className="button" disabled={busy} onClick={() => setChange(null)}>Annuler</button><button className={"button " + (change.role === "remove" ? "danger" : "primary")} disabled={busy || (change.role === "remove" && (impact.isPending || candidates.isPending || !!impact.error || !!candidates.error))} onClick={async () => { if (await mutate({ user_id: change.member.user_id, role: change.role, expected_version: change.member.version, ...(change.role === "remove" ? { replacement } : {}) })) { setChange(null); toast.success("Accès mis à jour."); } }}>{busy ? "Enregistrement…" : change.role === "remove" ? "Réattribuer et retirer l’accès" : "Confirmer le rôle"}</button></div>
    </Modal>}
  </section>;
}
