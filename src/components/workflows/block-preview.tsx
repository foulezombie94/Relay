"use client";
import { useState } from "react";
import { request, useWorkspace } from "../providers/data-provider";
import { RecordPicker } from "../records/picker";
import type { WorkflowDefinition } from "@/lib/domain/types";
import styles from "./workflows.module.css";
export function BlockPreview({
  definition,
  actionId,
}: {
  definition: WorkflowDefinition;
  actionId: string;
}) {
  const { workspace } = useWorkspace();
  const [record, setRecord] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [data, setData] = useState<{
      rendered: Record<string, string>;
      unavailable: string[];
      condition: boolean | null;
    } | null>(null);
  return (
    <details className={styles.blockPreview}>
      <summary>Prévisualiser ce bloc</summary>
      <p className="caption">
        Vérifie les variables avec une fiche réelle, sans envoyer de message ni modifier de donnée.
      </p>
      <RecordPicker
        name="block-preview-record"
        objectId={definition.object_id}
        onChange={setRecord}
      />
      <button
        type="button"
        className="button small"
        disabled={!record || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          setData(null);
          try {
            const res = await request<{ data: typeof data }>(
              `/api/${workspace.id}/automation/preview`,
              "POST",
              { definition, action_id: actionId, record_id: record },
            );
            setData(res.data);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Aperçu impossible.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Vérification…" : "Afficher les valeurs"}
      </button>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <pre>{JSON.stringify(data.rendered, null, 2)}</pre>
          {data.unavailable.length > 0 && (
            <p>
              Valeurs indisponibles dans cet aperçu : {data.unavailable.join(", ")}. Les données
              d’un événement et les sorties de blocs existent pendant l’exécution réelle.
            </p>
          )}
          {data.condition !== null && (
            <p>Condition avec les valeurs disponibles : {data.condition ? "Oui" : "Non"}.</p>
          )}
        </>
      )}
    </details>
  );
}
