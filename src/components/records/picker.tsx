"use client";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { request, useWorkspace } from "../providers/data-provider";
import { Pagination } from "../ui/pagination";
import { ErrorMessage } from "../ui";
import type { CrmRecord } from "@/lib/domain/types";
export function RecordPicker({
  name,
  initial,
  objectId,
  stage,
  required = false,
  onChange,
}: {
  name: string;
  initial?: unknown;
  objectId?: string;
  stage?: string;
  required?: boolean;
  onChange?: (id: string, record?: CrmRecord) => void;
}) {
  const { workspace } = useWorkspace();
  const [selected, setSelected] = useState(typeof initial === "string" ? initial : "");
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(term.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);
  const q = useQuery({
    queryKey: ["rows", workspace.id, "record-picker", search, page, objectId, stage],
    enabled: open,
    queryFn: () =>
      request<{ data: CrmRecord[]; count: number }>(
        "/api/" +
          workspace.id +
          "/records?" +
          new URLSearchParams({
            lookup: search,
            page: String(page),
            size: "20",
            sort: "display_name",
            direction: "asc",
            ...(objectId ? { object_id: objectId } : {}),
            ...(stage ? { stage } : {}),
          }),
      ),
  });
  const current = useQuery({
    queryKey: ["rows", workspace.id, "record-picker-selected", selected],
    enabled: !!selected,
    queryFn: () =>
      request<{ data: CrmRecord[] }>(
        "/api/" + workspace.id + "/records?id=" + encodeURIComponent(selected) + "&size=1",
      ),
  });
  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(selected || null)} />
      <button type="button" className="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {current.data?.data[0]?.display_name ||
          (selected ? "Fiche sélectionnée" : "Choisir une fiche…")}
      </button>
      {selected && !required && (
        <button
          type="button"
          className="button small"
          onClick={() => {
            setSelected("");
            onChange?.("");
          }}
        >
          Retirer
        </button>
      )}
      {open && (
        <div className="detail-card">
          <input
            aria-label="Rechercher une fiche"
            maxLength={200}
            placeholder="Nom, email ou domaine…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <ErrorMessage error={q.error} />
          <div role="listbox" aria-label="Fiches disponibles">
            {q.data?.data.map((record) => (
              <button
                type="button"
                role="option"
                aria-selected={selected === record.id}
                className="link-button"
                key={record.id}
                onClick={() => {
                  setSelected(record.id);
                  onChange?.(record.id, record);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 10,
                }}
              >
                {record.display_name}
                <small style={{ display: "block" }}>
                  {record.email || record.domain || record.stage}
                </small>
              </button>
            ))}
          </div>
          {q.isPending ? (
            <p>Chargement…</p>
          ) : (
            q.data?.count === 0 && <p>Aucune fiche correspondante.</p>
          )}
          <Pagination
            page={page}
            size={20}
            total={q.data?.count ?? 0}
            busy={q.isFetching}
            onChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
