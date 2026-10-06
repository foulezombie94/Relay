"use client";
import { useState } from "react";
import { useWorkspace, useSave } from "../data-provider";
import { PageHeader, Modal } from "../ui";
import { playbooks } from "@/lib/domain/playbooks";
import { useRouter } from "next/navigation";
export function PlaybooksPage() {
  const { workspace, objects } = useWorkspace();
  const { save, busy } = useSave();
  const router = useRouter();
  const [selected, setSelected] = useState<(typeof playbooks)[number] | null>(
    null,
  );
  const [error, setError] = useState("");
  return (
    <>
      <PageHeader
        title="Modèles de processus"
        description="Transformez un processus commercial en prochaines tâches explicites."
      />
      <div className="cards-grid">
        {playbooks.map((p) => (
          <article className="detail-card" key={p.id}>
            <span className="pill">{p.stage}</span>
            <h3>{p.name}</h3>
            <p>{p.why}</p>
            <ol>
              {p.steps.map((s) => (
                <li key={s.title}>
                  {s.title} · J+{s.days}
                </li>
              ))}
            </ol>
            <button
              className="button primary small"
              disabled={workspace.role === "viewer"}
              onClick={() => {
                setSelected(p);
                setError("");
              }}
            >
              Adapter ce modèle
            </button>
          </article>
        ))}
      </div>
      <div className="alert info">
        Chaque modèle crée un workflow à simuler. Aucune tâche ni transition
        d’étape n’est exécutée automatiquement.
      </div>
      {selected && (
        <Modal open onClose={() => setSelected(null)} title="Adapter le modèle">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await save("workflows", {
                  name: String(f.get("name")),
                  enabled: false,
                  definition: {
                    object_id: String(f.get("object_id")),
                    conditions: [
                      {
                        field: "stage",
                        operator: "equals",
                        value: selected.stage,
                      },
                    ],
                    actions: selected.steps.map((_, i) => ({
                      type: "task",
                      title: String(f.get("title" + i)),
                      days: Number(f.get("days" + i)),
                    })),
                  },
                });
                setSelected(null);
                router.push("/app/workflows");
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Création impossible",
                );
              }
            }}
          >
            <label>
              Nom
              <input
                name="name"
                defaultValue={selected.name}
                required
                maxLength={300}
              />
            </label>
            <label>
              Objet
              <select
                name="object_id"
                required
                defaultValue={objects.find((o) => o.slug === "deals")?.id}
              >
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            {selected.steps.map((s, i) => (
              <div className="form-grid" key={s.title}>
                <label>
                  Tâche {i + 1}
                  <input
                    name={"title" + i}
                    defaultValue={s.title}
                    required
                    maxLength={300}
                  />
                </label>
                <label>
                  Délai en jours
                  <input
                    type="number"
                    name={"days" + i}
                    min={0}
                    max={365}
                    required
                    defaultValue={s.days}
                  />
                </label>
              </div>
            ))}
            {error && <div className="alert error">{error}</div>}
            <div className="dialog-footer">
              <button
                className="button"
                type="button"
                onClick={() => setSelected(null)}
              >
                Annuler
              </button>
              <button className="button primary" disabled={busy}>
                Créer puis simuler
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
