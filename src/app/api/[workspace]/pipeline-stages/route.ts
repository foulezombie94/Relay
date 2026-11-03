import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ApiError,
  checkOrigin,
  context,
  databaseError,
  fail,
  jsonBody,
  requireAdmin,
} from "@/lib/api/context";
import { defaultOpenStages, pipelineInputSchema } from "@/lib/domain/pipelines";

type Params = { params: Promise<{ workspace: string }> };

const bodySchema = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  pipeline: z.unknown(),
  moves: z.record(z.string().max(80), z.string().max(80)).default({}),
});

/** Saves a pipeline's stages and moves deals out of removed stages atomically. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    requireAdmin(role);
    const body = bodySchema.parse(await jsonBody(request));
    const parsed = pipelineInputSchema.safeParse(body.pipeline);
    if (!parsed.success) throw new ApiError(parsed.error.issues.map((i) => i.message).join(" "));
    const { data, error } = await client.rpc("save_pipeline_stages", {
      w: workspace,
      pipeline: body.id,
      expected_version: body.version,
      label: parsed.data.name,
      open_stages: parsed.data.stages ?? defaultOpenStages,
      stage_labels: parsed.data.labels ?? {},
      stage_probabilities: parsed.data.probabilities,
      moves: body.moves,
    });
    databaseError(error);
    const result = z
      .object({ pipeline: z.object({ id: z.uuid() }).passthrough(), moved: z.number() })
      .safeParse(data);
    if (!result.success || result.data.pipeline.id !== body.id)
      throw new ApiError("Aucune modification confirmée.", 500);
    return NextResponse.json({ data: result.data.pipeline, moved: result.data.moved });
  } catch (error) {
    return fail(error);
  }
}
