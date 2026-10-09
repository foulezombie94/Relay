"use client";
import { useState } from "react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import {
  PageHeader,
  AddButton,
  Editor,
  Loading,
  ErrorMessage,
  Empty,
  str,
  type Field,
} from "../ui";
import { defaultProbabilities, type Pipeline } from "@/lib/domain/pipelines";
import { stages } from "@/lib/domain/types";
export function PipelinesPage() {
  const { workspace } = useWorkspace();
  const q = useRows<Pipeline>("pipelines", { size: 100 });
  const { save, remove, busy } = useSave();
  const [edit, setEdit] = useState<Pipeline | true | null>(null);
  const [error, setError] = useState("");
  const admin = ["owner", "admin"].includes(workspace.role);
  const fields: Field[] = [
    { key: "name", label: "Nom du pipeline", required: true },
    ...stages.flatMap((stage, index): Field[] => [
      { key: "label_" + index, label: "Libellé · " + stage },
      ...(!["Gagné", "Perdu"].includes(stage)
        ? [
            {
              key: "prob_" + index,
              label: "Probabilité (%) · " + stage,
              type: "number" as const,
              required: true,
            },
          ]
        : []),
    ]),
  ];
  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Distinguez vos cycles de vente et configurez vos hypothèses de prévision."
        action={
          <AddButton
            label="Nouveau pipeline"
            disabled={!admin}
            onClick={() => setEdit(true)}
          />
        }
      />
      <ErrorMessage error={q.error || (error ? new Error(error) : null)} />
      <p className="footer-note">
        Les probabilités sont des hypothèses définies par votre équipe, pas des
        prédictions IA. Gagné reste à 100 % et Perdu à 0 %. Les six étapes
        peuvent être renommées.
      </p>
      {q.isPending ? (
        <Loading />
      ) : (
        <div className="cards-grid">
          {q.data?.data.map((p) => (
            <article className="detail-card" key={p.id}>
              <h3>{p.name}</h3>
              <ol>
                {stages.map((s) => (
                  <li key={s}>
                    {p.labels[s] || s} · {p.probabilities[s]} %
                  </li>
                ))}
              </ol>
              <div className="row-actions">
                <a
                  className="button small"
                  href={"/app/deals?pipeline=" + p.id}
                >
                  Voir les opportunités
                </a>
                <button
                  className="button small"
                  disabled={!admin}
                  onClick={() => setEdit(p)}
                >
                  Configurer
                </button>
                <button
                  className="button small danger"
                  disabled={!admin || busy || (q.data?.data.length ?? 0) < 2}
                  onClick={async () => {
                    if (
                      window.confirm(
                        "Supprimer ce pipeline inutilisé ? Un pipeline contenant des fiches est protégé.",
                      )
                    )
                      try {
                        await remove("pipelines", p.id);
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Suppression impossible.",
                        );
                      }
                  }}
                >
                  Supprimer
                </button>
              </div>
            </article>
          ))}
          {!q.data?.data.length && <Empty title="Aucun pipeline" />}
        </div>
      )}
      {edit && (
        <Editor
          key={edit === true ? "new" : edit.id}
          open
          onClose={() => setEdit(null)}
          title={edit === true ? "Nouveau pipeline" : "Configurer le pipeline"}
          fields={fields}
          busy={busy}
          initial={{
            name: edit === true ? "" : edit.name,
            ...Object.fromEntries(
              stages.flatMap((s, i) => [
                ["label_" + i, edit === true ? s : edit.labels[s] || s],
                [
                  "prob_" + i,
                  edit === true
                    ? defaultProbabilities[s]
                    : edit.probabilities[s],
                ],
              ]),
            ),
          }}
          onSave={async (values) => {
            const probabilities = { ...defaultProbabilities };
            const labels: Record<string, string> = {};
            stages.forEach((s, i) => {
              labels[s] = str(values["label_" + i]) || s;
              if (!["Gagné", "Perdu"].includes(s))
                probabilities[s] = Number(values["prob_" + i]);
            });
            await save(
              "pipelines",
              { name: values.name, labels, probabilities },
              edit === true ? undefined : edit,
            );
          }}
        />
      )}
    </>
  );
}
