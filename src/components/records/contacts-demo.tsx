"use client";
import Link from "next/link";
import { useState } from "react";
import { ContactsToolbar } from "./contacts-toolbar";
import { ContactsTable } from "./contacts-table";
import { RecordDirectory } from "./directory";
import { contactColumns, contactPatch, contactAttributeKey } from "./contacts-model";
import { Editor, Modal } from "../ui";
import { defaultRecordView } from "@/lib/domain/views";
import type { Attribute, CrmRecord } from "@/lib/domain/types";
import styles from "./contacts.module.css";
const initialAttributes: Attribute[] = [
  { key: "company", name: "Entreprise", type: "text" },
  { key: "job", name: "Poste", type: "text" },
  { key: "city", name: "Ville", type: "text" },
  { key: "relation", name: "Relation", type: "select" },
].map((item, index) => ({
  ...item,
  id: "attr-" + index,
  workspace_id: "demo",
  object_id: "people",
  created_at: "2026-10-01",
  required: false,
  archived: false,
  options: item.type === "select" ? ["Prospect", "Client", "Partenaire"] : [],
}));
const initialRows: CrmRecord[] = [
  {
    name: "Camille Rivage",
    email: "camille@rivage.example",
    company: "Studio Rivage",
    job: "Designer",
    city: "Lyon",
    relation: "Prospect",
  },
  {
    name: "Alex Atlas",
    email: "alex@atlas.example",
    company: "Maison Atlas",
    job: "Direction commerciale",
    city: "Paris",
    relation: "Client",
  },
  {
    name: "Sam Nova",
    email: "sam@nova.example",
    company: "Équipe Nova",
    job: "Communication",
    city: "Nantes",
    relation: "Partenaire",
  },
].map((row, index) => ({
  id: "contact-" + index,
  workspace_id: "demo",
  object_id: "people",
  created_at: "2026-10-01",
  display_name: row.name,
  email: row.email,
  domain: null,
  stage: "Nouveau",
  amount: 0,
  currency: "EUR",
  owner_id: null,
  attributes: { company: row.company, job: row.job, city: row.city, relation: row.relation },
  archived: false,
  version: 1,
  close_date: null,
}));
export function ContactsDemo() {
  const [rows, setRows] = useState(initialRows),
    [attributes, setAttributes] = useState(initialAttributes),
    [view, setView] = useState({
      ...defaultRecordView("people"),
      columns: ["display_name", "email", ...initialAttributes.map((a) => "attr_" + a.key)],
    }),
    [mode, setMode] = useState("table"),
    [selected, setSelected] = useState<CrmRecord | null>(null),
    [creating, setCreating] = useState(false),
    [newProperty, setNewProperty] = useState(false),
    [notice, setNotice] = useState("");
  const columns = contactColumns(attributes);
  const visible = rows
    .filter((row) => {
      if (
        !(row.display_name + " " + row.email)
          .toLocaleLowerCase("fr")
          .includes(view.search.toLocaleLowerCase("fr"))
      )
        return false;
      return (view.filters ?? []).every((filter) => {
        const key = filter.field.replace("attributes.", "");
        const value = String(
          filter.field.startsWith("attributes.")
            ? (row.attributes[key] ?? "")
            : (row[filter.field] ?? ""),
        );
        return filter.operator === "exists"
          ? !!value
          : filter.operator === "not_exists"
            ? !value
            : filter.operator === "equals"
              ? value === filter.value
              : filter.operator === "not_equals"
                ? value !== filter.value
                : value.toLowerCase().includes((filter.value ?? "").toLowerCase());
      });
    })
    .sort(
      (a, b) =>
        (view.sort === "display_name" ? a.display_name.localeCompare(b.display_name, "fr") : 0) *
        (view.direction === "asc" ? 1 : -1),
    );
  return (
    <main data-relay-ui>
      <div className="sb-topbar">
        <Link href="/demo/components">Zyliad · Démonstration</Link>
        <span className="sb-topbar-divider" />
        <span>Contacts</span>
      </div>
      <div className={styles.page} style={{ paddingTop: 36 }}>
        <h1 className={styles.heading}>Répertoire des contacts</h1>
        <ContactsToolbar
          config={view}
          onChange={setView}
          mode={mode}
          onMode={setMode}
          columns={columns}
          members={[]}
          readonly={false}
          onCreate={() => setCreating(true)}
          onImport={() => setNotice("L’import connecté est disponible dans votre espace CRM.")}
          exportControl={null}
          viewControl={null}
        />
        {notice && <p role="status">{notice}</p>}
        {mode === "cards" ? (
          <RecordDirectory rows={visible} members={[]} slug="people" onOpen={setSelected} />
        ) : (
          <ContactsTable
            rows={visible}
            columns={columns}
            config={view}
            onChange={setView}
            onOpen={setSelected}
            onCreate={() => setCreating(true)}
            onAddProperty={() => setNewProperty(true)}
            onSave={async (record, column, value) => {
              const patch = contactPatch(record, column, value);
              setRows((current) =>
                current.map((row) =>
                  row.id === record.id
                    ? ({ ...row, ...patch, version: row.version + 1 } as CrmRecord)
                    : row,
                ),
              );
            }}
          />
        )}
        <p className="caption">Données fictives · Modifications locales à cet aperçu.</p>
        {selected && (
          <Modal
            open
            onClose={() => setSelected(null)}
            title={selected.display_name}
            description="Fiche contact de démonstration"
          >
            <p>{selected.email}</p>
            {attributes.map((a) => (
              <p key={a.key}>
                <strong>{a.name} :</strong> {String(selected.attributes[a.key] ?? "—")}
              </p>
            ))}
          </Modal>
        )}
        {creating && (
          <Editor
            open
            onClose={() => setCreating(false)}
            title="Nouveau contact"
            fields={[
              { key: "display_name", label: "Nom", required: true },
              { key: "email", label: "E-mail", type: "email" },
            ]}
            onSave={async (values) => {
              setRows((current) => [
                ...current,
                {
                  ...initialRows[0],
                  id: crypto.randomUUID(),
                  display_name: String(values.display_name),
                  email: String(values.email ?? ""),
                  attributes: {},
                },
              ]);
            }}
          />
        )}
        {newProperty && (
          <Editor
            open
            onClose={() => setNewProperty(false)}
            title="Nouvelle propriété de contact"
            fields={[{ key: "name", label: "Nom de la propriété", required: true }]}
            onSave={async (values) => {
              const key = contactAttributeKey(
                String(values.name),
                attributes.map((a) => a.key),
              );
              setAttributes((current) => [
                ...current,
                {
                  ...initialAttributes[0],
                  id: crypto.randomUUID(),
                  key,
                  name: String(values.name),
                },
              ]);
              setView((current) => ({ ...current, columns: [...current.columns, "attr_" + key] }));
            }}
          />
        )}
      </div>
    </main>
  );
}
