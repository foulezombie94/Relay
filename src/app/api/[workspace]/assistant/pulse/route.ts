import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, fail } from "@/lib/api/context";
import { readAssistantPulse } from "@/lib/api/assistant-pulse";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const workspace = z.uuid().parse((await params).workspace);
    const { client, user } = await context(workspace);
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(10000)]);
    const data = await readAssistantPulse(client, workspace, user.id, signal);
    // Membership may have changed while the counts and bounded signals were computed.
    await context(workspace);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return fail(error);
  }
}
