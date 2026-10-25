// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContactsTable } from "./contacts-table";
import { ContactsToolbar } from "./contacts-toolbar";
import { contactColumns, contactPatch, contactAttributeKey } from "./contacts-model";
import { defaultRecordView } from "@/lib/domain/views";
import type { CrmRecord, Attribute } from "@/lib/domain/types";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const record: CrmRecord = {
  id: "r1",
  workspace_id: "w",
  object_id: "people",
  created_at: "2026-10-01",
  display_name: "Camille",
  email: "camille@example.test",
  domain: null,
  stage: "Nouveau",
  amount: 0,
  currency: "EUR",
  owner_id: null,
  attributes: { city: "Lyon", kept: "À conserver" },
  archived: false,
  version: 7,
  close_date: null,
};
const attribute: Attribute = {
  id: "a",
  workspace_id: "w",
  object_id: "people",
  created_at: "2026-10-01",
  key: "city",
  name: "Ville",
  type: "text",
  required: false,
  options: [],
  archived: false,
};
const columns = contactColumns([attribute]);
const config = { ...defaultRecordView("people"), columns: ["display_name", "email", "attr_city"] };
function table(overrides: Partial<React.ComponentProps<typeof ContactsTable>> = {}) {
  return {
    rows: [record],
    columns,
    config,
    onChange: vi.fn(),
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
it("edits a cell only after saving and preserves the versioned original record", async () => {
  const p = table();
  render(<ContactsTable {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "E-mail de Camille" }));
  const input = await screen.findByRole("textbox", { name: "Valeur de E-mail" });
  fireEvent.change(input, { target: { value: "nouveau@example.test" } });
  expect(p.onSave).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await waitFor(() =>
    expect(p.onSave).toHaveBeenCalledExactlyOnceWith(record, columns[1], "nouveau@example.test"),
  );
  expect(p.onOpen).not.toHaveBeenCalled();
});
it("keeps a rejected edit open with its error and blocks editors for readers", async () => {
  const p = table({ onSave: vi.fn().mockRejectedValue(new Error("Version modifiée")) });
  const view = render(<ContactsTable {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Ville de Camille" }));
  await screen.findByRole("textbox", { name: "Valeur de Ville" });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Version modifiée");
  view.rerender(<ContactsTable {...p} readonly rows={[]} />);
  expect(screen.queryByRole("textbox", { name: "Valeur de Ville" })).toBeNull();
  view.rerender(<ContactsTable {...p} readonly />);
  expect(
    (screen.getByRole("button", { name: "E-mail de Camille" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir la fiche de Camille" }));
  expect(p.onOpen).toHaveBeenCalledExactlyOnceWith(record);
});
it("changes column order and filters without triggering record writes", async () => {
  const p = table();
  render(<ContactsTable {...p} />);
  fireEvent.click(screen.getByRole("button", { name: "Propriété Ville" }));
  fireEvent.click(await screen.findByRole("button", { name: "Déplacer à gauche" }));
  expect(p.onChange).toHaveBeenCalledExactlyOnceWith({
    ...config,
    columns: ["display_name", "attr_city", "email"],
  });
  expect(p.onSave).not.toHaveBeenCalled();
});
it("preserves all other custom values and rejects unsupported core changes", () => {
  expect(contactPatch(record, columns[3], "Paris")).toEqual({
    attributes: { city: "Paris", kept: "À conserver" },
  });
  expect(() =>
    contactPatch(record, { key: "owner_id", label: "Responsable", type: "text" }, "x"),
  ).toThrow();
  expect(contactAttributeKey("Ville", ["ville", "ville_2"])).toBe("ville_3");
});
it("opens real filter controls and disables new contacts for a reader", async () => {
  const change = vi.fn(),
    create = vi.fn();
  render(
    <ContactsToolbar
      config={config}
      onChange={change}
      mode="table"
      onMode={vi.fn()}
      columns={columns}
      members={[]}
      readonly
      onCreate={create}
      onImport={vi.fn()}
      exportControl={null}
      viewControl={null}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Filtrer les contacts" }));
  fireEvent.click(await screen.findByRole("button", { name: "Ajouter un filtre" }));
  expect(change).toHaveBeenCalledWith({
    ...config,
    filters: [{ field: "email", operator: "exists" }],
  });
  expect((screen.getByRole("button", { name: "Nouveau" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(create).not.toHaveBeenCalled();
});
