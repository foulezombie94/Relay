// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ save: vi.fn(), close: vi.fn() }));
vi.mock("../providers/data-provider", () => ({
  useWorkspace: () => ({ workspace: { id: "space" } }),
  useSave: () => ({ save: mocks.save, busy: false }),
  useRows: (resource: string) => ({
    data: {
      data:
        resource === "lists"
          ? [{ id: "list", name: "Clients QA" }]
          : [{ id: "foreign-entry", record_id: "another-record", list_id: "list" }],
    },
    error: null,
    isPending: false,
  }),
}));
import { RecordLists } from "./record-lists";
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ id: "entry" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not treat another record membership as a membership of this record", () => {
  render(
    <RecordLists
      recordId="current-record"
      readonly={false}
      open={false}
      onClose={mocks.close}
      onOpen={vi.fn()}
    />,
  );
  expect(screen.getByText("Aucune liste pour cette fiche.")).toBeDefined();
  expect(screen.queryByRole("link", { name: "Clients QA" })).toBeNull();
});
it("saves only after the user chooses a list and confirms", async () => {
  render(
    <RecordLists
      recordId="current-record"
      readonly={false}
      open
      onClose={mocks.close}
      onOpen={vi.fn()}
    />,
  );
  expect(mocks.save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "list" } });
  fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith("list_entries", {
      list_id: "list",
      record_id: "current-record",
    }),
  );
  expect(mocks.close).toHaveBeenCalledTimes(1);
});
it("prevents readonly users from adding list entries", () => {
  render(
    <RecordLists recordId="current-record" readonly open onClose={mocks.close} onOpen={vi.fn()} />,
  );
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "list" } });
  expect((screen.getByRole("button", { name: "Ajouter" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(mocks.save).not.toHaveBeenCalled();
});
