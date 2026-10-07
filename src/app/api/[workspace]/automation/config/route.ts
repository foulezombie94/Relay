import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin, databaseError, ApiError, fail } from "@/lib/api/context";
import { workflowBody } from "@/lib/api/workflow-body";
import { seal } from "@/lib/integrations/crypto";
import { workflowURL } from "@/lib/integrations/workflow-http";
type Params = { params: Promise<{ workspace: string }> };
const json = (data: unknown) =>
  NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const { data, error } = await client.rpc("workflow_config", {
      w: workspace,
      operation: "list",
    });
    databaseError(error);
    return json({ data });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client, role } = await context(workspace, true);
    const input = z
      .discriminatedUnion("action", [
        z
          .object({
            action: z.literal("destination"),
            name: z.string().trim().min(1).max(100),
            kind: z.enum(["slack", "webhook"]),
            url: z.url().max(3000),
            secret: z
              .string()
              .max(1000)
              .regex(/^[^\r\n]*$/)
              .optional(),
          })
          .strict(),
        z.object({ action: z.literal("toggle"), id: z.uuid(), enabled: z.boolean() }).strict(),
        z.object({ action: z.literal("hook"), workflow_id: z.uuid() }).strict(),
      ])
      .parse(JSON.parse(await workflowBody(req)));
    if (input.action !== "hook" && !["owner", "admin"].includes(role))
      throw new ApiError("Seul un administrateur peut gérer ces connexions.", 403);
    let payload: Record<string, unknown>;
    let secret: string | undefined;
    if (input.action === "destination") {
      workflowURL(input.url, input.kind === "slack");
      payload = {
        name: input.name,
        kind: input.kind,
        encrypted: seal({ url: input.url, secret: input.secret }),
      };
    } else if (input.action === "hook") {
      secret = randomBytes(32).toString("base64url");
      payload = { workflow_id: input.workflow_id, encrypted: seal({ secret }) };
    } else payload = { id: input.id, enabled: input.enabled };
    const { data, error } = await client.rpc("workflow_config", {
      w: workspace,
      operation: input.action,
      payload,
    });
    databaseError(error);
    return json({
      data,
      ...(secret
        ? {
            secret,
            endpoint: new URL(
              `/api/workflow-hooks/${input.action === "hook" ? input.workflow_id : ""}`,
              process.env.APP_URL || req.nextUrl.origin,
            ).href,
          }
        : {}),
    });
  } catch (error) {
    return fail(error);
  }
}
