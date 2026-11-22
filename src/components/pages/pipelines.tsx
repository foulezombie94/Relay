"use client";
import { workspaceHref } from "@/lib/domain/workspace-navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { request, useRows, useSave, useWorkspace } from "../providers/data-provider";
import { PageHeader, AddButton, Loading, ErrorMessage, Empty } from "../ui";
import { openStages, stageLabel, type Pipeline } from "@/lib/domain/pipelines";
import { StageEditor } from "../pipelines/stage-editor";
import styles from "../pipelines/pipelines.module.css";
import { DeleteButton } from "@/components/ui/delete-button";

export function PipelinesPage() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const q = useRows<Pipeline>("pipelines", { size: 100 });
  const { save, remove, busy } = useSave();
  const [edit, setEdit] = useState<Pipeline | true | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const admin = ["owner", "admin"].includes(workspace.role);
  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Définissez les étapes de chaque cycle de vente et leurs hypothèses de prévision."
        action={
          <AddButton label="Nouveau pipeline" disabled={!admin} onClick={() => setEdit(true)} />
        }
      />
      <ErrorMessage error={q.error || (error ? new Error(error) : null)} />
      <p className="footer-note">
        Jusqu’à 20 étapes en cours par pipeline, librement nommées et ordonnées. Gagné (100 %) et
        Perdu (0 %) clôturent toujours une opportunité et peuvent être renommés. Les probabilités
        sont des hypothèses de votre équipe, pas des prédictions IA.
      </p>
      {q.isPending ? (
        <Loading />
      ) : (
        <div className={styles.grid}>
          {q.data?.data.map((p) => (
            <article className={styles.card} key={p.id}>
              <div className={styles.cardHead}>
                <div>
                  <h3>{p.name}</h3>
                  <small>{openStages(p).length} étapes en cours</small>
                </div>
                <div className={styles.actions}>
                  <a
                    className="button small"
                    href={workspaceHref("/app/deals?pipeline=" + p.id, workspace.id)}
                  >
                    Voir les opportunités
                  </a>
                  <button
                    className="button small"
                    disabled={!admin}
                    onClick={() => setEdit(p)}
                    aria-label={`Configurer ${p.name}`}
                  >
                    <Settings2 size={14} /> Configurer
                  </button>
                  <DeleteButton
                    label={`Supprimer ${p.name}`}
                    title="Supprimer ce pipeline inutilisé (un pipeline contenant des fiches est protégé)"
                    disabled={!admin || busy || (q.data?.data.length ?? 0) < 2}
                    onConfirm={async () => {
                      try {
                        await remove("pipelines", p.id);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Suppression impossible.");
                      }
                    }}
                  />
                </div>
              </div>
              <ol className={styles.track} aria-label={`Étapes de ${p.name}`}>
                {openStages(p).map((stage, index) => (
                  <li className={styles.chip} key={stage}>
                    <span
                      className={styles.dot}
                      style={{ "--stage-hue": (index * 47) % 360 } as never}
                    />
                    {stageLabel(p, stage)} <em>{p.probabilities[stage] ?? 0} %</em>
                  </li>
                ))}
                <li className={styles.chip}>
                  <span className={styles.dot} style={{ background: "#2f9e6b" }} />
                  {stageLabel(p, "Gagné")}
                </li>
                <li className={styles.chip}>
                  <span className={styles.dot} style={{ background: "#d1495b" }} />
                  {stageLabel(p, "Perdu")}
                </li>
              </ol>
            </article>
          ))}
          {!q.data?.data.length && <Empty title="Aucun pipeline" />}
        </div>
      )}
      {edit && (
        <StageEditor
          key={edit === true ? "new" : edit.id + ":" + edit.version}
          pipeline={edit === true ? null : edit}
          busy={busy || saving}
          onClose={() => setEdit(null)}
          onSave={async (draft, moves) => {
            if (edit === true) {
              await save("pipelines", draft);
              return;
            }
            setSaving(true);
            try {
              const result = await request<{ data: Pipeline; moved: number }>(
                `/api/${workspace.id}/pipeline-stages`,
                "POST",
                { id: edit.id, version: edit.version, pipeline: draft, moves },
              );
              await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
              toast.success(
                result.moved
                  ? `Pipeline enregistré · ${result.moved} opportunité(s) déplacée(s)`
                  : "Pipeline enregistré",
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </>
  );
}
