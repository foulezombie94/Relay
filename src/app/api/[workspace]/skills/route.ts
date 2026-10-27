import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, fail, ApiError } from "@/lib/api/context";
import { workflowBody } from "@/lib/api/workflow-body";
import { skillRPC, skillDetail, skillError } from "@/lib/api/agent-skills";
import { parseSkillManifest, importSkill } from "@/lib/domain/agent-skills";
import { skillTemplate, skillTemplateDefinitions } from "@/lib/domain/skill-templates";

type Params = { params: Promise<{ workspace: string }> };
const id = z.uuid();
const revision = z.number().int().positive();
const visibility = z.enum(["private", "workspace"]);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), id, manifest: z.unknown(), visibility }).strict(),
  z.object({ action: z.literal("import"), id, content: z.string().max(256000) }).strict(),
  z.object({ action: z.literal("install"), id, key: z.string().max(80) }).strict(),
  z.object({ action: z.literal("save"), id, revision, manifest: z.unknown(), visibility }).strict(),
  z.object({ action: z.enum(["publish", "archive"]), id, revision }).strict(),
  z.object({ action: z.literal("restore"), id, revision, version_id: id }).strict(),
  z.object({ action: z.literal("preference"), id, enabled: z.boolean().optional(), auto_select: z.boolean().optional(), favorite: z.boolean().optional(), version_id: id.optional(), granted_tools: z.array(z.string().max(80)).max(40).optional() }).strict(),
  z.object({ action: z.literal("grant"), id, user_id: id, permission: z.enum(["use", "edit", "publish"]).nullable() }).strict(),
  z.object({ action: z.literal("cancel_run"), id, run_id: id }).strict(),
]);
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    if (req.nextUrl.searchParams.get("templates") === "1") return NextResponse.json({ data: skillTemplateDefinitions.map((definition) => ({ key: definition.key, manifest: skillTemplate(definition.key) })) }, { headers: { "Cache-Control": "private, no-store" } });
    const selected = req.nextUrl.searchParams.get("id");
    const result = selected ? { data: await skillDetail(client, workspace, id.parse(selected)) } : await skillRPC(client, workspace, "list", { q: z.string().max(200).parse(req.nextUrl.searchParams.get("q") ?? ""), ...(req.nextUrl.searchParams.get("after") ? { after: id.parse(req.nextUrl.searchParams.get("after")) } : {}) });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(skillError(error)); }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const input = inputSchema.parse(JSON.parse(await workflowBody(req, 280000)));
    const { client } = await context(workspace, !["preference", "cancel_run"].includes(input.action));
    let operation: string = input.action;
    let payload: Record<string, unknown> = { ...input };
    delete payload.action;
    if (input.action === "import") { operation = "create"; payload = { id: input.id, visibility: "private", manifest: importSkill(input.content) }; }
    if (input.action === "install") {
      const template = skillTemplate(input.key);
      if (!template) throw new ApiError("Modèle de méthode introuvable.", 404);
      payload = { id: input.id, manifest: template, visibility: "private" };
    }
    if (input.action === "create" || input.action === "save") payload.manifest = parseSkillManifest(input.manifest);
    const data = await skillRPC(client, workspace, operation, payload);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(skillError(error)); }
}
