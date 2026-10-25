// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RecordBoard } from "./board";
import type { CrmRecord } from "@/lib/domain/types";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const rows: CrmRecord[] = Array.from({ length: 47 }, (_, i) => ({
  id: `r-${i}`,
  workspace_id: "w",
  created_at: "2026-10-01",
  object_id: "deals",
  display_name: `Projet ${i + 1}`,
  email: null,
  domain: null,
  stage: "Qualification",
  amount: 100,
  currency: "EUR",
  owner_id: null,
  attributes: {},
  archived: false,
  version: 1,
  close_date: "2026-10-06",
}));
it("keeps all 47 cards reachable inside their stage and preserves stage changes", () => {
  const onOpen = vi.fn(),
    onMove = vi.fn().mockResolvedValue(undefined);
  render(
    <RecordBoard
      rows={rows}
      members={[]}
      readonly={false}
      busy={false}
      onOpen={onOpen}
      onMove={onMove}
      onCreate={vi.fn()}
    />,
  );
  const list = screen.getByRole("region", { name: "Opportunités : Qualification" });
  expect(list.querySelectorAll("article")).toHaveLength(47);
  const last = within(list).getByLabelText("Ouvrir l’opportunité Projet 47");
  fireEvent.keyDown(last, { key: "Enter" });
  expect(onOpen).toHaveBeenCalledExactlyOnceWith(rows[46]);
  onOpen.mockClear();
  fireEvent.change(within(last).getByRole("combobox"), { target: { value: "Proposition" } });
  expect(onMove).toHaveBeenCalledExactlyOnceWith(rows[46], "Proposition");
  expect(onOpen).not.toHaveBeenCalled();
});
it("withdraws cards when the authorized results change and preserves read-only controls", () => {
  const props = {
    rows,
    members: [],
    readonly: true,
    busy: false,
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onMove: vi.fn(),
  };
  const view = render(<RecordBoard {...props} />);
  expect((screen.getByLabelText("Étape de Projet 47") as HTMLSelectElement).disabled).toBe(true);
  expect(screen.getByLabelText("Ouvrir l’opportunité Projet 47").getAttribute("draggable")).toBe(
    "false",
  );
  view.rerender(<RecordBoard {...props} rows={[]} />);
  expect(screen.queryByLabelText("Ouvrir l’opportunité Projet 47")).toBeNull();
});
