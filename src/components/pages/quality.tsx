"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { request, useRows, useWorkspace } from "../providers/data-provider";
import { PageHeader, Modal, Loading, Empty, ErrorMessage, str, date, Badge } from "../ui";
import { RecordEditor } from "../records/editor";
import { mergeFields, mergeValues } from "@/lib/domain/duplicates";
import type { DuplicatePair } from "@/lib/domain/duplicate-pairs";
import type { Attribute, CrmRecord, Row } from "@/lib/domain/types";
type Comparison = {
  a: CrmRecord;
  b: CrmRecord;
  attributes: Attribute[];
  reasons: string[];
  is_candidate: boolean;
  decision: Row | null;
};
const labels: Record<string, string> = {
  display_name: "Nom",
  email: "Email",
  domain: "Domaine",
  stage: "Étape",
  amount: "Montant",
  currency: "Devise",
  owner_id: "Responsable",
  close_date: "Clôture",
};
export function QualityPage() {
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const { workspace, objects } = useWorkspace();
  const cache = useQueryClient();
  const [object, setObject] = useState("");
  const [pair, setPair] = useState<{ a: string; b: string } | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [decisionPage, setDecisionPage] = useState(0);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const admin = ["owner", "admin"].includes(workspace.role);
  const writer = workspace.role !== "viewer";
  const q = useQuery({
    queryKey: ["rows", workspace.id, "duplicates", object],
    queryFn: () =>
      request<{
        data: DuplicatePair[];
        total: number;
        truncated: boolean;
        normalization_partial?: boolean;
      }>("/api/" + workspace.id + "/duplicates" + (object ? "?object_id=" + object : "")),
  });
  const history = useRows("merge_history", { size: 20 });
  const decisions = useRows("duplicates/decisions", { page: decisionPage });
  async function decide(
    a: string,
    b: string,
    decision: "separate" | "deferred" | "reopen",
    av?: number,
    bv?: number,
  ) {
    setWorking(true);
    setError("");
    try {
      await request("/api/" + workspace.id + "/duplicates/decisions", "POST", {
        a,
        b,
        decision,
        a_version: av,
        b_version: bv,
      });
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      toast.success(
        decision === "separate"
          ? "Fiches gardées séparées"
          : decision === "deferred"
            ? "Suggestion reportée de 7 jours"
            : "Décision rouverte",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Décision impossible");
      await q.refetch();
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Qualité des données"
        description="Comparer, corriger, puis décider. Aucune fusion automatique."
        action={
          <button className="button" onClick={() => q.refetch()} disabled={q.isFetching}>
            Actualiser
          </button>
        }
      />
      <div className="toolbar">
        <select
          aria-label="Objet à examiner"
          value={object}
          onChange={(e) => setObject(e.target.value)}
        >
          <option value="">Tous les objets</option>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <span className="pill">{q.data?.total ?? 0} fiches analysées</span>
        <span className="pill">{q.data?.data.length ?? 0} paires proposées</span>
      </div>
      <div className="alert info">
        Un nom, email ou domaine identique est un signal à examiner. Comparer et garder séparés sont
        accessibles aux membres ; fusionner et annuler une fusion sont réservés aux administrateurs.
      </div>
      <ErrorMessage error={q.error} />
      <ErrorMessage error={error ? new Error(error) : null} />
      {q.data?.truncated && (
        <div className="alert info">
          La liste est limitée à 250 paires par calcul. Restreignez par objet ou traitez ces
          suggestions puis actualisez.
        </div>
      )}
      {q.data?.normalization_partial && (
        <div className="alert info">
          Analyse partielle des domaines : les adresses internationales, encodées ou IP nécessitent
          une comparaison individuelle. Les emails et noms restent analysés.
        </div>
      )}
      {q.isPending ? (
        <Loading />
      ) : q.error ? null : q.data?.data.length ? (
        <div className="cards-grid">
          {q.data.data.map((p) => (
            <article className="detail-card" key={p.key}>
              <div className="card-head">
                <strong>Doublon potentiel détecté</strong>
                <Badge value={p.strength === "fort" ? "Email identique" : "À examiner"} />
              </div>
              <div className="comparison-mini">
                {[p.a, p.b].map((r) => (
                  <div key={r.id}>
                    <strong>{r.display_name}</strong>
                    <p>{r.email || r.domain || "Sans coordonnées"}</p>
                    <small>{r.id.slice(0, 8)}</small>
                  </div>
                ))}
              </div>
              <p>{p.reasons.join(" · ")}</p>
              <div className="row-actions">
                <button className="button small" onClick={() => setPair({ a: p.a.id, b: p.b.id })}>
                  Comparer
                </button>
                <button
                  className="button primary small"
                  disabled={!admin}
                  onClick={() => setPair({ a: p.a.id, b: p.b.id })}
                >
                  Fusionner…
                </button>
                <button
                  className="button small"
                  disabled={!writer || working}
                  onClick={() => decide(p.a.id, p.b.id, "separate", p.a.version, p.b.version)}
                >
                  Garder séparés
                </button>
                <button
                  className="button small"
                  disabled={!writer || working}
                  onClick={() => decide(p.a.id, p.b.id, "deferred", p.a.version, p.b.version)}
                >
                  Ignorer
                </button>
              </div>
              <small>Ignorer reporte cette paire de 7 jours.</small>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Aucune nouvelle suggestion"
          description="Les paires gardées séparées ou reportées restent accessibles ci-dessous."
        />
      )}
      <h2 className="section-title">Décisions enregistrées</h2>
      <ErrorMessage error={decisions.error} />
      <div className="stack">
        {decisions.data?.data.map((d) => (
          <article className="detail-card card-head" key={d.id}>
            <div>
              <strong>
                {str(d.a_name) || str(d.record_a)} / {str(d.b_name) || str(d.record_b)}
              </strong>
              <p>
                {d.status === "separate"
                  ? "Gardés séparés"
                  : Date.parse(str(d.defer_until)) > clock
                    ? "Reporté jusqu’au " + date(d.defer_until)
                    : "Report expiré · la paire peut être reproposée"}
              </p>
            </div>
            <button
              className="button small"
              disabled={!writer || working}
              onClick={() => decide(str(d.record_a), str(d.record_b), "reopen")}
            >
              Réexaminer
            </button>
          </article>
        ))}
        {decisions.data?.data.length === 0 && <p className="muted">Aucune décision enregistrée.</p>}
      </div>
      <div className="pagination">
        <button
          className="button small"
          disabled={decisionPage === 0}
          onClick={() => setDecisionPage((p) => p - 1)}
        >
          Précédent
        </button>
        <span>Page {decisionPage + 1}</span>
        <button
          className="button small"
          disabled={(decisionPage + 1) * 50 >= (decisions.data?.count ?? 0)}
          onClick={() => setDecisionPage((p) => p + 1)}
        >
          Suivant
        </button>
      </div>
      <h2 className="section-title">Journal des fusions</h2>
      <ErrorMessage error={history.error} />
      <div className="stack">
        {history.data?.data.map((r) => {
          const snapshot = (r.snapshot ?? {}) as {
            source?: CrmRecord;
            target?: CrmRecord;
          };
          const o = objects.find((o) => o.id === snapshot.target?.object_id);
          return (
            <article className="detail-card card-head" key={r.id}>
              <div>
                <strong>
                  {snapshot.source?.display_name} → {snapshot.target?.display_name}
                </strong>
                <p>
                  {date(r.created_at)} ·{" "}
                  {r.undone_at
                    ? "Annulée le " + date(r.undone_at)
                    : "Source archivée, contexte transféré"}
                </p>
                <small>Identifiant : {r.id}</small>
              </div>
              <div className="row-actions">
                {o && (
                  <a
                    className="button small"
                    href={
                      "/app/" +
                      (o.standard ? o.slug : "object-" + o.slug) +
                      "?record=" +
                      str(r.target_id)
                    }
                  >
                    Ouvrir
                  </a>
                )}
                {admin && !r.undone_at && (
                  <button
                    className="button small"
                    disabled={!r.restorable}
                    title={
                      r.restorable
                        ? "Vérifier la possibilité d’annulation"
                        : "Ancienne fusion sans sauvegarde complète"
                    }
                    onClick={() => setUndo(r.id)}
                  >
                    Annuler la fusion…
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {history.data?.data.length === 0 && <p className="muted">Aucune fusion enregistrée.</p>}
      </div>
      {pair && <ComparisonDialog aId={pair.a} bId={pair.b} onClose={() => setPair(null)} />}{" "}
      {undo && <UndoDialog id={undo} onClose={() => setUndo(null)} />}
    </>
  );
}
function ComparisonDialog({
  aId,
  bId,
  onClose,
}: {
  aId: string;
  bId: string;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const admin = ["owner", "admin"].includes(workspace.role);
  const [targetId, setTargetId] = useState(bId);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [selectionVersion, setSelectionVersion] = useState("");
  const [approvedVersion, setApprovedVersion] = useState("");
  const [phase, setPhase] = useState<"compare" | "preview">("compare");
  const [editing, setEditing] = useState<CrmRecord | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["rows", workspace.id, "comparison", aId, bId],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: () =>
      request<Comparison>("/api/" + workspace.id + "/duplicates/compare?a=" + aId + "&b=" + bId),
  });
  const data = q.data;
  const version = data ? [data.a.id, data.a.version, data.b.id, data.b.version].join(":") : "";
  const selection = selectionVersion === version ? picked : {};
  const target = data && (data.a.id === targetId ? data.a : data.b);
  const source = data && (data.a.id === targetId ? data.b : data.a);
  const keys = data
    ? [
        ...mergeFields,
        ...new Set(
          [...Object.keys(data.a.attributes), ...Object.keys(data.b.attributes)].map(
            (k) => "attr:" + k,
          ),
        ),
      ]
    : [];
  function value(r: CrmRecord, key: string) {
    return key.startsWith("attr:") ? r.attributes[key.slice(5)] : r[key];
  }
  function chosen(key: string) {
    if (selection[key]) return selection[key];
    if (!target || !source) return targetId;
    return [null, undefined, ""].includes(value(target, key) as null | undefined | "") &&
      ![null, undefined].includes(value(source, key) as null | undefined)
      ? source.id
      : target.id;
  }
  const choices = Object.fromEntries(
    keys.map((k) => [k, chosen(k) === source?.id ? "source" : "target"]),
  ) as Record<string, "source" | "target">;
  const approval = version + ":" + targetId + ":" + JSON.stringify(choices);
  const preview = source && target ? mergeValues(source, target, choices) : null;
  const ready = !!data?.is_candidate && !q.isFetching && !q.error && !working && !editing;
  const showPreview = phase === "preview" && selectionVersion === version;
  function pick(key: string, id: string) {
    setPicked({
      ...selection,
      [key]: id,
      ...(["amount", "currency"].includes(key) ? { amount: id, currency: id } : {}),
    });
    setSelectionVersion(version);
    setApprovedVersion("");
  }
  async function refresh() {
    setPhase("compare");
    setApprovedVersion("");
    setPicked({});
    const result = await q.refetch();
    if (result.error) throw result.error;
  }
  async function merge() {
    if (!ready || approvedVersion !== approval || !source || !target) return;
    setWorking(true);
    setError("");
    try {
      await request("/api/" + workspace.id + "/duplicates", "POST", {
        source: source.id,
        target: target.id,
        source_version: source.version,
        target_version: target.version,
        choices,
      });
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      toast.success("Fusion enregistrée. Annulation disponible dans le journal.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fusion impossible");
      await refresh().catch(() => {});
    } finally {
      setWorking(false);
    }
  }
  return (
    <Modal
      open
      wide
      onClose={() => !working && onClose()}
      title={showPreview ? "Aperçu avant fusion" : "Comparer les fiches"}
    >
      <ErrorMessage error={q.error} />
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {q.isPending ? (
        <Loading />
      ) : data && source && target ? (
        <>
          <div className="comparison-mini">
            {[data.a, data.b].map((r) => (
              <article className="detail-card" key={r.id}>
                <strong>{r.display_name}</strong>
                <p>{r.email || r.domain || "Sans coordonnées"}</p>
                <small>
                  Version {r.version} · {r.id.slice(0, 8)}
                </small>
                <div className="row-actions">
                  <button
                    className="button small"
                    disabled={workspace.role === "viewer" || working || q.isFetching}
                    onClick={() => {
                      setPhase("compare");
                      setApprovedVersion("");
                      setEditing(r);
                    }}
                  >
                    Modifier
                  </button>
                  <label className="inline-check">
                    <input
                      type="radio"
                      name="target"
                      checked={targetId === r.id}
                      disabled={working || q.isFetching}
                      onChange={() => {
                        setTargetId(r.id);
                        setPhase("compare");
                        setApprovedVersion("");
                      }}
                    />
                    Fiche conservée
                  </label>
                </div>
              </article>
            ))}
          </div>
          <p>
            {data.reasons.length ? data.reasons.join(" · ") : "Aucun signal commun après recalcul."}
          </p>
          {!data.is_candidate && (
            <div className="alert info">
              La comparaison recalculée ne propose plus cette paire à la fusion : les critères ont
              changé ou une décision de séparation/report est active.
            </div>
          )}
          {q.isFetching && (
            <div className="alert info">Recalcul de la comparaison… Fusion désactivée.</div>
          )}
          <div className="table-wrap">
            <table className="merge-table">
              <thead>
                <tr>
                  <th>Champ</th>
                  {showPreview ? (
                    <th>Valeur conservée</th>
                  ) : (
                    <>
                      <th>{data.a.display_name}</th>
                      <th>{data.b.display_name}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <th>
                      {labels[k] ||
                        data.attributes.find((a) => a.key === k.slice(5))?.name ||
                        k.slice(5)}
                    </th>
                    {showPreview ? (
                      <td>
                        {str(
                          k.startsWith("attr:")
                            ? (preview?.attributes as Record<string, unknown>)?.[k.slice(5)]
                            : preview?.[k],
                        ) || "Vide"}
                      </td>
                    ) : (
                      [data.a, data.b].map((r) => (
                        <td key={r.id}>
                          <label className="merge-choice">
                            <input
                              type="radio"
                              name={"pick-" + k}
                              checked={chosen(k) === r.id}
                              disabled={working || q.isFetching}
                              onChange={() => pick(k, r.id)}
                            />
                            <span>{str(value(r, k)) || "Vide"}</span>
                          </label>
                        </td>
                      ))
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showPreview && (
            <>
              <div className="alert info">
                « {source.display_name} » sera archivée vers « {target.display_name} ». Les tâches,
                notes, documents, réunions, engagements, portails et relations seront transférés.
                Les notes privées restent privées. L’annulation est possible tant que les fiches et
                leur contexte n’ont pas changé après la fusion.
              </div>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={approvedVersion === approval}
                  disabled={!ready}
                  onChange={(e) => setApprovedVersion(e.target.checked ? approval : "")}
                />
                J’ai vérifié cette comparaison actualisée et les valeurs à conserver.
              </label>
            </>
          )}
          <div className="dialog-footer">
            <button
              className="button"
              disabled={working || q.isFetching}
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              Recalculer
            </button>
            <button className="button" disabled={working} onClick={onClose}>
              Fermer
            </button>
            {showPreview ? (
              <>
                <button className="button" disabled={working} onClick={() => setPhase("compare")}>
                  Retour à la comparaison
                </button>
                <button
                  className="button primary"
                  disabled={!admin || !ready || approvedVersion !== approval}
                  onClick={() => void merge()}
                >
                  {working ? "Fusion en cours…" : "Confirmer la fusion"}
                </button>
              </>
            ) : (
              <button
                className="button primary"
                disabled={!admin || !ready}
                onClick={() => {
                  if (selectionVersion !== version) setPicked({});
                  setSelectionVersion(version);
                  setPhase("preview");
                  setApprovedVersion("");
                }}
              >
                Fusionner · voir l’aperçu
              </button>
            )}
          </div>
        </>
      ) : null}
      {editing && (
        <RecordEditor
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await refresh();
            setEditing(null);
          }}
        />
      )}
    </Modal>
  );
}
type UndoPreview = {
  id: string;
  available: boolean;
  reason: string | null;
  source_version: number;
  target_version: number;
  source_name: string;
  target_name: string;
};
function UndoDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["rows", workspace.id, "undo-preview", id],
    staleTime: 0,
    queryFn: () => request<{ data: UndoPreview }>("/api/" + workspace.id + "/merges?id=" + id),
  });
  return (
    <Modal open onClose={() => !busy && onClose()} title="Annuler la fusion">
      <ErrorMessage error={q.error} />
      {q.isPending ? (
        <Loading />
      ) : (
        q.data && (
          <>
            <p>
              Restaurer « {q.data.data.source_name} » et « {q.data.data.target_name} » avec leurs
              champs, listes, relations et contexte d’avant fusion.
            </p>
            <div className={"alert " + (q.data.data.available ? "info" : "error")}>
              {q.data.data.reason ||
                "Aucun changement détecté après fusion. Les compteurs de version continueront à augmenter et l’annulation sera ajoutée au journal."}
            </div>
            <ErrorMessage error={error ? new Error(error) : null} />
            <div className="dialog-footer">
              <button className="button" disabled={busy} onClick={onClose}>
                Fermer
              </button>
              <button
                className="button primary"
                disabled={busy || q.isFetching || !q.data.data.available || !!q.error}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await request("/api/" + workspace.id + "/merges", "POST", {
                      id,
                      source_version: q.data!.data.source_version,
                      target_version: q.data!.data.target_version,
                    });
                    await cache.invalidateQueries({
                      queryKey: ["rows", workspace.id],
                    });
                    toast.success("Fusion annulée. Les deux fiches sont restaurées.");
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Annulation impossible");
                    await q.refetch();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Restauration…" : "Confirmer l’annulation"}
              </button>
            </div>
          </>
        )
      )}
    </Modal>
  );
}
