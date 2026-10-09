"use client";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { Editor, Loading, ErrorMessage, str, type Field } from "../ui";
import type { CrmRecord, Attribute } from "@/lib/domain/types";
import { stages } from "@/lib/domain/types";
export function RecordEditor({
  record,
  onClose,
  onSaved,
}: {
  record: CrmRecord;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { objects, workspace } = useWorkspace();
  const object = objects.find((o) => o.id === record.object_id);
  const attrs = useRows<Attribute>("attributes", {
      object_id: record.object_id,
      size: 100,
    }),
    members = useRows("memberships", { size: 100 });
  const { save, busy } = useSave();
  if (attrs.isPending || members.isPending) return <Loading />;
  if (attrs.error || members.error)
    return <ErrorMessage error={attrs.error || members.error} />;
  const custom = (attrs.data?.data ?? []).filter(
    (a) => !a.archived && a.type !== "formula",
  );
  const fields: Field[] = [
    { key: "display_name", label: "Nom", required: true },
    { key: "email", label: "Email", type: "email" },
    { key: "domain", label: "Site ou domaine" },
    {
      key: "owner_id",
      label: "Responsable",
      type: "select",
      options: (members.data?.data ?? []).map((m) => ({
        value: str(m.user_id),
        label: str(m.display_name) || str(m.user_id),
      })),
    },
  ];
  if (object?.slug === "deals")
    fields.push(
      {
        key: "stage",
        label: "Étape",
        type: "select",
        options: stages.map((s) => ({ value: s, label: s })),
      },
      { key: "amount", label: "Montant", type: "number" },
      { key: "currency", label: "Devise", required: true },
      { key: "close_date", label: "Clôture", type: "date" },
    );
  for (const a of custom)
    fields.push({
      key: "attr_" + a.key,
      label: a.name,
      required: a.required,
      type:
        a.type === "boolean"
          ? "checkbox"
          : ["number", "money"].includes(a.type)
            ? "number"
            : a.type === "select"
              ? "select"
              : a.type === "date"
                ? "date"
                : a.type === "datetime"
                  ? "datetime-local"
                  : a.type === "email"
                    ? "email"
                    : a.type === "multi_select"
                      ? "json"
                      : "text",
      options: (a.options ?? []).map((v) => ({ value: v, label: v })),
    });
  return (
    <Editor
      open
      onClose={onClose}
      title={"Modifier · " + record.display_name}
      fields={fields}
      busy={busy || workspace.role === "viewer"}
      initial={{
        ...record,
        ...Object.fromEntries(
          custom.map((a) => ["attr_" + a.key, record.attributes[a.key]]),
        ),
      }}
      onSave={async (values) => {
        const attributes = { ...record.attributes };
        for (const a of custom) {
          attributes[a.key] = values["attr_" + a.key] ?? null;
          delete values["attr_" + a.key];
        }
        await save(
          "records",
          {
            ...values,
            email: values.email ?? "",
            domain: values.domain ?? "",
            owner_id: values.owner_id ?? null,
            attributes,
          },
          record,
        );
        await onSaved();
      }}
    />
  );
}
