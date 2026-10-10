import "server-only";
import { NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/context";
import { digest } from "./crypto";
export const zapierResource = z.enum(["people", "companies", "deals", "tasks"]);
export const zapierRecord = z
  .object({
    display_name: z.string().trim().min(1).max(200),
    email: z.email().max(320).optional(),
    domain: z.string().max(500).optional(),
    stage: z
      .enum(["Nouveau", "Qualifié", "Proposition", "Négociation", "Gagné", "Perdu"])
      .optional(),
    amount: z.number().nonnegative().max(999999999999999).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .strict();
export const zapierTask = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(10000).optional(),
    record_id: z.uuid().optional(),
    due_date: z.iso.datetime({ offset: true }).optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
  })
  .strict();
export async function zapierRequest(
  req: NextRequest,
  operation: "verify" | "list" | "create",
  resource = "people",
  body: unknown = {},
  page = 0,
  requestId: string | null = null,
) {
  const value = req.headers.get("authorization") || "";
  if (!/^Bearer relay_zap_[A-Za-z0-9_-]{43}$/.test(value))
    throw new ApiError("Clé Zapier absente ou invalide.", 401);
  const { data, error } = await adminDb().rpc("zapier_request", {
    key_hash: digest(value.slice(7)),
    operation,
    resource,
    body,
    page,
    request_id: requestId,
  });
  if (error)
    throw new ApiError(
      error.code === "28000"
        ? "Clé invalide, expirée ou révoquée."
        : error.code === "42501"
          ? "Cette clé ne permet pas cette action."
          : error.code === "40001"
            ? "Idempotency-Key déjà utilisée pour une autre demande."
            : error.code === "23503"
              ? "Fiche liée inexistante dans cet espace."
              : error.message.includes("Required custom attributes")
                ? "Des champs personnalisés obligatoires exigent une création dans Zyliad."
                : "Demande Zapier invalide.",
      error.code === "28000"
        ? 401
        : error.code === "42501"
          ? 403
          : error.code === "40001"
            ? 409
            : 400,
    );
  if (data?.error === "rate_limit")
    throw new ApiError("Limite de 60 requêtes par minute atteinte.", 429);
  return data;
}
