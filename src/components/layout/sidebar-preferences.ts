export const defaultSidebarShortcuts = ["dashboard", "assistant", "priorities"];
export type SidebarPreferences = {
  order: string[];
  hidden: string[];
  favorites: string[];
  shortcuts: string[];
  entryOrder: string[];
  hiddenEntries: string[];
};

export function readSidebarPreferences(
  raw: string | null,
  groupIds: readonly string[],
  entryIds: readonly string[],
  shortcutIds: readonly string[] = defaultSidebarShortcuts,
): SidebarPreferences {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      value = parsed as Record<string, unknown>;
  } catch {
    /* Invalid or unavailable browser preferences use the default navigation. */
  }
  function allowed(input: unknown, ids: readonly string[]) {
    return Array.isArray(input)
      ? [...new Set(input.filter((id): id is string => typeof id === "string" && ids.includes(id)))]
      : [];
  }
  const order = allowed(value.order, groupIds);
  const entryOrder = allowed(value.entryOrder, entryIds);
  return {
    order: [...order, ...groupIds.filter((id) => !order.includes(id))],
    hidden: allowed(value.hidden, groupIds),
    favorites: allowed(value.favorites, entryIds),
    shortcuts: Array.isArray(value.shortcuts)
      ? allowed(value.shortcuts, shortcutIds)
      : defaultSidebarShortcuts.filter((id) => shortcutIds.includes(id)),
    entryOrder: [...entryOrder, ...entryIds.filter((id) => !entryOrder.includes(id))],
    hiddenEntries: allowed(value.hiddenEntries, entryIds),
  };
}

export function moveSidebarItem(items: readonly string[], id: string, target: string) {
  if (id === target || !items.includes(id) || !items.includes(target)) return [...items];
  const next = items.filter((value) => value !== id);
  next.splice(items.indexOf(target), 0, id);
  return next;
}
