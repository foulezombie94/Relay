"use client";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SkillsStudio } from "./page";
import { skillTemplate } from "@/lib/domain/skill-templates";
import type { SkillDetail } from "@/lib/domain/agent-skills";
import type { Workspace } from "@/lib/domain/types";
import styles from "./skills.module.css";

const workspace: Workspace = {
  id: "skills-local",
  workspace_id: "skills-local",
  created_at: "2026-10-28T12:00:00Z",
  name: "Atelier local",
  role: "owner",
  currency: "EUR",
  timezone: "Europe/Paris",
  locale: "fr-FR",
};
const template = skillTemplate("brief-client")!;
const manifest = {
  ...template,
  instructions:
    "## Un brief utile, en quelques minutes\n\nRassemble le contexte du client et prépare un brief clair, à partir des informations accessibles dans le CRM.\n\n## Les points à examiner\n\n- Les derniers échanges avec le client\n\n- Les opportunités et engagements en cours\n\n- Les questions ouvertes avant le rendez-vous\n\n## Avant de présenter le brief\n\n- [ ] Vérifier les dates dans les sources\n\n- [ ] Signaler les informations manquantes\n\n> Une information non vérifiée doit rester une question, jamais une affirmation.\n\n---\n\nPrésente une synthèse courte, puis les prochaines étapes proposées.",
};
const preview: SkillDetail = {
  skill: {
    id: "local-method",
    workspace_id: workspace.id,
    owner_id: "local-author",
    name: manifest.name,
    description: manifest.description,
    visibility: "private",
    status: "draft",
    revision: 1,
    published_version_id: null,
    updated_at: "2026-10-28T12:00:00Z",
    category: manifest.category,
    tags: manifest.tags,
    enabled: false,
    auto_select: false,
    favorite: false,
    granted_version_id: null,
    granted_tools: [],
    usage_count: 0,
    can_edit: true,
    can_publish: true,
  },
  draft: manifest,
  versions: [],
  grants: [],
  runs: [],
};
export function SkillsLocalPreview() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <div data-relay-ui className={styles.localPreviewRoot}>
        <header className={styles.localPreviewHeader}>
          <span>Zyliad / Skills / Préparer un rendez-vous</span>
          <span>Aperçu local · Données fictives · Sans enregistrement</span>
        </header>
        <SkillsStudio workspace={workspace} user={{ id: "local-author" }} preview={preview} />
      </div>
    </QueryClientProvider>
  );
}
