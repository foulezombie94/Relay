/** Workspace hints select UI context; only the authenticated membership grants access. */
export function workspaceHref(path: string, workspaceId: string) {
  if (!/^\/app(?:\/|\?|#|$)/.test(path)) throw new Error("Expected an application path");
  const url = new URL(path, "https://workspace.invalid");
  if (url.origin !== "https://workspace.invalid") throw new Error("Expected a local path");
  url.searchParams.set("workspace", workspaceId);
  return url.pathname + url.search + url.hash;
}

/** Object, record and conversation selectors belong to the old workspace. */
export function workspaceSwitchHref(pathname: string, hash: string, workspaceId: string) {
  const section = /^\/app\/(?:object-|list-)/.test(pathname) ? "/app/dashboard" : pathname;
  return workspaceHref(section + hash, workspaceId);
}

export function recordHref(
  workspaceId: string,
  object: { standard: boolean; slug: string },
  recordId: string,
) {
  const section = object.standard ? object.slug : "object-" + object.slug;
  return workspaceHref(`/app/${section}?record=${encodeURIComponent(recordId)}`, workspaceId);
}
