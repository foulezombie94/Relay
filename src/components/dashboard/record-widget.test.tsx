// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordWidget } from "./record-widget";
import { defaultTile, type DashboardEntry } from "@/lib/domain/dashboards";
afterEach(cleanup);
const entry: DashboardEntry = {
  id: "a",
  record_id: null,
  title: "Private opportunity",
  stage: "Qualification",
  status: null,
  currency: "EUR",
  amount: "100",
  occurred_at: "2026-10-10T10:00:00Z",
};
const initial = { data: [entry], total: 55, next_cursor: "a", partial: true };
describe("dashboard record views", () => {
  it("loads the next bounded page and does not silently append stale source data", async () => {
    const onRequest = vi.fn().mockResolvedValue({
      data: [{ ...entry, id: "b", title: "Next opportunity" }],
      total: 55,
      next_cursor: null,
      partial: true,
    });
    render(
      <RecordWidget
        tile={defaultTile({ visual: "list" })}
        initial={initial}
        onRequest={onRequest}
        onOpen={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Suivante/ }));
    await screen.findByText("Next opportunity");
    expect(onRequest).toHaveBeenCalledWith({ cursor: "a", month: undefined });
    expect(screen.queryByText("Private opportunity")).toBeNull();
  });
  it("removes previously loaded titles when a new source request is rejected", async () => {
    const onRequest = vi.fn().mockRejectedValue(new Error("Accès révoqué"));
    render(
      <RecordWidget
        tile={defaultTile({ visual: "list" })}
        initial={initial}
        onRequest={onRequest}
        onOpen={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Suivante/ }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Private opportunity")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Accès révoqué");
  });
  it("searches only the current page and labels partial coverage", () => {
    render(
      <RecordWidget
        tile={defaultTile({ title: "Pipeline", visual: "list" })}
        initial={initial}
        onOpen={() => {}}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher dans Pipeline" }), {
      target: { value: "unmatched" },
    });
    expect(screen.queryByText("Private opportunity")).toBeNull();
    expect(screen.getByText(/aperçu paginé/).textContent).toContain("55 sources");
  });
  it("requests a different calendar month with a fresh page cursor", async () => {
    const onRequest = vi.fn().mockResolvedValue({ ...initial, month: "2026-11" });
    render(
      <RecordWidget
        tile={defaultTile({ visual: "calendar" })}
        initial={{ ...initial, month: "2026-10" }}
        onRequest={onRequest}
        onOpen={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mois suivant" }));
    await screen.findByText("novembre 2026");
    expect(onRequest).toHaveBeenCalledWith({ cursor: null, month: "2026-11" });
  });
  it("keeps identically named dates from different years in distinct timeline groups", () => {
    render(
      <RecordWidget
        tile={defaultTile({ visual: "timeline" })}
        initial={{
          ...initial,
          data: [
            entry,
            { ...entry, id: "b", title: "Last year's source", occurred_at: "2025-10-10T10:00:00Z" },
          ],
        }}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText("10 oct. 2026")).toBeTruthy();
    expect(screen.getByText("10 oct. 2025")).toBeTruthy();
  });
  it("treats provider strings as plain data, including prototype-like names", () => {
    render(
      <RecordWidget
        tile={defaultTile({ visual: "board", group_by: "stage" })}
        initial={{
          ...initial,
          data: [{ ...entry, stage: "__proto__", title: "<script>private()</script>" }],
        }}
        onOpen={() => {}}
      />,
    );
    expect(screen.getAllByText("__proto__").length).toBeGreaterThan(0);
    expect(document.querySelector("script")).toBeNull();
  });
  it("opens an explicit source only following a user click", async () => {
    const onOpen = vi.fn();
    render(
      <RecordWidget tile={defaultTile({ visual: "gallery" })} initial={initial} onOpen={onOpen} />,
    );
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Private opportunity/ }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(entry));
  });
});
