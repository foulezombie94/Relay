// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "../ui";
import { EditorDraftScope, readDraft, restoredCustomValue } from "./editor-draft";
import { editorValues } from "./editor-values";
const fields = [
  { key: "name", label: "Nom", required: true },
  { key: "email", label: "Email", type: "email" as const, required: true },
];
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});
function show(
  save: (values: Record<string, unknown>) => Promise<unknown>,
  close = vi.fn(),
  scope = "test:user:workspace",
) {
  return {
    close,
    ...render(
      <EditorDraftScope.Provider value={scope}>
        <Editor open onClose={close} title="Contact" fields={fields} onSave={save} />
      </EditorDraftScope.Provider>,
    ),
  };
}
function fill() {
  fireEvent.change(screen.getByLabelText(/Nom/), { target: { value: " Alice " } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "alice@example.test" } });
}
describe("CRM form safety", () => {
  it.each([undefined, null, "", "   ", "invalid"])(
    "rejects missing or malformed email %s without an exception from undefined",
    (email) => {
      const form = new FormData();
      form.set("name", "Alice");
      if (email != null) form.set("email", email);
      expect(() => editorValues(form, fields)).toThrow(/email/);
    },
  );
  it("rejects whitespace-only required names", () => {
    const form = new FormData();
    form.set("name", " ");
    form.set("email", "a@example.test");
    expect(() => editorValues(form, fields)).toThrow("Complétez");
  });
  it("retains entered data and restores the draft after a failed save and remount", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Connexion interrompue"));
    const first = show(save);
    fill();
    fireEvent.submit(screen.getByRole("button", { name: "Enregistrer" }).closest("form")!);
    await screen.findByRole("alert");
    expect(first.close).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("alice@example.test");
    first.unmount();
    show(save);
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("alice@example.test");
  });
  it("blocks double submits and closure during saving, then clears the confirmed draft", async () => {
    let confirm!: () => void;
    const save = vi.fn<(values: Record<string, unknown>) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          confirm = resolve;
        }),
    );
    const { close } = show(save);
    fill();
    const form = screen.getByRole("button", { name: "Enregistrer" }).closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText(/Email/) as HTMLInputElement).disabled ||
        screen.getByLabelText(/Email/).closest("fieldset")?.disabled,
    ).toBe(true);
    confirm();
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(
      Object.keys(sessionStorage).filter((key) => key.startsWith("relay-draft:")),
    ).toHaveLength(0);
    expect(save.mock.calls[0][0]).toEqual({ name: "Alice", email: "alice@example.test" });
  });
  it("does not restore a draft into another user or workspace", () => {
    const first = show(vi.fn());
    fill();
    first.unmount();
    show(vi.fn(), vi.fn(), "test:other:workspace");
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("");
  });
  it("keeps the complete draft when reloading during a pending submission", () => {
    const first = show(() => new Promise(() => {}));
    fill();
    fireEvent.submit(screen.getByRole("button", { name: "Enregistrer" }).closest("form")!);
    window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    first.unmount();
    show(vi.fn());
    expect((screen.getByLabelText(/Nom/) as HTMLInputElement).value).toBe(" Alice ");
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("alice@example.test");
  });
  it("persists calendar input before submission and locks its popover during saving", () => {
    const save = vi.fn(() => new Promise(() => {}));
    const showDate = () =>
      render(
        <EditorDraftScope.Provider value="test:calendar:workspace">
          <Editor
            open
            title="Date"
            onClose={vi.fn()}
            fields={[{ key: "date", label: "Date", type: "date" }]}
            onSave={save}
          />
        </EditorDraftScope.Provider>,
      );
    const first = showDate();
    fireEvent.click(screen.getByRole("button", { name: /^Date :/ }));
    fireEvent.click(screen.getByRole("button", { name: "Aujourd’hui" }));
    const expected =
      first.container.ownerDocument.querySelector<HTMLInputElement>('input[name="date"]')!.value;
    expect(expected).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    first.unmount();
    const restored = showDate();
    expect(
      restored.container.ownerDocument.querySelector<HTMLInputElement>('input[name="date"]')!.value,
    ).toBe(expected);
    fireEvent.click(screen.getByRole("button", { name: /^Date :/ }));
    fireEvent.submit(screen.getByRole("button", { name: "Enregistrer" }).closest("form")!);
    expect(screen.queryByRole("button", { name: "Aujourd’hui" })).toBeNull();
    window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    const key = Object.keys(sessionStorage).find((key) => key.startsWith("relay-draft:"))!;
    expect(readDraft(key)?.date).toBe(expected);
  });
  it("keeps the form usable when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    show(vi.fn());
    fill();
    expect((screen.getByLabelText(/Email/) as HTMLInputElement).value).toBe("alice@example.test");
    vi.restoreAllMocks();
  });
  it("rejects corrupt and expired drafts without crashing custom fields", () => {
    sessionStorage.setItem(
      "expired",
      JSON.stringify({ savedAt: Date.now() - 90000000, values: { email: "old@example.test" } }),
    );
    expect(readDraft("expired")).toBeNull();
    sessionStorage.setItem("corrupt", "{");
    expect(readDraft("corrupt")).toBeNull();
    expect(restoredCustomValue("{", { safe: true })).toEqual({ safe: true });
    expect(restoredCustomValue('{"value":"saved"}', {})).toEqual({ value: "saved" });
  });
  it("rejects invalid phones and impossible dates before sending", () => {
    const form = new FormData();
    form.set("phone", "letters");
    expect(() => editorValues(form, [{ key: "phone", label: "Téléphone", type: "tel" }])).toThrow(
      "téléphone",
    );
    form.set("date", "2026-02-31");
    expect(() => editorValues(form, [{ key: "date", label: "Date", type: "date" }])).toThrow(
      "Date",
    );
  });
});
