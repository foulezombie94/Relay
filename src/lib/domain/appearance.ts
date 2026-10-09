export const accentColors = [
  { id: "blue", label: "Bleu", value: "#356df3" },
  { id: "cyan", label: "Cyan", value: "#08a9cc" },
  { id: "amber", label: "Ambre", value: "#d99208" },
  { id: "orange", label: "Orange", value: "#ed7625" },
  { id: "pink", label: "Rose", value: "#e84694" },
  { id: "violet", label: "Violet", value: "#9460f9" },
  { id: "green", label: "Vert", value: "#12a875" },
] as const;
export type Appearance = {
  theme: "light" | "dark" | "system";
  accent: (typeof accentColors)[number]["id"];
  density: "comfortable" | "compact";
};
export const defaultAppearance: Appearance = {
  theme: "light",
  accent: "blue",
  density: "comfortable",
};
export function parseAppearance(raw: string | null): Appearance {
  try {
    const v: unknown = JSON.parse(raw || "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return defaultAppearance;
    const data = v as Record<string, unknown>;
    return {
      theme: ["light", "dark", "system"].includes(String(data.theme))
        ? (data.theme as Appearance["theme"])
        : defaultAppearance.theme,
      accent: accentColors.some((c) => c.id === data.accent)
        ? (data.accent as Appearance["accent"])
        : defaultAppearance.accent,
      density: data.density === "compact" ? "compact" : "comfortable",
    };
  } catch {
    return defaultAppearance;
  }
}
export function appearanceKey(user: string) {
  return "relay:appearance:v1:" + user;
}
