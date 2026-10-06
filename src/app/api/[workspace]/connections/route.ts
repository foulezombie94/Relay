import { NextRequest, NextResponse } from "next/server";
import { context, databaseError, fail } from "@/lib/api/context";
import {
  services,
  hasRequiredScopes,
  type Service,
} from "@/lib/integrations/services";
export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client, user } = await context(workspace);
    const { data: connections, error } = await client
      .from("integrations")
      .select("provider,status,email,last_sync,scopes")
      .eq("workspace_id", workspace)
      .eq("user_id", user.id);
    databaseError(error);
    const states = await Promise.all(
      (connections ?? []).map(async (row) => {
        const { data, error } = await client.rpc("connector_sync", {
          w: workspace,
          p: row.provider,
          operation: "status",
        });
        databaseError(error);
        return { provider: row.provider, ...data };
      }),
    );
    const data = Object.entries(services).map(([provider, s]) => {
      const row = connections?.find((c) => c.provider === provider);
      const missing = [
        !process.env.INTEGRATION_ENCRYPTION_KEY
          ? "INTEGRATION_ENCRYPTION_KEY"
          : "",
        s.family === "google"
          ? !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET
            ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
            : ""
          : !process.env.MICROSOFT_CLIENT_ID ||
              !process.env.MICROSOFT_CLIENT_SECRET
            ? "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET"
            : "",
      ].filter(Boolean);
      return {
        ...states.find((state) => state.provider === provider),
        worker_ready: !!process.env.JOBS_SECRET,
        provider,
        name: s.name,
        configured: missing.length === 0,
        missing,
        status:
          row?.status === "connected" &&
          !hasRequiredScopes(provider as Service, row.scopes)
            ? "error"
            : (row?.status ?? "disconnected"),
        email: row?.email,
        last_sync: row?.last_sync,
        description: s.description,
        scopes: s.scopes,
      };
    });
    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
