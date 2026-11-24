"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarDays, ListTodo, Pencil, Plus, Search, Link2 } from "lucide-react";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { PageHeader, ErrorMessage, localDateTime, str, type Field as FieldDef } from "../ui";
import { Avatar } from "../ui/display";
import { Pagination } from "../ui/pagination";
import { DatePicker } from "../ui/coss-calendar";
import { RecordPicker } from "../records/picker";
import { DeleteButton } from "../ui/delete-button";
import { editorValues } from "../ui/editor-values";
import {
  EditorDraftScope,
  readDraft,
  writeDraft,
  clearDraft,
  restoredCustomValue,
} from "../ui/editor-draft";
import {
  Badge,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  type BadgeVariant,
  type Option,
} from "../ui/coss";
import type { CrmRecord, Row } from "@/lib/domain/types";
import styles from "./tasks.module.css";

const statusOptions: Option[] = [
  { value: "open", label: "À traiter" },
  { value: "in_progress", label: "En cours" },
  { value: "done", label: "Réalisé" },
  { value: "cancelled", label: "Annulé" },
];
const priorityOptions: Option[] = [
  { value: "low", label: "Basse" },
  { value: "normal", label: "Normale" },
  { value: "high", label: "Haute" },
];
const statusVariant: Record<string, BadgeVariant> = {
  open: "secondary",
  in_progress: "info",
  done: "success",
  cancelled: "outline",
};
const priorityVariant: Record<string, BadgeVariant> = {
  low: "outline",
  normal: "secondary",
  high: "error",
};
const label = (options: Option[], value: unknown) =>
  options.find((o) => o.value === value)?.label ?? str(value);

/** Same fields, conversion and validation as the former generic editor. */
export function taskFields(members: Option[], creating: boolean): FieldDef[] {
  return [
    { key: "title", label: "Titre", required: true },
    { key: "description", label: "Description", type: "textarea" },
    { key: "due_date", label: "Échéance", type: "datetime-local" },
    { key: "status", label: "Statut", type: "select", options: statusOptions },
    { key: "priority", label: "Priorité", type: "select", options: priorityOptions },
    ...(creating ? [{ key: "record_id", label: "Fiche associée", type: "custom" as const }] : []),
    { key: "owner_id", label: "Responsable", type: "select", nullable: true, options: members },
  ];
}

/** Due date wording and tone: overdue, today, soon or later. */
export function dueInfo(value: unknown, done: boolean, now = new Date()) {
  if (!value) return null;
  const due = new Date(String(value));
  if (Number.isNaN(due.getTime())) return null;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86400000);
  const text =
    days === 0
      ? "Aujourd’hui"
      : days === 1
        ? "Demain"
        : days === -1
          ? "Hier"
          : due.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  const variant: BadgeVariant = done
    ? "outline"
    : due.getTime() < now.getTime()
      ? "error"
      : days === 0
        ? "warning"
        : "secondary";
  return { text, variant, overdue: !done && due.getTime() < now.getTime() };
}

