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
export type SearchEntry = {
  id: string;
  title: string;
  href: string;
  category: string;
  excerpt: string;
  private?: boolean;
};
export const searchScopes: Record<string, string> = {
  records: "Fiches",
  notes: "Notes",
  tasks: "Tâches",
  commitments: "Engagements",
  meetings: "Réunions",
};
export const searchNavigation: SearchEntry[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    href: "/app/dashboard",
    category: "Navigation",
    excerpt: "Vue d’ensemble de votre activité CRM.",
  },
  {
    id: "companies",
    title: "Entreprises",
    href: "/app/companies",
    category: "Navigation",
    excerpt: "Vos comptes clients et prospects.",
  },
  {
    id: "people",
    title: "Personnes",
    href: "/app/people",
    category: "Navigation",
    excerpt: "Vos contacts et le fil de la relation.",
  },
  {
    id: "deals",
    title: "Opportunités",
    href: "/app/deals",
    category: "Navigation",
    excerpt: "Votre pipeline et vos dates de clôture.",
  },
  {
    id: "assistant",
    title: "Nouvelle discussion",
    href: "/app/assistant",
    category: "Navigation",
    excerpt: "Interrogez votre assistant CRM.",
  },
  {
    id: "meetings",
    title: "Réunions",
    href: "/app/meetings",
    category: "Navigation",
    excerpt: "Vos réunions et leurs comptes rendus.",
  },
];
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
          excerpt: result.excerpt,
          private: result.private,
        };
      }),
    );
}
