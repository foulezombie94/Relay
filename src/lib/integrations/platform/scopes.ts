import type { ProviderFamily } from "./contracts";
export function hasScopes(
  family: ProviderFamily,
  granted: readonly string[],
  required: readonly string[],
) {
  const normalize = (scope: string) =>
    family === "microsoft"
      ? scope.toLowerCase().replace(/^https:\/\/graph\.microsoft\.com\//, "")
      : scope;
  const scopes = new Set(granted.map(normalize));
  if (family === "google") {
    const prefix = "https://www.googleapis.com/auth/";
    if (scopes.has(prefix + "calendar.events")) scopes.add(prefix + "calendar.events.readonly");
    if (scopes.has(prefix + "gmail.compose")) scopes.add(prefix + "gmail.send");
  }
  if (family === "microsoft")
    for (const [write, read] of [
      ["mail.readwrite", "mail.read"],
      ["calendars.readwrite", "calendars.read"],
      ["files.readwrite", "files.read"],
    ])
      if (scopes.has(write)) scopes.add(read);
  return required.every((scope) => scopes.has(normalize(scope)));
}