export function TasksPage() {
  const { workspace, user } = useWorkspace();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [editor, setEditor] = useState<Row | true | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const focus = useSearchParams().get("focus") ?? undefined;
  const q = useRows("tasks", {
    size: 25,
    page,
    id: focus,
    q: debounced,
    status,
    owner,
    due,
    sort: "due_date",
    direction: "asc",
  });
  const members = useRows("memberships", { size: 100 });
  const { save, remove, busy } = useSave();
  const readOnly = workspace.role === "viewer";
  const memberOptions: Option[] = (members.data?.data ?? []).map((m) => ({
    value: str(m.user_id),
    label: str(m.display_name) || str(m.user_id),
  }));
  const memberName = (id: unknown) => memberOptions.find((m) => m.value === id)?.label ?? "";
  const rows = q.data?.data ?? [];
  const reset = (apply: () => void) => {
    apply();
    setPage(0);
  };

  return (
    <>
      <PageHeader
        title="Tâches"
        description="Vos prochaines actions, au bon endroit."
        action={
          <button className="button primary" disabled={readOnly} onClick={() => setEditor(true)}>
            <Plus size={15} />
            Nouvelle tâche
          </button>
        }
      />
      <div className={styles.toolbar}>
        <SegmentedControl
          aria-label="Filtrer le statut"
          value={status}
          onValueChange={(value) => reset(() => setStatus(value))}
          options={[{ value: "", label: "Toutes" }, ...statusOptions.slice(0, 3)]}
        />
        <div className={styles.filters}>
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="Rechercher une tâche"
              placeholder="Rechercher…"
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <Select
            aria-label="Filtrer le responsable"
            size="sm"
            className={styles.filterSelect}
            value={owner}
            onValueChange={(value) => reset(() => setOwner(value))}
            options={[
              { value: "", label: "Toute l’équipe" },
              { value: "me", label: "Mes tâches" },
              { value: "unassigned", label: "Sans responsable" },
              ...memberOptions,
            ]}
          />
          <Select
            aria-label="Filtrer les échéances"
            size="sm"
            className={styles.filterSelect}
            value={due}
            onValueChange={(value) => reset(() => setDue(value))}
            options={[
              { value: "", label: "Toutes les échéances" },
              { value: "overdue", label: "En retard" },
              { value: "today", label: "Aujourd’hui" },
              { value: "upcoming", label: "Les 7 prochains jours" },
              { value: "undated", label: "Sans date" },
            ]}
          />
        </div>
      </div>
      <ErrorMessage error={q.error} />
      <section className={styles.list} aria-label="Liste des tâches" aria-busy={q.isPending}>
        <div className={styles.listHead}>
          <span>{q.data?.count ?? 0} tâches</span>
        </div>
        {q.isPending ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.row} aria-hidden="true">
              <Skeleton className={styles.skeletonDot} />
              <div className={styles.main}>
                <Skeleton style={{ width: `${60 - i * 8}%` }} />
                <Skeleton style={{ width: "30%", marginTop: 8 }} />
              </div>
            </div>
          ))
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<ListTodo size={18} />}
            title={
              status || owner || due || debounced ? "Aucune tâche ne correspond" : "Aucune tâche"
            }
            description={
              status || owner || due || debounced
                ? "Modifiez la recherche ou les filtres."
                : "Créez votre première tâche et associez-la à une fiche."
            }
            action={
              !(status || owner || due || debounced) && (
                <button
                  className="button primary"
                  disabled={readOnly}
                  onClick={() => setEditor(true)}
                >
                  <Plus size={15} />
                  Nouvelle tâche
                </button>
              )
            }
          />
        ) : (
          rows.map((row) => (
            <TaskRow
              key={row.id}
              row={row}
              ownerName={memberName(row.owner_id)}
              readOnly={readOnly}
              busy={busy}
              onDoneChange={(checked) => {
                void save("tasks", { status: checked ? "done" : "open" }, row).catch(() => {});
              }}
              onEdit={() => setEditor(row)}
              onDelete={() => void remove("tasks", row.id).catch(() => {})}
            />
          ))
        )}
      </section>
      <Pagination
        page={page}
        size={25}
        total={q.data?.count ?? 0}
        busy={q.isFetching}
        onChange={setPage}
      />
      {editor && (
        <TaskDialog
          key={editor === true ? "new" : editor.id}
          task={editor === true ? null : editor}
          members={memberOptions}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={(values) => {
            if (editor === true && !values.owner_id) values.owner_id = user.id;
            return save("tasks", values, editor === true ? undefined : editor);
          }}
        />
      )}
    </>
  );
}

