import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, fail, ApiError } from "@/lib/api/context";
import { workflowBody } from "@/lib/api/workflow-body";
import {
  skillDetail,
  skillAvailableTools,
  loadSelectedSkill,
  skillError,
} from "@/lib/api/agent-skills";
import { assertSkillResources, resolveSkillContext } from "@/lib/api/skill-context";
import { parseSkillManifest } from "@/lib/domain/agent-skills";
import {
  missingSkillInputs,
  previewSkillText,
  type SkillPreview,
} from "@/lib/domain/skill-context";
import { toolRegistry } from "@/lib/agent/contracts";
import { assistantApprovalMode } from "@/lib/domain/assistant-approval";
const schema = z
  .object({
    id: z.uuid(),
    version_id: z.uuid().optional(),
    manifest: z.unknown().optional(),
    record_id: z.uuid().optional(),
    inputs: z.unknown(),
    approval_mode: assistantApprovalMode,
  })
  .strict();
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const input = schema.parse(JSON.parse(await workflowBody(req, 70000)));
    const { client, user, role } = await context(workspace);
    const draft = input.manifest !== undefined;
    let manifest, prepared, available;
    if (draft) {
      const detail = await skillDetail(client, workspace, input.id);
      if (!detail.skill.can_edit || role === "viewer")
        throw new ApiError("Ce brouillon n’est pas modifiable.", 403);
      manifest = parseSkillManifest(input.manifest);
      await assertSkillResources(client, workspace, manifest);
      prepared = await resolveSkillContext(
        client,
        workspace,
        manifest,
        input.inputs,
        input.record_id,
        true,
      );
      available = await skillAvailableTools(client, workspace, user.id, role);
    } else {
      if (!input.version_id) throw new ApiError("Choisissez une version de la méthode.");
      const loaded = await loadSelectedSkill(
        client,
        workspace,
        user.id,
        role,
        { id: input.id, version_id: input.version_id, inputs: input.inputs },
        input.approval_mode,
        input.record_id,
        true,
      );
      manifest = loaded.manifest;
      prepared = { ...loaded.contextData, inputs: loaded.inputs };
      available = loaded.allowed_tools;
    }
    const missing = [
      ...missingSkillInputs(manifest, prepared.inputs),
      ...prepared.missingVariables.map((key) => `{{${key}}}`),
    ];
    const tools = manifest.tools.map((name) => ({
      name,
      effect: toolRegistry[name].effect,
      available: available.includes(name),
    }));
    const issues = [
      ...(manifest.dependencies.length
        ? ["Les méthodes imbriquées ne sont pas prises en charge."]
        : []),
      ...(tools.some((tool) => !tool.available)
        ? ["Certaines autorisations ou intégrations sont indisponibles."]
        : []),
    ];
    const data: SkillPreview = {
      name: manifest.name,
      draft,
      ready: !missing.length && !issues.length,
      record: prepared.record,
      inputs: prepared.inputs,
      bindings: prepared.bindings,
      missing,
      issues,
      instructions: previewSkillText(manifest.instructions, prepared.bindings),
      steps: manifest.steps,
      resources: manifest.resources,
      tools,
      mode: input.approval_mode,
    };
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return fail(skillError(error));
  }
}
