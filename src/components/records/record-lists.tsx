"use client";
import { useState } from "react";
import Link from "next/link";
import { ListPlus, Layers3, ChevronDown } from "lucide-react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { Modal, ErrorMessage, Loading } from "../ui";
import { workspaceHref } from "@/lib/domain/workspace-navigation";
import type { Row } from "@/lib/domain/types";
import styles from "./studio/studio.module.css";
export function RecordLists({
  recordId,
  readonly,
  open,
  onClose,
  onOpen,
}: {
  recordId: string;
  readonly: boolean;
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const { workspace } = useWorkspace();
  const lists = useRows("lists", { size: 100 });
  const entries = useRows("list_entries", { record_id: recordId, size: 100 });
  const { save, busy } = useSave();
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const memberships = new Set(
    (entries.data?.data ?? []).filter((e) => e.record_id === recordId).map((e) => e.list_id),
  );
  const available = (lists.data?.data ?? []).filter((l) => !memberships.has(l.id));
  return (
    <section className={styles.membershipPanel}>
      <header>
        <span>
          Listes <small>{memberships.size}</small>
          <ChevronDown size={12} />
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={onOpen}
          disabled={readonly}
          aria-label="Ajouter à une liste"
        >
          <ListPlus size={15} />
        </button>
      </header>
      <ErrorMessage error={lists.error || entries.error} />
      {(lists.data?.data ?? [])
        .filter((l) => memberships.has(l.id))
        .map((l) => (
          <Link
            key={l.id}
            className={styles.membershipCard}
            href={workspaceHref("/app/list-" + l.id, workspace.id)}
          >
            <Layers3 size={16} />
            <strong>{String(l.name)}</strong>
          </Link>
        ))}
      {!memberships.size && !entries.isPending && <p>Aucune liste pour cette fiche.</p>}
      {open && (
        <Modal
          open
          onClose={onClose}
          title="Ajouter à une liste"
          description="Choisissez une liste de cet espace de travail."
        >
          <ErrorMessage error={error} />
          {lists.isPending ? (
            <Loading />
          ) : available.length ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!selected || readonly || busy) return;
                setError(null);
                try {
                  await save("list_entries", { list_id: selected, record_id: recordId });
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err : new Error("Ajout impossible."));
                }
              }}
            >
              <label>
                Liste
                <select value={selected} required onChange={(e) => setSelected(e.target.value)}>
                  <option value="">Choisir une liste…</option>
                  {available.map((l: Row) => (
                    <option key={l.id} value={l.id}>
                      {String(l.name)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="dialog-actions">
                <button type="button" className="button" onClick={onClose}>
                  Annuler
                </button>
                <button className="button primary" disabled={readonly || busy || !selected}>
                  {busy ? "Enregistrement…" : "Ajouter"}
                </button>
              </div>
            </form>
          ) : (
            <p>
              Aucune liste disponible.{" "}
              <Link href={workspaceHref("/app/lists", workspace.id)}>Gérer les listes</Link>
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
