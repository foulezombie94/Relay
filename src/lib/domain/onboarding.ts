import { z } from "zod";
export const profileName = z
  .string()
  .trim()
  .min(2, "Indiquez votre nom complet (au moins 2 caractères).")
  .max(80, "Le nom doit contenir au maximum 80 caractères.");
export const onboardingWorkspace = z.object({
  name: z.string().trim().min(1, "Donnez un nom à votre espace.").max(120),
  fullName: profileName,
  timezone: z
    .string()
    .max(80)
    .refine((value) => {
      try {
        Intl.DateTimeFormat("fr", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Fuseau horaire invalide."),
  attemptId: z.uuid(),
});
