import { z } from "zod";
const result = z.object({
  inserted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(z.object({ line: z.number().int(), message: z.string() })),
  replayed: z.boolean(),
  linked: z.number().int().nonnegative().optional(),
  pending: z.number().int().nonnegative().optional(),
});
export function confirmedImport(value: unknown) {
  const parsed = result.safeParse(value);
  if (!parsed.success || parsed.data.inserted + parsed.data.skipped === 0)
    throw new Error(
      "Aucune ligne importée n’a été confirmée. Conservez votre fichier et réessayez.",
    );
  return parsed.data;
}
