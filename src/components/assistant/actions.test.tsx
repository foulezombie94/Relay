import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentAction } from "@/lib/agent/contracts";
vi.mock("../data-provider", () => ({
  useWorkspace: () => ({ workspace: { id: "workspace", role: "member" } }),
  request: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { initialData?: unknown }) => ({ data: options.initialData }),
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}));
import { AgentActions } from "./actions";
const action: AgentAction = {
  id: "action",
  kind: "draft_email",
  status: "draft",
  input: {
    provider: "gmail",
    to: "thomas@example.test",
    subject: "Suivi",
    body: "Bonjour Thomas",
    record_id: "exact-record",
  },
  confirmation_digest: "a".repeat(64),
  confirmation_expires_at: "2099-01-01T00:00:00Z",
  account_id: "exact-account",
  account_email: "sender@example.test",
  security: {
    risk: "high",
    origin: "source_suggestion",
    automatic: false,
    reasons: ["Instruction suspecte ignorée"],
  },
  source_refs: [{ id: "mail-id", type: "email" }],
};
describe("security confirmation UI", () => {
  it("shows exact recipient, sender, risk, parameters, source reader and both choices", () => {
    const html = renderToStaticMarkup(<AgentActions actions={[action]} />);
    for (const value of [
      "thomas@example.test",
      "sender@example.test",
      "Risque élevé",
      "exact-record",
      "exact-account",
      "Bonjour Thomas",
      "Lire l’email source",
      "Confirmer l’action",
      "Refuser",
      "aucune autorisation issue de la source",
    ])
      expect(html).toContain(value);
    expect(html).not.toContain('disabled=""');
  });
  it("disables confirmation of an expired preview", () => {
    const html = renderToStaticMarkup(
      <AgentActions actions={[{ ...action, confirmation_expires_at: "2000-01-01T00:00:00Z" }]} />,
    );
    expect(html).toContain("Confirmation expirée");
    expect(html).toMatch(/disabled=""[^>]*>Confirmer l’action/);
  });
  it("refused actions have no confirmation button and source content is escaped", () => {
    const html = renderToStaticMarkup(
      <AgentActions
        actions={[
          {
            ...action,
            status: "cancelled",
            input: { ...action.input, body: "<script>malicious()</script>" },
          },
        ]}
      />,
    );
    expect(html).not.toContain("Confirmer l’action");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
