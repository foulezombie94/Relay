import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/supabase/server";
import { assertAuthAvailable } from "@/lib/supabase/session";
import { ApiError, databaseError } from "./context";
import { workflowBody } from "./workflow-body";
import {
  portalDirectorySchema,
  portalDetailSchema,
  portalSummarySchema,
  portalMessageSchema,
  portalItemTypes,
} from "@/lib/domain/portals";
export const portalHeaders = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
export async function portalMessageBody(request: NextRequest) {
  const body = await workflowBody(request, 32768);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ApiError("Le contenu envoyé est invalide.", 400);
  }
}
export const portalListFilters = z
  .object({
    q: z.string().trim().max(200).default(""),
    page: z.coerce.number().int().min(0).max(10000).default(0),
    state: z.enum(["all", "active", "paused"]).default("all"),
  })
  .strict();
export const portalDetailFilters = z
  .object({
    type: z.enum(["all", ...portalItemTypes]).default("all"),
    items_page: z.coerce.number().int().min(0).max(10000).default(0),
    comments_page: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .strict();
export async function portalSession() {
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  assertAuthAvailable(error);
  if (!user || error) throw new ApiError("Connectez-vous avec l’adresse invitée.", 401);
  const claim = await client.rpc("claim_invitations");
  databaseError(claim.error);
  return { client, user };
}
export async function portalDirectory(
  client: SupabaseClient,
  filters: z.infer<typeof portalListFilters>,
) {
  const { data, error } = await client.rpc("portal_directory", {
    search_text: filters.q,
    page_number: filters.page,
    state_filter: filters.state,
  });
  databaseError(error);
  return portalDirectorySchema.parse(data);
}
export async function portalSummariesForWorkspace(
  client: SupabaseClient,
  workspace: string,
  ids: string[],
) {
  z.array(z.uuid()).max(24).parse(ids);
  if (!ids.length) return [];
  const allowed = await client
    .from("portals")
    .select("id")
    .eq("workspace_id", workspace)
    .in("id", ids);
  databaseError(allowed.error);
  if (ids.some((id) => !allowed.data?.some((portal) => portal.id === id)))
    throw new ApiError("Un portail est inaccessible dans cet espace.", 403);
  const result = await client.rpc("portal_summaries", { portal_ids: ids });
  databaseError(result.error);
  return z.array(portalSummarySchema).max(24).parse(result.data);
}
export async function portalContext(id: string) {
  z.uuid().parse(id);
  const { client, user } = await portalSession();
  const { data: portal, error } = await client
    .from("portals")
    .select("id,name,workspace_id")
    .eq("id", id)
    .eq("enabled", true)
    .maybeSingle();
  databaseError(error);
  if (!portal) throw new ApiError("Ce portail est inaccessible ou désactivé.", 403);
  const response = await client.rpc("portal_summaries", { portal_ids: [id] });
  databaseError(response.error);
  const summaries = z.array(portalSummarySchema).max(1).parse(response.data);
  if (!summaries[0]) throw new ApiError("Ce portail est inaccessible ou désactivé.", 403);
  return { client, user, portal, summary: summaries[0] };
}
export async function portalDetail(
  context: Awaited<ReturnType<typeof portalContext>>,
  filters: z.infer<typeof portalDetailFilters>,
) {
  const { client, user, portal, summary } = context;
  let itemsQuery = client
    .from("portal_items")
    .select("id,title,content,type,status,due_date,document_id,created_at", { count: "exact" })
    .eq("portal_id", portal.id)
    .eq("workspace_id", portal.workspace_id);
  if (filters.type === "document")
    itemsQuery = itemsQuery.or("type.eq.document,document_id.not.is.null");
  else if (filters.type !== "all") itemsQuery = itemsQuery.eq("type", filters.type);
  const [items, comments] = await Promise.all([
    itemsQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(filters.items_page * 50, filters.items_page * 50 + 49),
    client
      .from("portal_comments")
      .select("id,content,created_at,author_id", { count: "exact" })
      .eq("portal_id", portal.id)
      .eq("workspace_id", portal.workspace_id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(filters.comments_page * 25, filters.comments_page * 25 + 24),
  ]);
  databaseError(items.error);
  databaseError(comments.error);
  return portalDetailSchema.parse({
    portal: { id: portal.id, name: portal.name },
    summary,
    items: items.data,
    comments: (comments.data ?? []).map((comment) => ({
      id: comment.id,
      content: comment.content,
      created_at: comment.created_at,
      own: comment.author_id === user.id,
    })),
    items_count: items.count ?? 0,
    comments_count: comments.count ?? 0,
    items_page: filters.items_page,
    comments_page: filters.comments_page,
    can_comment: summary.can_comment,
  });
}
export async function postPortalMessage(
  context: Awaited<ReturnType<typeof portalContext>>,
  input: unknown,
  key: string | null,
) {
  const { client, user, portal, summary } = context;
  if (!summary.can_comment)
    throw new ApiError("Vous n’avez pas l’autorisation de commenter ce portail.", 403);
  const { content } = portalMessageSchema.parse(input);
  const id = key ? z.uuid().parse(key) : crypto.randomUUID();
  const { data, error } = await client
    .from("portal_comments")
    .insert({
      id,
      workspace_id: portal.workspace_id,
      portal_id: portal.id,
      content,
      author_id: user.id,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const existing = await client
      .from("portal_comments")
      .select("id,content")
      .eq("id", id)
      .eq("workspace_id", portal.workspace_id)
      .eq("portal_id", portal.id)
      .eq("author_id", user.id)
      .maybeSingle();
    databaseError(existing.error);
    if (existing.data?.content === content) return { id: existing.data.id };
    throw new ApiError(
      "Ce message existe avec des valeurs différentes. Rechargez avant de réessayer.",
      409,
    );
  }
  databaseError(error);
  if (!data || data.id !== id) throw new ApiError("Le message n’a pas été confirmé.", 500);
  return { id: data.id };
}
export async function portalDocument(
  context: Awaited<ReturnType<typeof portalContext>>,
  document: string,
) {
  const { client, portal } = context;
  z.uuid().parse(document);
  const item = await client
    .from("portal_items")
    .select("id")
    .eq("workspace_id", portal.workspace_id)
    .eq("portal_id", portal.id)
    .eq("document_id", document)
    .limit(1)
    .maybeSingle();
  databaseError(item.error);
  if (!item.data) throw new ApiError("Ce document n’est pas partagé dans ce portail.", 403);
  const doc = await client
    .from("documents")
    .select("path")
    .eq("workspace_id", portal.workspace_id)
    .eq("id", document)
    .maybeSingle();
  databaseError(doc.error);
  if (!doc.data) throw new ApiError("Document inaccessible.", 404);
  const signed = await client.storage.from("relay-documents").createSignedUrl(doc.data.path, 60);
  databaseError(signed.error);
  if (!signed.data?.signedUrl) throw new ApiError("Document temporairement indisponible.", 503);
  return signed.data.signedUrl;
}
