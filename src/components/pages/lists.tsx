"use client";
import { useState } from "react";
import { useRows, useSave } from "../data-provider";
import { PageHeader, Editor, AddButton, Empty, str } from "../ui";
import type { CrmRecord } from "@/lib/domain/types";
export function ListPage({ id }: { id: string }) {
  const list = useRows("lists", { id, size: 1 });
  const entries = useRows("list_entries", { list_id: id, size: 100 });
  const records = useRows<CrmRecord>("records", {
    object_id: list.data?.data[0]?.object_id as string | undefined,
    size: 100,
  });
  const [adding, setAdding] = useState(false);
  const { save, remove, busy } = useSave();
  return (
    <>
      <PageHeader
        title={str(list.data?.data[0]?.name) || "Liste"}
        description="Un regroupement de fiches existantes."
        action={<AddButton onClick={() => setAdding(true)} />}
      />
      <div className="stack">
        {entries.data?.data.map((entry) => (
          <article className="detail-card" key={entry.id}>
            <div className="card-head">
              <strong>
                {records.data?.data.find((r) => r.id === entry.record_id)
                  ?.display_name ?? "Fiche " + str(entry.record_id)}
              </strong>
              <button
                className="button small"
                onClick={() =>
                  void remove("list_entries", entry.id).catch(() => {})
                }
              >
                Retirer de la liste
              </button>
            </div>
            {Array.isArray(entry.merge_provenance) &&
              entry.merge_provenance.length > 0 && (
                <details>
                  <summary>Données conservées lors d’une fusion</summary>
                  <pre className="preserve-lines">
                    {JSON.stringify(entry.merge_provenance, null, 2)}
                  </pre>
                </details>
              )}
          </article>
        ))}
        {entries.data?.data.length === 0 && <Empty />}
      </div>
      {adding && (
        <Editor
          open
          onClose={() => setAdding(false)}
          title="Ajouter à la liste"
          busy={busy}
          fields={[
            {
              key: "record_id",
              label: "Fiche",
              required: true,
              type: "select",
              options: (records.data?.data ?? [])
                .filter(
                  (r) => !entries.data?.data.some((e) => e.record_id === r.id),
                )
                .map((r) => ({ value: r.id, label: r.display_name })),
            },
          ]}
          onSave={(v) => save("list_entries", { ...v, list_id: id })}
        />
      )}
    </>
  );
}
