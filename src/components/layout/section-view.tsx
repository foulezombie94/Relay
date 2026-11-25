"use client";
import dynamic from "next/dynamic";
import { sectionTarget, type SectionPage } from "./sections";

// Each section is its own client chunk: opening Tasks no longer downloads the
// dashboards, workflows or settings code. Next.js only splits client components that
// a client component imports dynamically, hence this module.
const loading = () => <div className="loading">Ouverture du module…</div>;
const RecordsPage = dynamic(() => import("@/components/pages/records").then((m) => m.RecordsPage), {
  loading,
});
const ListPage = dynamic(() => import("@/components/pages/lists").then((m) => m.ListPage), {
  loading,
});
const ResourcePage = dynamic(
  () => import("@/components/pages/resource-page").then((m) => m.ResourcePage),
  { loading },
);
const pages = {
  tasks: dynamic(() => import("@/components/tasks/tasks-page").then((m) => m.TasksPage), {
    loading,
  }),
  meetings: dynamic(() => import("@/components/meetings/page").then((m) => m.MeetingsPage), {
    loading,
  }),
  portals: dynamic(() => import("@/components/portal/management").then((m) => m.PortalsPage), {
    loading,
  }),
  dashboard: dynamic(() => import("@/components/dashboard/page").then((m) => m.DashboardPage), {
    loading,
  }),
  sequences: dynamic(() => import("@/components/pages/sequences").then((m) => m.SequencesPage), {
    loading,
  }),
  pipelines: dynamic(() => import("@/components/pages/pipelines").then((m) => m.PipelinesPage), {
    loading,
  }),
  "email-templates": dynamic(
    () => import("@/components/pages/email-templates").then((m) => m.EmailTemplatesPage),
    { loading },
  ),
  priorities: dynamic(() => import("@/components/pages/priorities").then((m) => m.PrioritiesPage), {
    loading,
  }),
  playbooks: dynamic(() => import("@/components/pages/playbooks").then((m) => m.PlaybooksPage), {
    loading,
  }),
  quality: dynamic(() => import("@/components/pages/quality").then((m) => m.QualityPage), {
    loading,
  }),
  communications: dynamic(
    () => import("@/components/pages/communications").then((m) => m.CommunicationsPage),
    { loading },
  ),
  workflows: dynamic(() => import("@/components/pages/workflows").then((m) => m.WorkflowsPage), {
    loading,
  }),
  assistant: dynamic(() => import("@/components/pages/assistant").then((m) => m.AssistantPage), {
    loading,
  }),
  skills: dynamic(() => import("@/components/skills/page").then((m) => m.SkillsPage), {
    loading,
  }),
  trash: dynamic(() => import("@/components/trash/page").then((m) => m.TrashPage), { loading }),
  reports: dynamic(() => import("@/components/pages/reports").then((m) => m.ReportsPage), {
    loading,
  }),
  settings: dynamic(() => import("@/components/pages/settings").then((m) => m.SettingsPage), {
    loading,
  }),
  integrations: dynamic(
    () => import("@/components/pages/integrations").then((m) => m.IntegrationsPage),
    { loading },
  ),
  search: dynamic(() => import("@/components/pages/search").then((m) => m.SearchPage), {
    loading,
  }),
} satisfies Record<SectionPage, unknown>;
export function SectionView({ section }: { section: string }) {
  const target = sectionTarget(section);
  if (!target) return null;
  if (target.kind === "records") return <RecordsPage slug={target.slug} />;
  if (target.kind === "list") return <ListPage id={target.id} />;
  if (target.kind === "resource") return <ResourcePage resource={target.resource} />;
  const Page = pages[target.name];
  return <Page />;
}
