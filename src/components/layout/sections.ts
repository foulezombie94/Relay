// Section paths under /app/[section]. Shared by the server page (404 for unknown
// sections) and the client view that loads each section's code on demand.
export const sectionPages = [
  "tasks",
  "meetings",
  "portals",
  "dashboard",
  "sequences",
  "pipelines",
  "email-templates",
  "priorities",
  "playbooks",
  "quality",
  "communications",
  "workflows",
  "assistant",
  "skills",
  "trash",
  "reports",
  "settings",
  "integrations",
  "search",
] as const;
export type SectionPage = (typeof sectionPages)[number];
const resourceSections = ["notes", "commitments", "conflicts", "handovers", "lists"];

export type SectionTarget =
  | { kind: "records"; slug: string }
  | { kind: "list"; id: string }
  | { kind: "resource"; resource: string }
  | { kind: "page"; name: SectionPage };

/** What a section path renders, or null when the section does not exist. */
export function sectionTarget(section: string): SectionTarget | null {
  if (["people", "companies", "deals"].includes(section)) return { kind: "records", slug: section };
  if (section.startsWith("object-")) return { kind: "records", slug: section.slice(7) };
  if (section.startsWith("list-")) return { kind: "list", id: section.slice(5) };
  if (resourceSections.includes(section)) return { kind: "resource", resource: section };
  if ((sectionPages as readonly string[]).includes(section))
    return { kind: "page", name: section as SectionPage };
  return null;
}
