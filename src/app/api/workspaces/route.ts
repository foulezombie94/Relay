import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase/server";
import {
  ApiError,
  checkOrigin,
  databaseError,
  fail,
  context,
  requireAdmin,
  jsonBody,
} from "@/lib/api/context";
import { z } from "zod";
import { assertAuthAvailable } from "@/lib/supabase/session";
import { secondFactorPending } from "@/lib/supabase/mfa";
export async function GET() {
  try {
    const client = await db();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    assertAuthAvailable(authError);
    if (authError || !user) throw new ApiError("Connexion requise.", 401);
    if (await secondFactorPending(client, user))
      throw new ApiError("Confirmez votre code de double authentification.", 401, "mfa_required");
    const { error: invitationError } = await client.rpc("claim_invitations");
    databaseError(invitationError);
    const { data, error } = await client
      .from("memberships")
      .select("role,workspaces(*)")
      .eq("user_id", user.id);
    databaseError(error);
    const { data: blocked, error: blockedError } = await client.rpc("mfa_blocked_workspaces");
    databaseError(blockedError);
    return NextResponse.json({
      // Memberships of workspaces hidden by their 2FA requirement return no workspace row.
      data: (data ?? [])
        .filter((m) => m.workspaces)
        .map((m) => ({ ...m.workspaces, role: m.role })),
      mfa_blocked: Array.isArray(blocked) ? blocked : [],
      user: { id: user.id, email: user.email },
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const { name } = z
      .object({ name: z.string().trim().min(1).max(120) })
      .parse(await jsonBody(request));
    const client = await db();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    assertAuthAvailable(authError);
    if (authError || !user) throw new ApiError("Connexion requise.", 401);
    const { data, error } = await client.rpc("create_workspace", { label: name });
    databaseError(error);
    if (!z.uuid().safeParse(data).success)
      throw new ApiError("La création de l’espace n’a pas été confirmée.", 500);
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: NextRequest) {
  try {
    checkOrigin(request);
    const { id, values } = z
      .object({
        id: z.uuid(),
        values: z.object({
          name: z.string().trim().min(1).max(120).optional(),
          timezone: z
            .string()
            .max(80)
            .refine((v) => {
              try {
                Intl.DateTimeFormat("fr", { timeZone: v });
                return true;
              } catch {
                return false;
              }
            }, "Fuseau horaire invalide")
            .optional(),
          currency: z
            .string()
            .regex(/^[A-Z]{3}$/)
            .optional(),
          locale: z.enum(["fr", "en"]).optional(),
          require_mfa: z.boolean().optional(),
          track_email_opens: z.boolean().optional(),
          auto_enrich: z.boolean().optional(),
          track_email_clicks: z.boolean().optional(),
          capture_excluded_domains: z
            .array(
              z
                .string()
                .trim()
                .toLowerCase()
                .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Domaine invalide"),
            )
            .max(200)
            .optional(),
        }),
      })
      .parse(await jsonBody(request));
    if (!Object.keys(values).length) throw new ApiError("Aucune modification à enregistrer.");
    const { client, role } = await context(id, true);
    requireAdmin(role);
    const { data, error } = await client
      .from("workspaces")
      .update(values)
      .eq("id", id)
      .select()
      .single();
    databaseError(error);
    if (!data || data.id !== id) throw new ApiError("L’espace a changé ou est inaccessible.", 409);
    return NextResponse.json({ data });
  } catch (e) {
    return fail(e);
  }
}
