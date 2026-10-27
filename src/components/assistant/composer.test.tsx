// @vitest-environment jsdom
import React, { useState, type ComponentProps } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { AssistantComposerView } from "./composer-view";
import { AssistantQuickActions } from "./start";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function props(overrides: Partial<ComponentProps<typeof AssistantComposerView>> = {}) {
  return {
    message: "Préparer mon rendez-vous",
    setMessage: vi.fn(),
    context: null,
    setContext: vi.fn(),
    busy: false,
    configured: true,
    model: "test",
    deepen: false,
    setDeepen: vi.fn(),
    approvalMode: "review" as const,
    setApprovalMode: vi.fn(),
    placement: "top" as const,
    onSend: vi.fn(),
    onStop: vi.fn(),
    contextOpen: false,
    setContextOpen: vi.fn(),
    recordSearch: "",
    setRecordSearch: vi.fn(),
    records: { loading: false, data: [] },
    ...overrides,
  };
}
it("submits Enter but preserves multiline and IME input", () => {
  const p = props();
  render(<AssistantComposerView {...p} />);
  const input = screen.getByRole("textbox", { name: "Message à l’assistant" });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(p.onSend).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(p.onSend).toHaveBeenCalledTimes(1);
});
it("blocks empty and unconfigured submissions and keeps stop available while busy", () => {
  const p = props({ message: "   " });
  const view = render(<AssistantComposerView {...p} />);
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  view.rerender(<AssistantComposerView {...p} message="Résumé" configured={false} />);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  expect(
    (screen.getByRole("button", { name: "Envoyer le message" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(p.onSend).not.toHaveBeenCalled();
  view.rerender(<AssistantComposerView {...p} busy />);
  fireEvent.click(screen.getByRole("button", { name: "Arrêter la réponse" }));
  expect(p.onStop).toHaveBeenCalledTimes(1);
  expect(p.onSend).not.toHaveBeenCalled();
});
it("fills a CRM starter without submitting a message", () => {
  const choose = vi.fn();
  const view = render(<AssistantQuickActions disabled={false} onChoose={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Analyser mon pipeline" }));
  expect(choose).toHaveBeenCalledTimes(1);
  expect(choose.mock.calls[0][0]).toContain("sources");
  view.rerender(<AssistantQuickActions disabled onChoose={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Analyser mon pipeline" }));
  expect(choose).toHaveBeenCalledTimes(1);
});
it("keeps the record picker open when handing off from the context menu", async () => {
  const p = props({
    records: { loading: false, data: [{ id: "record", display_name: "Studio Rivage" }] },
  });
  function Composer() {
    const [open, setOpen] = useState(false);
    return <AssistantComposerView {...p} contextOpen={open} setContextOpen={setOpen} />;
  }
  render(<Composer />);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter du contexte et des options" }));
  fireEvent.click(await screen.findByRole("button", { name: "Choisir une fiche CRM" }));
  const record = await screen.findByRole("button", { name: /Studio Rivage/ });
  fireEvent.click(record);
  expect(p.setContext).toHaveBeenCalledExactlyOnceWith({ id: "record", label: "Studio Rivage" });
  expect(p.onSend).not.toHaveBeenCalled();
});

it("offers three approval modes, updates the toolbar and never sends on selection", async () => {
  const p = props();
  function Composer() {
    const [mode, setMode] =
      useState<ComponentProps<typeof AssistantComposerView>["approvalMode"]>("review");
    return <AssistantComposerView {...p} approvalMode={mode} setApprovalMode={setMode} />;
  }
  render(<Composer />);
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Choisir les autorisations : Vérifier pour moi" }),
    { key: "ArrowDown" },
  );
  expect(await screen.findAllByRole("menuitemradio")).toHaveLength(3);
  expect(
    screen.getByRole("menuitemradio", { name: /Vérifier pour moi/ }).getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("menuitemradio", { name: /Toujours me consulter/ }));
  expect(
    await screen.findByRole("button", {
      name: "Choisir les autorisations : Toujours me consulter",
    }),
  ).toBeTruthy();
  expect(screen.queryByRole("menu")).toBeNull();
  expect(p.onSend).not.toHaveBeenCalled();
});

it("disables the approval selector during an active response", () => {
  render(<AssistantComposerView {...props({ busy: true })} />);
  expect(
    (screen.getByRole("button", { name: /Choisir les autorisations/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("requires an explicit confirmation for autonomy and preserves the mode on cancel", async () => {
  const p = props();
  render(<AssistantComposerView {...p} />);
  async function requestAutonomy() {
    fireEvent.keyDown(screen.getByRole("button", { name: /Choisir les autorisations/ }), {
      key: "ArrowDown",
    });
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Avancer en autonomie/ }));
    return screen.findByRole("alertdialog");
  }
  const warning = await requestAutonomy();
  expect(within(warning).getAllByRole("button")).toHaveLength(2);
  expect(p.setApprovalMode).not.toHaveBeenCalled();
  fireEvent.click(within(warning).getByRole("button", { name: "Annuler" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(p.setApprovalMode).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /Choisir les autorisations/ }),
    ),
  );
  const reopened = await requestAutonomy();
  fireEvent.click(within(reopened).getByRole("button", { name: "Confirmer" }));
  expect(p.setApprovalMode).toHaveBeenCalledExactlyOnceWith("auto");
  expect(p.onSend).not.toHaveBeenCalled();
});
