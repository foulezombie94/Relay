import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, context, databaseError, fail, jsonBody } from "@/lib/api/context";

type Params = { params: Promise<{ workspace: string }> };
const providers = ["gmail", "outlook", "google-calendar", "outlook-calendar"] as const;

/** The caller's own mail/calendar connections and their contact-capture choice. */
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const { data, error } = await client
      .from("integrations")
      .select("provider,email,status,capture_contacts")
      .eq("workspace_id", workspace)
      .eq("user_id", user.id)
      .in("provider", providers);
    databaseError(error);
    return NextResponse.json(
      { data: data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const body = z
      .object({ provider: z.enum(providers), enabled: z.boolean() })
      .strict()
      .parse(await jsonBody(request));
    const { data, error } = await client.rpc("set_contact_capture", {
      w: workspace,
      p: body.provider,
      enabled: body.enabled,
    });
    databaseError(error);
    return NextResponse.json(
      { enabled: data === true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