/** One task: completion box, title and context, due date, priority, owner and actions. */
export function TaskRow({
  row,
  ownerName,
  readOnly,
  busy,
  onDoneChange,
  onEdit,
  onDelete,
  now,
}: {
  row: Row;
  ownerName: string;
  readOnly: boolean;
  busy: boolean;
  onDoneChange: (done: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  now?: Date;
}) {
  const done = row.status === "done";
  const dueBadge = dueInfo(row.due_date, done || row.status === "cancelled", now);
  const record = row.record as CrmRecord | null | undefined;
  return (
    <article className={styles.row} data-done={done}>
      <Checkbox
        round
        checked={done}
        disabled={readOnly || busy || row.status === "cancelled"}
        aria-label={done ? "Rouvrir la tâche" : "Marquer comme réalisée"}
        onCheckedChange={(checked) => onDoneChange(checked)}
      />
      <button type="button" className={styles.main} disabled={readOnly} onClick={onEdit}>
        <span className={styles.title}>{str(row.title) || "Sans titre"}</span>
        {row.description ? (
          <span className={styles.description}>{str(row.description)}</span>
        ) : null}
        {row.record_id ? (
          <span className={styles.record}>
            <Link2 size={12} aria-hidden="true" />
            {record?.display_name ?? "Fiche associée"}
          </span>
        ) : null}
      </button>
      <div className={styles.meta}>
        {dueBadge && (
          <Badge variant={dueBadge.variant}>
            <CalendarDays size={12} aria-hidden="true" />
            {dueBadge.overdue ? "En retard · " + dueBadge.text : dueBadge.text}
          </Badge>
        )}
        {row.priority && row.priority !== "normal" ? (
          <Badge variant={priorityVariant[str(row.priority)] ?? "secondary"}>
            {label(priorityOptions, row.priority)}
          </Badge>
        ) : null}
        {row.status && row.status !== "open" && row.status !== "done" ? (
          <Badge variant={statusVariant[str(row.status)] ?? "secondary"} dot>
            {label(statusOptions, row.status)}
          </Badge>
        ) : null}
        {ownerName ? (
          <span className={styles.owner} title={ownerName}>
            <Avatar name={ownerName} />
          </span>
        ) : null}
      </div>
      <div className={styles.actions}>
        <button
          className="icon-button"
          aria-label={"Modifier " + (str(row.title) || "la tâche")}
          disabled={readOnly}
          onClick={onEdit}
        >
          <Pencil size={15} />
        </button>
        <DeleteButton
          label={"Supprimer " + (str(row.title) || "la tâche")}
          disabled={readOnly || busy}
          onConfirm={onDelete}
        />
      </div>
    </article>
  );
}

export function TaskDialog({
  task,
  members,
  busy,
  onClose,
  onSave,
  linkRecord = true,
}: {
  task: Row | null;
  members: Option[];
  busy: boolean;
  /** Offers the record picker on creation (needs the workspace data provider). */
  linkRecord?: boolean;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<unknown>;
}) {
  const creating = !task;
  const fields = taskFields(members, creating && linkRecord);
  const scope = useContext(EditorDraftScope);
  const storageKey = scope ? `relay-draft:${scope}:task:${task?.id ?? "new"}` : null;
  const [restored] = useState(() => readDraft(storageKey));
  const initial: Record<string, unknown> = task ?? { status: "open", priority: "normal" };
  const value = (key: string) => str(restored?.[key] ?? initial[key]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const remember = () => {
    if (!inFlight.current && formRef.current) writeDraft(storageKey, formRef.current);
  };
  const close = () => {
    if (!inFlight.current) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={creating ? "Nouvelle tâche" : "Modifier la tâche"}
      description={
        creating
          ? "Une action précise, une échéance et un responsable."
          : "Les changements sont visibles par toute l’équipe."
      }
      footer={
        <>
          <button type="button" className="button" disabled={submitting} onClick={close}>
            Annuler
          </button>
          <button
            type="submit"
            form="task-form"
            className="button primary"
            disabled={submitting || busy}
          >
            {submitting ? "Enregistrement…" : creating ? "Créer la tâche" : "Enregistrer"}
          </button>
        </>
      }
    >
      <form
        id="task-form"
        ref={formRef}
        className={styles.form}
        onInput={remember}
        onChange={remember}
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || inFlight.current) return;
          inFlight.current = true;
          setSubmitting(true);
          setError("");
          writeDraft(storageKey, event.currentTarget);
          try {
            await onSave(editorValues(new FormData(event.currentTarget), fields));
            clearDraft(storageKey);
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Enregistrement impossible");
          } finally {
            inFlight.current = false;
            setSubmitting(false);
          }
        }}
      >
        <fieldset disabled={submitting} className={styles.fieldset}>
          <Field label="Titre" required htmlFor="task-title" className={styles.span2}>
            <Input
              id="task-title"
              name="title"
              required
              autoFocus
              maxLength={500}
              defaultValue={value("title")}
              placeholder="Rappeler le client, envoyer le devis…"
            />
          </Field>
          <Field label="Description" htmlFor="task-description" className={styles.span2}>
            <Textarea
              id="task-description"
              name="description"
              rows={3}
              defaultValue={value("description")}
              placeholder="Le contexte utile pour la réaliser."
            />
          </Field>
          <Field label="Échéance">
            <DatePicker
              name="due_date"
              label="Échéance"
              withTime
              disabled={submitting}
              onValueChange={(next) => {
                if (formRef.current && !inFlight.current)
                  writeDraft(storageKey, formRef.current, { due_date: next });
              }}
              defaultValue={
                restored?.due_date !== undefined
                  ? str(restored.due_date)
                  : initial.due_date
                    ? localDateTime(initial.due_date)
                    : ""
              }
            />
          </Field>
          <Field label="Responsable">
            <Select
              name="owner_id"
              aria-label="Responsable"
              placeholder={creating ? "Moi" : "Sans responsable"}
              defaultValue={value("owner_id")}
              options={[{ value: "", label: creating ? "Moi" : "Sans responsable" }, ...members]}
              onValueChange={() => setTimeout(remember)}
            />
          </Field>
          <Field label="Statut">
            <Select
              name="status"
              aria-label="Statut"
              defaultValue={value("status")}
              options={statusOptions}
              onValueChange={() => setTimeout(remember)}
            />
          </Field>
          <Field label="Priorité">
            <Select
              name="priority"
              aria-label="Priorité"
              defaultValue={value("priority")}
              options={priorityOptions}
              onValueChange={() => setTimeout(remember)}
            />
          </Field>
          {creating && linkRecord && (
            <Field label="Fiche associée" className={styles.span2}>
              <RecordPicker
                name="record_id"
                initial={restoredCustomValue(restored?.record_id, initial.record_id)}
              />
            </Field>
          )}
        </fieldset>
        {error && (
          <div role="alert" className="alert error">
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
}
