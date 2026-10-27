import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, databaseError } from "./context";
import { adminDb } from "@/lib/supabase/admin";
import { toolRegistry, type ToolName } from "@/lib/agent/contracts";
import { parseSkillManifest, validateSkillValues, skillExecutionPolicy, SkillValidationError, type SkillDetail, type SkillVersion, type SkillValues, type SkillRun } from "@/lib/domain/agent-skills";
import { skillTemplate } from "@/lib/domain/skill-templates";
import type { AssistantApprovalMode } from "@/lib/domain/assistant-approval";

export const skillSelectionSchema = z.union([
  z.object({ id: z.uuid(), version_id: z.uuid(), inputs: z.unknown() }).strict(),
  z.object({ builder: z.literal(true), inputs: z.unknown() }).strict(),
]);
export type SkillSelection = z.infer<typeof skillSelectionSchema>;

export async function skillRPC<T>(client: SupabaseClient, workspace: string, operation: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc("agent_skill_studio", { w: workspace, operation, payload });
  if (error?.code === "40001") throw new ApiError("Cette méthode a changé. Rechargez sa dernière version avant d’enregistrer.", 409);
  databaseError(error);
  return data as T;
}
export async function skillDetail(client: SupabaseClient, workspace: string, id: string) {
  const detail = await skillRPC<SkillDetail>(client, workspace, "get", { id });
  return { ...detail, draft: detail.draft ? parseSkillManifest(detail.draft) : null, versions: detail.versions.map((version) => ({ ...version, manifest: parseSkillManifest(version.manifest) })) };
}

export async function loadSelectedSkill(client: SupabaseClient, workspace: string, user: string, role: string, selection: SkillSelection, mode: AssistantApprovalMode) {
  if ("builder" in selection) {
    const manifest = skillTemplate("creer-skill")!;
    return { manifest, inputs: validateSkillValues(manifest, selection.inputs), allowed_tools: [] as ToolName[], reference: { builtin: "creer-skill", revision: 1 } };
  }
  const detail = await skillDetail(client, workspace, selection.id);
  const version = await skillRPC<SkillVersion>(client, workspace, "version", { id: selection.id, version_id: selection.version_id });
  const manifest = parseSkillManifest(version.manifest);
  if (manifest.dependencies.length) throw new ApiError("Les méthodes imbriquées doivent être dépliées et validées avant utilisation.", 400);
  const inputs = validateSkillValues(manifest, selection.inputs);
  if (detail.skill.granted_version_id !== version.id) throw new ApiError("Cette version nécessite une nouvelle validation de ses outils dans la bibliothèque.", 403);
  const integrations = await client.from("integrations").select("provider").eq("workspace_id", workspace).eq("user_id", user).eq("status", "connected");
  databaseError(integrations.error);
  const providers = new Set((integrations.data ?? []).map((row) => row.provider));
  const hasEmail = providers.has("gmail") || providers.has("outlook");
  const hasCalendar = providers.has("google-calendar") || providers.has("outlook-calendar");
  const tools = Object.keys(toolRegistry) as ToolName[];
  const available = tools.filter((name) => {
    if (toolRegistry[name].integration === "email") return hasEmail;
    if (toolRegistry[name].integration === "calendar") return hasCalendar;
    return true;
  });
  const policy = skillExecutionPolicy(manifest, {
    canUse: true, published: detail.skill.status === "published",
    preferences: { enabled: detail.skill.enabled, auto_select: detail.skill.auto_select, favorite: detail.skill.favorite },
    selection: "explicit", userTools: tools.filter((name) => role !== "viewer" || toolRegistry[name].effect === "read"),
    grantedTools: detail.skill.granted_tools, integrationTools: available, conversationMode: mode,
  });
  return { manifest, inputs, allowed_tools: policy.allowed_tools, reference: { id: detail.skill.id, version_id: version.id, name: manifest.name, number: version.number } };
}

export async function skillEngine(workspace: string, user: string, operation: "begin" | "finish", payload: Record<string, unknown>) {
  const result = await adminDb().rpc("agent_skill_engine", { w: workspace, u: user, operation, payload });
  databaseError(result.error);
  return result.data as SkillRun | null;
}
export function skillError(error: unknown) {
  return error instanceof SkillValidationError ? new ApiError(error.message, 400) : error;
}
export type LoadedSelection = Awaited<ReturnType<typeof loadSelectedSkill>>;
export type { SkillValues };
