import { z } from "zod";
export const templateVariables = ["name", "email", "domain", "workspace"] as const;
const templateText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .superRefine((value, ctx) => {
      for (const match of value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g))
        if (!templateVariables.includes(match[1].trim() as (typeof templateVariables)[number]))
          ctx.addIssue({
            code: "custom",
            message:
              "Variable inconnue : " + match[1] + ". Utilisez name, email, domain ou workspace.",
          });
    });
export const emailTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subject: templateText(300),
  body: templateText(20000),
});
export function renderEmailTemplate(
  text: string,
  values: Record<string, string | undefined | null>,
) {
  const missing = new Set<string>();
  const rendered = text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (match, key: string) => {
    const value = values[key.trim()];
    if (!value?.trim()) {
      missing.add(key.trim());
      return match;
    }
    return value;
  });
  return { text: rendered, missing: [...missing] };
}
