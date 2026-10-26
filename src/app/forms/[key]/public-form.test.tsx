// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PublicForm } from "./public-form";
const form = {
  name: "Demande de devis",
  config: {
    questions: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        property: "display_name",
        label: "Nom",
        type: "text",
        required: true,
      },
    ],
    published: true,
  },
};
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps answers and the same receipt when retrying an interrupted submission", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(form))
    .mockRejectedValueOnce(new TypeError("Failed to fetch: private-host"))
    .mockResolvedValueOnce(Response.json({ error: "private stack" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  render(<PublicForm shareKey="fixture" />);
  fireEvent.change(await screen.findByLabelText(/Nom/), { target: { value: "Alex" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Vérifiez votre connexion");
  expect(screen.getByLabelText(/Nom/)).toHaveProperty("value", "Alex");
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("temporairement indisponible"),
  );
  expect(screen.getByRole("alert").textContent).not.toMatch(/private|Failed to fetch/);
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(await screen.findByRole("status")).toBeDefined();
  const submissions = fetch.mock.calls.slice(1).map((call) => JSON.parse(call[1].body));
  expect(new Set(submissions.map((submission) => submission.attempt)).size).toBe(1);
  expect(
    submissions.every((submission) => Object.values(submission.answers).includes("Alex")),
  ).toBe(true);
});
it("allows retrying a failed load without exposing network details", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(Response.json(form)),
  );
  render(<PublicForm shareKey="fixture" />);
  expect((await screen.findByRole("alert")).textContent).toContain("Vérifiez votre connexion");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  expect(await screen.findByLabelText(/Nom/)).toBeDefined();
});
