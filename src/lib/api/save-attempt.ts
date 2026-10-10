import { RequestError } from "./request";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

const pending = new Map<string, string>();
export async function creationAttempt(scope: string, resource: string, values: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(values)),
  );
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const storageKey = `relay-attempt:${scope}:${resource}:${hash}`;
  let id = pending.get(storageKey);
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored && /^[a-f0-9-]{36}$/.test(stored)) id = stored;
  } catch {
    /* In-memory retry protection remains available when storage is blocked. */
  }
  id ??= crypto.randomUUID();
  pending.set(storageKey, id);
  try {
    sessionStorage.setItem(storageKey, id);
  } catch {
    /* See above. */
  }
  return {
    id,
    confirm() {
      pending.delete(storageKey);
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Storage may be blocked. */
      }
    },
  };
}

export function assertReplayedValues(
  row: Record<string, unknown>,
  values: Record<string, unknown>,
) {
  const same = Object.entries(values).every(([key, value]) => {
    if (key.endsWith("_at") || key === "due_date") {
      if (typeof value === "string" && typeof row[key] === "string")
        return Date.parse(value) === Date.parse(row[key]);
    }
    if (key === "amount")
      return String(value).replace(/\.0+$/, "") === String(row[key]).replace(/\.0+$/, "");
    return canonicalJson(row[key]) === canonicalJson(value);
  });
  if (!same)
    throw new RequestError(
      "Cet enregistrement existe avec des valeurs différentes. Rechargez avant de réessayer.",
      409,
    );
}
