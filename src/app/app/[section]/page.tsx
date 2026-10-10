import { MeetingsPage } from "@/components/meetings/page";
import { SequencesPage } from "@/components/pages/sequences";
import { PipelinesPage } from "@/components/pages/pipelines";
import { EmailTemplatesPage } from "@/components/pages/email-templates";
import { RecordsPage } from "@/components/pages/records";
import { ResourcePage } from "@/components/pages/resource-page";
import { WorkflowsPage } from "@/components/pages/workflows";
import { AssistantPage } from "@/components/pages/assistant";
import { ReportsPage } from "@/components/pages/reports";
import { DashboardPage } from "@/components/dashboard/page";
import { SettingsPage } from "@/components/pages/settings";
import { IntegrationsPage } from "@/components/pages/integrations";
import { SearchPage } from "@/components/pages/search";
import { ListPage } from "@/components/pages/lists";
import { CommunicationsPage } from "@/components/pages/communications";
import { PrioritiesPage } from "@/components/pages/priorities";
import { PlaybooksPage } from "@/components/pages/playbooks";
import { QualityPage } from "@/components/pages/quality";
import { PortalsPage } from "@/components/portal/management";
import { notFound } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (["people", "companies", "deals"].includes(section)) return <RecordsPage slug={section} />;
  if (section.startsWith("object-")) return <RecordsPage slug={section.slice(7)} />;
  if (section.startsWith("list-")) return <ListPage id={section.slice(5)} />;
  if (["tasks", "notes", "commitments", "conflicts", "handovers", "lists"].includes(section))
    return <ResourcePage resource={section} />;
  switch (section) {
    case "meetings":
      return <MeetingsPage />;
    case "portals":
      return <PortalsPage />;
    case "dashboard":
      return <DashboardPage />;
    case "sequences":
      return <SequencesPage />;
    case "pipelines":
      return <PipelinesPage />;
    case "email-templates":
      return <EmailTemplatesPage />;
    case "priorities":
      return <PrioritiesPage />;
    case "playbooks":
      return <PlaybooksPage />;
    case "quality":
      return <QualityPage />;
    case "communications":
      return <CommunicationsPage />;
    case "workflows":
      return <WorkflowsPage />;
    case "assistant":
      return <AssistantPage />;
    case "reports":
      return <ReportsPage />;
    case "settings":
      return <SettingsPage />;
    case "integrations":
      return <IntegrationsPage />;
    case "search":
      return <SearchPage />;
    default:
      notFound();
  }
}
