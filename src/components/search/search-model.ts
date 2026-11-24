export type SearchResult = {
  id: string;
  object_id?: string;
  record_id?: string;
  title: string;
  excerpt: string;
  private: boolean;
  date?: string;
  status?: string;
};
export type SearchResponse = {
  groups: { resource: string; count: number; results: SearchResult[] }[];
  related: { id: string; object_id: string; display_name: string }[];
};
export type SearchIcon =
  | "plus"
  | "dashboard"
  | "company"
  | "person"
  | "deal"
  | "task"
  | "note"
  | "meeting"
  | "assistant"
  | "pipeline"
  | "portal"
  | "settings"
  | "trash"
  | "result";
export type SearchEntry = {
  id: string;
  title: string;
  href: string;
  category: string;
  excerpt: string;
  private?: boolean;
  /** Heading the entry is listed under (Actions, Aller à, Fiches, Notes…). */
  group?: string;
  icon?: SearchIcon;
};
export const searchScopes: Record<string, string> = {
  records: "Fiches",
  notes: "Notes",
  tasks: "Tâches",
  commitments: "Engagements",
  meetings: "Réunions",
};
const action = (
  id: string,
  title: string,
  href: string,
  excerpt: string,
  icon: SearchIcon,
): SearchEntry => ({
  id: "action:" + id,
  title,
  href,
  category: "Action",
  excerpt,
  group: "Actions",
  icon,
});
const page = (
  id: string,
  title: string,
  href: string,
  excerpt: string,
  icon: SearchIcon,
): SearchEntry => ({ id, title, href, category: "Navigation", excerpt, group: "Aller à", icon });
/** Quick actions shown first in the command menu. */
export const searchActions: SearchEntry[] = [
  action(
    "task",
    "Nouvelle tâche",
    "/app/tasks?create=1",
    "Créer une tâche avec échéance et responsable.",
    "plus",
  ),
  action(
    "assistant",
    "Nouvelle discussion",
    "/app/assistant",
    "Interrogez votre assistant CRM.",
    "assistant",
  ),
  action(
    "portal",
    "Nouveau portail client",
    "/app/portals?create=1",
    "Partager un espace avec un client.",
    "portal",
  ),
];
/** Every main page of the workspace. */
export const searchNavigation: SearchEntry[] = [
  page(
    "dashboard",
    "Dashboard",
    "/app/dashboard",
    "Vue d’ensemble de votre activité CRM.",
    "dashboard",
  ),
  page(
    "companies",
    "Entreprises",
    "/app/companies",
    "Vos comptes clients et prospects.",
    "company",
  ),
  page("people", "Personnes", "/app/people", "Vos contacts et le fil de la relation.", "person"),
  page("deals", "Opportunités", "/app/deals", "Votre pipeline et vos dates de clôture.", "deal"),
  page("tasks", "Tâches", "/app/tasks", "Vos prochaines actions, au bon endroit.", "task"),
  page("notes", "Notes", "/app/notes", "Les informations utiles à toute votre équipe.", "note"),
  page("meetings", "Réunions", "/app/meetings", "Vos réunions et leurs comptes rendus.", "meeting"),
  page("pipelines", "Pipelines", "/app/pipelines", "Les étapes de vos ventes.", "pipeline"),
  page(
    "portals",
    "Portails clients",
    "/app/portals",
    "Les espaces partagés avec vos clients.",
    "portal",
  ),
  page(
    "settings",
    "Paramètres",
    "/app/settings",
    "Votre espace, votre équipe et vos intégrations.",
    "settings",
  ),
  page("trash", "Corbeille", "/app/trash", "Restaurer un élément supprimé.", "trash"),
];
const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
/** Actions and pages matching the typed text, accents and case ignored. */
export function commandEntries(term: string): SearchEntry[] {
  const all = [...searchActions, ...searchNavigation];
  const query = fold(term.trim());
  if (!query) return all;
  return all.filter((entry) => fold(entry.title + " " + entry.excerpt).includes(query));
}
export function searchEntries(
  data: SearchResponse,
  objects: { id: string; slug: string; standard: boolean }[],
): SearchEntry[] {
  return data.groups
    .filter((group) => Object.hasOwn(searchScopes, group.resource))
    .flatMap((group) =>
      group.results.map((result) => {
        const linked = result.object_id
          ? { id: result.id, object_id: result.object_id }
          : data.related.find((row) => row.id === result.record_id);
        const object = objects.find((item) => item.id === linked?.object_id);
        const href =
          linked && object
            ? `/app/${object.standard ? object.slug : "object-" + object.slug}?${new URLSearchParams({ record: linked.id })}`
            : `/app/${group.resource === "records" ? "search" : group.resource}`;
        return {
          id: group.resource + ":" + result.id,
          title: result.title,
          href,
          category: searchScopes[group.resource],
          group: searchScopes[group.resource],
          icon: "result" as const,
          excerpt: result.excerpt,
          private: result.private,
        };
      }),
    );
}
