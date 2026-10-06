"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRows, useSave, useWorkspace, request } from "../data-provider";
import {
  PageHeader,
  AddButton,
  Editor,
  Modal,
  Empty,
  Badge,
  str,
  ErrorMessage,
} from "../ui";
import type { Workflow, Simulation } from "@/lib/domain/types";
import { Pagination } from "../pagination";
import { WorkflowFields } from "../structured-fields";
export function WorkflowsPage() {
  const { workspace, objects } = useWorkspace();
  const [page, setPage] = useState(0);
  const [runPage, setRunPage] = useState(0);
  const q = useRows<Workflow>("workflows", { size: 25, page });
  const runs = useRows("workflow_runs", { size: 25, page: runPage });
  const { save, busy } = useSave();
  const cache = useQueryClient();
  const [editing, setEditing] = useState<Workflow | true | null>(null);
  const [preview, setPreview] = useState<(Simulation & { id: string }) | null>(
    null,
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const readonly = workspace.role === "viewer";
  return (
    <>
      <PageHeader
        title="Automatisations"
        description="Voyez les conséquences avant de modifier vos données."
        action={
          <AddButton
            disabled={readonly}
            label="Créer un workflow"
            onClick={() => setEditing(true)}
          />
        }
      />
      {error && <div className="alert error">{error}</div>}
      <ErrorMessage error={q.error} />
      <div className="alert info">
        Les workflows s’exécutent après simulation et confirmation. L’envoi
        d’e-mails et les déclenchements automatiques ne sont pas activés.
      </div>
      <div className="stack">
        {q.data?.data.map((w) => (
          <article className="detail-card" key={w.id}>
            <div className="card-head">
              <h3>{w.name}</h3>
              <span className="pill">Version {w.version}</span>
            </div>
            <p>
              {w.definition.actions.length} action(s) ·{" "}
              {w.definition.conditions.length} condition(s)
            </p>
            <div className="row-actions">
              <button
                className="button small"
                disabled={readonly}
                onClick={() => setEditing(w)}
              >
                Modifier
              </button>
              <button
                className="button primary small"
                disabled={readonly || working}
                onClick={async () => {
                  setWorking(true);
                  setError("");
                  try {
                    const r = await request<{
                      data: Simulation & { id: string };
                    }>("/api/" + workspace.id + "/simulate", "POST", {
                      workflow_id: w.id,
                    });
                    setPreview(r.data);
                    await runs.refetch();
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Simulation impossible",
                    );
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Simuler
              </button>
            </div>
          </article>
        ))}
        {q.data?.data.length === 0 && (
          <Empty
            title="Votre premier workflow"
            description="Créez des tâches ou changez des étapes selon les informations d’une fiche."
          />
        )}
      </div>
      <Pagination
        page={page}
        size={25}
        total={q.data?.count ?? 0}
        onChange={setPage}
        busy={q.isFetching}
      />
      <h3>Historique des simulations</h3>
      <ErrorMessage error={runs.error} />
      {runs.data?.data.map((r) => (
        <div className="detail-card" key={r.id}>
          <Badge value={r.executed_at ? "completed" : "draft"} />
          <small> {new Date(r.created_at).toLocaleString("fr-FR")}</small>
        </div>
      ))}
      <Pagination
        page={runPage}
        size={25}
        total={runs.data?.count ?? 0}
        onChange={setRunPage}
        busy={runs.isFetching}
      />
      {editing && (
        <Editor
          open
          key={editing === true ? "new" : editing.id}
          onClose={() => setEditing(null)}
          title="Workflow"
          fields={[
            { key: "name", label: "Nom", required: true },
            {
              key: "definition",
              label: "Conditions et actions",
              type: "custom",
              required: true,
              render: (initial, name) => (
                <WorkflowFields initial={initial} name={name} />
              ),
            },
          ]}
          initial={
            editing === true
              ? {
                  definition: {
                    object_id:
                      objects.find((o) => o.slug === "deals")?.id ??
                      objects[0]?.id,
                    conditions: [
                      { field: "stage", operator: "equals", value: "Nouveau" },
                    ],
                    actions: [
                      { type: "task", title: "Contacter le prospect", days: 2 },
                    ],
                  },
                }
              : editing
          }
          busy={busy}
          onSave={(v) =>
            save("workflows", v, editing === true ? undefined : editing)
          }
        />
      )}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Aperçu avant exécution"
        wide
      >
        {preview && (
          <>
            <p>
              {preview.records.length} fiche(s) concernée(s). Aucune
              modification n’a encore été faite.
            </p>
            {preview.warnings.map((w, i) => (
              <div className="alert info" key={i}>
                {w}
              </div>
            ))}
            {preview.records.map((r) => (
              <article className="detail-card" key={r.id}>
                <strong>{r.display_name}</strong>
                {r.changes.map((c, i) => (
                  <p key={i}>{c.description}</p>
                ))}
              </article>
            ))}
            <div className="dialog-footer">
              <button className="button" onClick={() => setPreview(null)}>
                Annuler
              </button>
              <button
                className="button primary"
                disabled={
                  working ||
                  !preview.records.length ||
                  preview.records.some((r) =>
                    r.changes.some((c) => c.type === "email"),
                  )
                }
                onClick={async () => {
                  setWorking(true);
                  try {
                    await request(
                      "/api/" + workspace.id + "/simulate",
                      "PATCH",
                      { preview_id: preview.id },
                    );
                    await cache.invalidateQueries({
                      queryKey: ["rows", workspace.id],
                    });
                    setPreview(null);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Exécution impossible",
                    );
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Confirmer ces modifications
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
