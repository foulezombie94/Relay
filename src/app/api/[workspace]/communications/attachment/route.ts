import { NextRequest } from "next/server";
import { z } from "zod";
import { context, ApiError, databaseError, fail } from "@/lib/api/context";
import { connection, externalJson } from "@/lib/integrations/oauth";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspace: string }> },
) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const id = z.uuid().parse(req.nextUrl.searchParams.get("id")),
      attachment = z.string().min(1).max(1000).parse(req.nextUrl.searchParams.get("attachment"));
    const r = await client
      .from("communications")
      .select("provider_id,integration_id,attachments")
      .eq("workspace_id", workspace)
      .eq("id", id)
      .eq("kind", "email")
      .maybeSingle();
    databaseError(r.error);
    if (!r.data) throw new ApiError("Email inaccessible.", 403);
    const meta = z
      .array(
        z.object({
          provider_id: z.string(),
          name: z.string().max(250),
          size: z.number().nonnegative(),
          mime: z.string(),
        }),
      )
      .max(20)
      .parse(r.data.attachments)
      .find((a) => a.provider_id === attachment);
    if (!meta || meta.size > 20971520)
      throw new ApiError("Pièce jointe indisponible ou trop volumineuse.", 404);
    const i = await client
      .from("integrations")
      .select("provider")
      .eq("workspace_id", workspace)
      .eq("id", r.data.integration_id)
      .eq("status", "connected")
      .maybeSingle();
    databaseError(i.error);
    if (!i.data) throw new ApiError("Compte inaccessible.", 403);
    const p = z.enum(["gmail", "outlook"]).parse(i.data.provider);
    const { tokens } = await connection(client, workspace, p);
    let data: Uint8Array;
    if (p === "gmail") {
      const result = await externalJson(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(r.data.provider_id)}/attachments/${encodeURIComponent(attachment)}`,
        tokens.access_token,
        {},
        28000000,
      );
      const encoded = z.string().max(28000000).parse(result.data);
      data = Buffer.from(encoded, "base64url");
    } else {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(r.data.provider_id)}/attachments/${encodeURIComponent(attachment)}/$value`,
        {
          headers: {
            Authorization: "Bearer " + tokens.access_token,
            Prefer: 'IdType="ImmutableId"',
          },
          redirect: "error",
          signal: AbortSignal.timeout(20000),
        },
      );
      if (!response.ok || !response.body)
        throw new ApiError("Téléchargement fournisseur indisponible.", 502);
      const reader = response.body.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 20971520) throw new ApiError("Pièce jointe supérieure à 20 Mo.", 413);
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      data = Buffer.concat(chunks);
    }
    if (data.byteLength > 20971520) throw new ApiError("Pièce jointe supérieure à 20 Mo.", 413);
    return new Response(data as BodyInit, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(meta.name),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
