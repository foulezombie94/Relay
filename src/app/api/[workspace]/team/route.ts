import { NextRequest, NextResponse } from "next/server";
import { ApiError, checkOrigin, context, fail, databaseError, requireAdmin } from "@/lib/api/context";
import { deliverInvitation, invitationDeliveryConfigured, teamLoginUrl } from "@/lib/team/invitations";
import type { TeamInvitation } from "@/lib/domain/team";
import { z } from "zod";
type P = { params: Promise<{ workspace: string }> };
const json = (body: unknown) => NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
function teamError(error: { code?: string; message: string } | null) {
  if (!error) return;
  const messages: Record<string, [string, number]> = {
    "40001": ["Le rôle a changé depuis l’ouverture de la liste. Actualisez et recommencez.", 409],
    "42501": ["Cet accès est protégé ou réservé au propriétaire de l’espace.", 403],
    "53300": ["Limite atteinte : attendez une minute ou réduisez les invitations en attente (100 maximum).", 429],
    "23505": ["Cette personne est déjà membre de l’espace.", 409],
    "22023": ["Cette action n’est plus possible. Actualisez la liste et vérifiez le responsable choisi.", 400],
    "54000": ["Réattribuez les données par lots avant le retrait : 10 000 éléments maximum par opération.", 413],
    "55P03": ["Une modification est en cours. Réessayez dans quelques secondes.", 409],
  };
  const message = messages[error.code ?? ""];
  if (message) throw new ApiError(...message);
  databaseError(error);
}
async function body(req: NextRequest) {
  if (Number(req.headers.get("content-length") ?? "0") > 4096) throw new ApiError("Requête trop volumineuse.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("Requête invalide.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4096) { await reader.cancel(); throw new ApiError("Requête trop volumineuse.", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const text = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(text); } catch { throw new ApiError("Requête invalide."); }
}
export async function GET(req: NextRequest, { params }: P) {
  try {
    const { workspace } = await params; z.uuid().parse(workspace);
    const { client, role } = await context(workspace); requireAdmin(role);
    const p = req.nextUrl.searchParams;
    const impact = p.get("impact");
    if (impact) {
      const user = z.uuid().parse(impact);
      const counts = await Promise.all(["records", "tasks", "commitments", "handovers"].map(async table => {
        const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspace).eq("owner_id", user); databaseError(error); return [table, count ?? 0];
      }));
      return json({ counts: Object.fromEntries(counts) });
    }
    const kind = z.enum(["members", "invitations"]).parse(p.get("kind") ?? "members");
    const page = z.coerce.number().int().min(0).max(10000).parse(p.get("page") ?? "0");
    const search = z.string().trim().max(120).parse(p.get("q") ?? "");
    const filter = z.enum(["", "owner", "admin", "member", "viewer"]).parse(p.get("role") ?? "");
    const candidates = p.get("candidates") === "true";
    const size = candidates && kind === "members" ? 100 : 25;
    let query = kind === "members" ? client.from("memberships").select("id,user_id,display_name,role,version,created_at", { count: "exact" }) : client.from("invitations").select("id,email,role,created_at,last_issued_at,expires_at,accepted_at,revoked_at", { count: "exact" });
    query = query.eq("workspace_id", workspace);
    if (filter) query = query.eq("role", filter);
    if (candidates && kind === "members") query = query.in("role", ["owner", "admin", "member"]);
    if (search) query = query.ilike(kind === "members" ? "display_name" : "email", "%" + search.replace(/[\\%_]/g, "\\$&") + "%");
    const { data, count, error } = await query.order("created_at", { ascending: false }).order("id").range(page * size, page * size + size - 1); databaseError(error);
    return json({ data, count, login_url: teamLoginUrl(), delivery_configured: invitationDeliveryConfigured() });
  } catch (error) { return fail(error); }
}
async function invitationResponse(client: Awaited<ReturnType<typeof context>>["client"], workspace: string, data: unknown) {
  const invitation = data as TeamInvitation;
  const { data: space, error } = await client.from("workspaces").select("name").eq("id", workspace).single(); databaseError(error);
  const delivery = await deliverInvitation(invitation, space?.name ?? "votre espace");
  return json({ ok: true, invitation, delivery, message: delivery === "sent" ? "Invitation créée et email accepté par le service d’envoi." : delivery === "failed" ? "Invitation créée, mais l’envoi email a échoué. Copiez le lien ou renouvelez l’invitation dans une minute." : "Invitation créée. Copiez le lien et partagez-le avec cette adresse : l’envoi email automatique n’est pas configuré." });
}
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req); const { workspace } = await params;
    const { client, role } = await context(workspace, true); requireAdmin(role);
    const input = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()), role: z.enum(["admin", "member", "viewer"]) }).strict().parse(await body(req));
    const { data, error } = await client.rpc("team_invitation_manage", { w: workspace, operation: "create", mail: input.email, r: input.role }); teamError(error);
    return invitationResponse(client, workspace, data);
  } catch (error) { return fail(error); }
}
export async function PATCH(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req); const { workspace } = await params;
    const { client, role } = await context(workspace, true); requireAdmin(role);
    const input = z.union([
      z.object({ user_id: z.uuid(), role: z.enum(["admin", "member", "viewer", "remove"]), expected_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), replacement: z.uuid().optional() }).strict(),
      z.object({ invitation_id: z.uuid(), action: z.enum(["renew", "cancel"]) }).strict(),
    ]).parse(await body(req));
    if ("invitation_id" in input) {
      const { data, error } = await client.rpc("team_invitation_manage", { w: workspace, operation: input.action, invite: input.invitation_id }); teamError(error);
      return input.action === "renew" ? invitationResponse(client, workspace, data) : json({ ok: true, message: "Invitation annulée." });
    }
    const { data, error } = await client.rpc("team_member_change", { w: workspace, u: input.user_id, r: input.role, expected_version: input.expected_version, replacement: input.replacement ?? null }); teamError(error);
    return json(data);
  } catch (error) { return fail(error); }
}
