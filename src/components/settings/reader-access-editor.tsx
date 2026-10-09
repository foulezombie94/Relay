"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request, useWorkspace } from "../providers/data-provider";
import { ErrorMessage, Modal } from "../ui";
import type { TeamMember } from "@/lib/domain/team";
import { toast } from "sonner";
import styles from "./reader-access-editor.module.css";
type RecordOption = { id: string; display_name: string; object_id: string; archived: boolean };
type Access = { member: Pick<TeamMember, "user_id" | "display_name" | "reader_scope" | "version">; records: RecordOption[] };
type Props = { member: TeamMember; onClose: () => void; onSaved: () => Promise<void> };
export function ReaderAccessEditor(props: Props) {
  const { workspace } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["team", workspace.id, "access", props.member.user_id], queryFn: () => request<Access>(`/api/${workspace.id}/team/access?user=${props.member.user_id}`) });
  return <Modal open title="Données visibles par le lecteur" description={props.member.display_name} onClose={() => { if (!busy) props.onClose(); }}>
    <ErrorMessage error={q.error} />{q.isPending ? <p>Chargement des droits…</p> : q.data && <AccessForm key={q.data.member.user_id + ":" + q.data.member.version} {...props} initial={q.data} busy={busy} setBusy={setBusy} />}
  </Modal>;
}
function AccessForm({ initial, busy, setBusy, onClose, onSaved }: Props & { initial: Access; busy: boolean; setBusy: (value: boolean) => void }) {
  const { workspace, objects } = useWorkspace();
  const [scope, setScope] = useState(initial.member.reader_scope);
  const [chosen, setChosen] = useState(() => new Map(initial.records.map(row => [row.id, row])));
  const [text, setText] = useState(""); const [search, setSearch] = useState("");
  const [object, setObject] = useState(""); const [page, setPage] = useState(0); const [error, setError] = useState("");
  const q = useQuery({ queryKey: ["team", workspace.id, "record-options", search, object, page], enabled: scope === "selected",
    queryFn: () => request<{ data: RecordOption[]; count: number }>(`/api/${workspace.id}/team/access?` + new URLSearchParams({ mode: "records", q: search, object, page: String(page) })) });
  function toggle(row: RecordOption) {
    if (!chosen.has(row.id) && chosen.size >= 1000) { setError("1000 fiches maximum par sélection."); return; }
    setChosen(current => { const next = new Map(current); if (next.has(row.id)) next.delete(row.id); else next.set(row.id, row); return next; });
  }
  async function save() {
    if (scope === "all" && !window.confirm("Ce lecteur pourra consulter toutes les données partagées de l’espace. Confirmer ?")) return;
    setBusy(true); setError("");
    try {
      await request(`/api/${workspace.id}/team/access`, "POST", { user: initial.member.user_id, version: initial.member.version, scope, records: scope === "selected" ? [...chosen.keys()] : [] });
      await onSaved(); toast.success("Visibilité du lecteur enregistrée."); onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Enregistrement impossible."); }
    finally { setBusy(false); }
  }
  return <div className={styles.root}>
    <div className={styles.modes} role="group" aria-label="Visibilité des données">
      <label><input type="radio" name="reader-scope" checked={scope === "selected"} disabled={busy} onChange={() => setScope("selected")} /><span><strong>Fiches choisies</strong><small>Seules les fiches sélectionnées et leurs données liées sont visibles.</small></span></label>
      <label><input type="radio" name="reader-scope" checked={scope === "all"} disabled={busy} onChange={() => setScope("all")} /><span><strong>Tout l’espace</strong><small>Accès aux données partagées, avec les restrictions habituelles sur les données privées.</small></span></label>
    </div>
    {scope === "selected" && <>
      <p className="caption">{chosen.size} fiche{chosen.size === 1 ? "" : "s"} autorisée{chosen.size === 1 ? "" : "s"}. Sans sélection, aucune fiche n’est visible. Autoriser une entreprise n’autorise pas automatiquement ses contacts ou opportunités.</p>
      <form className={styles.search} onSubmit={event => { event.preventDefault(); setSearch(text); setPage(0); }}><input aria-label="Rechercher des fiches" placeholder="Rechercher une entreprise, personne…" maxLength={120} value={text} disabled={busy} onChange={event => setText(event.target.value)} /><button type="submit" className="button small" disabled={busy}>Rechercher</button></form>
      <select aria-label="Type de fiche" value={object} disabled={busy} onChange={event => { setObject(event.target.value); setPage(0); }}><option value="">Tous les types</option>{objects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <ErrorMessage error={q.error} />
      <div className={styles.results}>{q.isPending ? <p>Chargement…</p> : q.data?.data.map(row => <label key={row.id}><input type="checkbox" disabled={busy} checked={chosen.has(row.id)} onChange={() => toggle(row)} /><span><strong>{row.display_name}</strong><small>{objects.find(item => item.id === row.object_id)?.name ?? "Fiche"}</small></span></label>)}{q.data?.data.length === 0 && <p>Aucune fiche ne correspond à cette recherche.</p>}</div>
      <div className={styles.pagination}><span>Page {page + 1} · {q.data?.count ?? 0} résultats</span><button className="button small" disabled={busy || page === 0 || q.isFetching} onClick={() => setPage(value => value - 1)}>Précédente</button><button className="button small" disabled={busy || q.isFetching || (page + 1) * 25 >= (q.data?.count ?? 0)} onClick={() => setPage(value => value + 1)}>Suivante</button></div>
      {chosen.size > 0 && <details><summary>Voir les {chosen.size} fiches autorisées</summary><div className={styles.results}>{[...chosen.values()].map(row => <div className={styles.selected} key={row.id}><span>{row.display_name}{row.archived ? " · Archivée" : ""}</span><button className="button small" disabled={busy} onClick={() => toggle(row)}>Retirer</button></div>)}</div></details>}
      <p className="caption">Les recherches, exports, rapports et documents suivent cette sélection. Les notes privées restent privées. Les données globales d’automatisation, d’import et de séquence ne sont pas partagées dans ce mode.</p>
    </>}
    {error && <div className="alert error" role="alert">{error}</div>}<div className="dialog-footer"><button className="button" disabled={busy} onClick={onClose}>Annuler</button><button className="button primary" disabled={busy || (scope === "selected" && q.isPending)} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer les droits"}</button></div>
  </div>;
}
