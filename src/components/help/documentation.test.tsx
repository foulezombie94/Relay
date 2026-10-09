import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
const state = vi.hoisted(() => ({ term: "", article: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(state.article ? { article: state.article } : {}),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    onNavigate?: unknown;
  }) => {
    delete props.onNavigate;
    return createElement("a", { ...props, href }, children);
  },
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useState: () => [state.term, vi.fn()] };
});
import { Documentation } from "./documentation";
describe("user guide navigation after searching", () => {
  beforeEach(() => {
    state.term = "";
    state.article = "";
  });
  it("shows the selected guide even while a previous search remains in state", () => {
    state.term = "email";
    state.article = "integrations";
    const html = renderToStaticMarkup(<Documentation />);
    expect(html).toContain(
      "<h1>Connecter Gmail, Outlook et les calendriers</h1>",
    );
    expect(html).toContain("Déconnecter");
    expect(html).not.toContain("Le guide de votre CRM.");
  });
  it("finds instructions that only occur in the step list", () => {
    state.term = "choisissez l’inscription";
    const html = renderToStaticMarkup(<Documentation />);
    expect(html).toContain('href="/doc?article=demarrer"');
    expect(html).not.toContain("Aucun guide ne correspond");
  });
  it("gives a recovery action when no guide matches", () => {
    state.term = "zzzzinexistant";
    const html = renderToStaticMarkup(<Documentation />);
    expect(html).toContain("Aucun guide ne correspond");
    expect(html).toContain("Afficher tous les guides");
  });
});
