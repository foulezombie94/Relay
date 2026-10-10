"use client";
import { createContext } from "react";
import { z } from "zod";

export const EditorDraftScope = createContext<string | null>(null);
export function restoredCustomValue(value: unknown, fallback: unknown) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value || "null") as unknown;
  } catch {
    return fallback;
  }
}
const draft = z.object({
  savedAt: z.number(),
  values: z.record(z.string(), z.union([z.string().max(200000), z.array(z.string().max(200000))])),
});
export function readDraft(key: string | null) {
  if (!key || typeof sessionStorage === "undefined") return null;
  try {
    const parsed = draft.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
    if (parsed.success && Date.now() - parsed.data.savedAt < 86400000) return parsed.data.values;
    sessionStorage.removeItem(key);
  } catch {
    /* A blocked or corrupt draft must not break the form. */
  }
  return null;
}
export function writeDraft(
  key: string | null,
  form: HTMLFormElement,
  changed: Record<string, string | string[]> = {},
) {
  if (!key) return;
  try {
    const data = new FormData(form);
    const values: Record<string, string | string[]> = {};
    for (const name of new Set(data.keys())) {
      const entries = data
        .getAll(name)
        .filter((value): value is string => typeof value === "string");
      values[name] = entries.length === 1 ? entries[0] : entries;
    }
    sessionStorage.setItem(
      key,
      JSON.stringify({ savedAt: Date.now(), values: { ...values, ...changed } }),
    );
  } catch {
    /* The live form retains input if storage is unavailable. */
  }
}
export function clearDraft(key: string | null) {
  try {
    if (key) sessionStorage.removeItem(key);
  } catch {
    /* Storage may be blocked. */
  }
}
export function clearEditorStorage() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("relay-draft:") || key.startsWith("relay-attempt:"))
        sessionStorage.removeItem(key);
  } catch {
    /* Storage may be blocked. */
  }
}
