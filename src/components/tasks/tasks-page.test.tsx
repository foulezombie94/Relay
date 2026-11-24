// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("../providers/data-provider", () => ({
  useRows: vi.fn(),
  useSave: vi.fn(),
  useWorkspace: vi.fn(),
}));
import { dueInfo, taskFields, TaskDialog, TaskRow } from "./tasks-page";
import type { Row } from "@/lib/domain/types";

afterEach(cleanup);
const members = [{ value: "u1", label: "Alex Laurent" }];

describe("Tasks page", () => {
  it("words due dates and flags late tasks", () => {
    const now = new Date(2026, 10, 24, 12, 0);
    expect(dueInfo(new Date(2026, 10, 24, 15).toISOString(), false, now)).toMatchObject({
      text: "Aujourd’hui",
      variant: "warning",
      overdue: false,
    });
    expect(dueInfo(new Date(2026, 10, 23, 9).toISOString(), false, now)).toMatchObject({
      text: "Hier",
      variant: "error",
      overdue: true,
    });
    expect(dueInfo(new Date(2026, 10, 25, 9).toISOString(), false, now)?.text).toBe("Demain");
    // A finished task is never late.
    expect(dueInfo(new Date(2026, 10, 20).toISOString(), true, now)).toMatchObject({
      variant: "outline",
      overdue: false,
    });
    expect(dueInfo(null, false, now)).toBeNull();
  });
  it("keeps the former form fields, conversions and validation", () => {
    expect(taskFields(members, true).map((f) => f.key)).toEqual([
      "title",
      "description",
      "due_date",
      "status",
      "priority",
      "record_id",
      "owner_id",
    ]);
    expect(taskFields(members, false).map((f) => f.key)).not.toContain("record_id");
    expect(taskFields(members, false).find((f) => f.key === "owner_id")).toMatchObject({
      nullable: true,
    });
  });
  it("saves an edited task with the same values as before", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const task = {
      id: "t1",
      title: "Envoyer le devis",
      description: "",
      status: "in_progress",
      priority: "high",
      owner_id: "u1",
      due_date: null,
    } as unknown as Row;
    render(
      <TaskDialog task={task} members={members} busy={false} onClose={onClose} onSave={onSave} />,
    );
    const title = (await screen.findByLabelText(/Titre/)) as HTMLInputElement;
    expect(title.value).toBe("Envoyer le devis");
    fireEvent.change(title, { target: { value: "Envoyer le devis signé" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0]).toMatchObject({
      title: "Envoyer le devis signé",
      status: "in_progress",
      priority: "high",
      owner_id: "u1",
      due_date: null,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
  it("refuses a task without a title", async () => {
    const onSave = vi.fn();
    render(
      <TaskDialog
        task={{ id: "t2", title: "", status: "open", priority: "normal" } as unknown as Row}
        members={members}
        busy={false}
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    const form = (await screen.findByLabelText(/Titre/)).closest("form")!;
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Complétez « Titre ».");
    expect(onSave).not.toHaveBeenCalled();
  });
  it("marks a task done from its checkbox and shows its context", () => {
    const onDoneChange = vi.fn();
    render(
      <TaskRow
        row={
          {
            id: "t3",
            title: "Préparer la démo",
            status: "open",
            priority: "high",
            record_id: "r1",
            record: { display_name: "Maison Atlas" },
          } as unknown as Row
        }
        ownerName="Alex Laurent"
        readOnly={false}
        busy={false}
        onDoneChange={onDoneChange}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("Maison Atlas")).toBeTruthy();
    expect(screen.getByText("Haute")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Marquer comme réalisée" }));
    expect(onDoneChange).toHaveBeenCalledWith(true);
  });
});
