import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, databaseError, fail } from "@/lib/api/context";
import { agentUsageSchema } from "@/lib/domain/agent-usage";
import { configuredAgentModel } from "@/lib/agent/identity";
import { agentApiKey } from "@/lib/agent/provider";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = z.uuid().parse((await params).workspace);
    const { client } = await context(workspace);
    // Existing RPC applies workspace membership and returns only the current user's runs.
    const result = await client
      .rpc("agent_runtime", { w: workspace, operation: "usage", payload: {} })
      .abortSignal(AbortSignal.any([req.signal, AbortSignal.timeout(10000)]));
    databaseError(result.error);
    const data = agentUsageSchema.parse(result.data);
    await context(workspace);
    return NextResponse.json(
      { data, configured: !!agentApiKey(), model: configuredAgentModel() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
