import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, checkOrigin } from "@/lib/api/context";
import { integrationIds } from "@/lib/integrations/platform/contracts";
import { beginOAuth } from "@/lib/integrations/platform/oauth-state";
import { familyFor, providerFor, scopesFor } from "@/lib/integrations/platform/registry";
import {
  integrationFailure,
  integrationServices,
  integrationBody,
} from "@/lib/integrations/platform/api";
import { userActor } from "@/lib/integrations/platform/runtime";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    checkOrigin(request);
    const { workspace } = await params,
      { user } = await context(workspace, true);
    const input = z
      .object({
        integration: z.enum(integrationIds),
        write: z.boolean().default(false),
        returnPath: z.enum(["/app/integrations", "/app/settings"]).default("/app/integrations"),
      })
      .strict()
      .parse(await integrationBody(request));
    const { store } = integrationServices(),
      provider = providerFor(familyFor[input.integration]);
    const result = await beginOAuth(
      store,
      userActor(workspace, user.id),
      provider,
      [input.integration],
      scopesFor(input.integration, input.write),
      input.returnPath,
    );
    const response = NextResponse.json(
      { url: result.url },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(result.cookieName, result.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/api/integration-oauth/${provider.provider}/${workspace}/callback`,
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return integrationFailure(error);
  }
}
