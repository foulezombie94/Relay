"use client";
import { useState } from "react";
import { recordHref } from "@/lib/domain/workspace-navigation";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { PageHeader, Editor, AddButton, Empty, str, Loading, ErrorMessage } from "../ui";
import { Pagination } from "../ui/pagination";
import { RecordPicker } from "../records/picker";
import type { Row } from "@/lib/domain/types";
export function ListPage({ id }: { id: string }) {
  const { workspace, objects } = useWorkspace();
  const [page, setPage] = useState(0);
  const list = useRows("lists", { id, size: 1 });
  const entries = useRows("list_entries", { list_id: id, size: 25, page });
  const [adding, setAdding] = useState(false);
  const { save, remove, busy } = useSave();
  const readOnly = workspace.role === "viewer";
  return (
    <>
      <PageHeader
        title={str(list.data?.data[0]?.name) || "Liste"}
        description="Un regroupement de fiches existantes."
        action={
          <AddButton disabled={readOnly || !list.data?.data[0]} onClick={() => setAdding(true)} />
        }
      />
      <ErrorMessage error={list.error || entries.error} />
      {entries.isPending ? (
        <Loading />
      ) : (
        <div className="stack">
          {entries.data?.data.map((entry) => {
            const record = entry.record as Row | null;
            const object = objects.find((object) => object.id === record?.object_id);
            return (
              <article className="detail-card" key={entry.id}>
                <div className="card-head">
                  <strong>
                    {record && object ? (
                      <a href={recordHref(workspace.id, object, record.id)}>
                        {str(record.display_name)}
                      </a>
                    ) : (
                      str(record?.display_name) || "Fiche inaccessible"
                    )}
                  </strong>
                  <button
                    className="button small"
                    disabled={readOnly || busy}
                    onClick={() => void remove("list_entries", entry.id).catch(() => {})}
                  >
                    Retirer de la liste
                  </button>
                </div>
              </article>
            );
          })}
          {entries.data?.count === 0 && (
            <Empty description="Ajoutez des fiches existantes à cette sélection." />
          )}
        </div>
      )}
      <Pagination
        page={page}
        size={25}
        total={entries.data?.count ?? 0}
        busy={entries.isFetching}
        onChange={setPage}
      />
      {adding && (
        <Editor
          open
          onClose={() => setAdding(false)}
          title="Ajouter à la liste"
          busy={busy}
          fields={[
            {
              key: "record_id",
              label: "Fiche à ajouter",
              type: "custom",
              required: true,
              render: (initial, name) => (
                <RecordPicker
                  name={name}
                  initial={initial}
                  required
                  objectId={str(list.data?.data[0]?.object_id)}
                />
              ),
            },
          ]}
          onSave={(values) => save("list_entries", { ...values, list_id: id })}
        />
      )}
    </>
  );
}
