// @vitest-environment jsdom
import React from "react";
import { render, fireEvent, screen, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { McpConsent } from "./consent";
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(["Autoriser la connexion", "Refuser"])(
  "posts the context actually shown for %s",
  async (label) => {
    const context = "d".repeat(64),
      workspace = "5b63b076-5a2e-483b-9f40-85fa714ceace";
    const call = vi.fn().mockResolvedValue(Response.json({ error: "expired" }, { status: 403 }));
    vi.stubGlobal("fetch", call);
    render(
      React.createElement(McpConsent, {
        consentContext: context,
        clientName: "Client affiché",
        requestedScopes: ["records:read"],
        workspaces: [{ id: workspace, name: "Workspace affiché", role: "owner" }],
      }),
    );
    expect(screen.getByText(/n’est pas vérifié/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    expect(JSON.parse(call.mock.calls[0][1].body)).toEqual({
      consent_context: context,
      workspace,
      scopes: ["records:read"],
      allow: label === "Autoriser la connexion",
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("expiré"));
  },
);
