import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { ApiError, checkOrigin, fail } from "@/lib/api/context";

const cookie = "relay_team_invite";
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/invitations",
  maxAge: 7 * 86400,
};
const json = (value: unknown) =>
  NextResponse.json(value, {
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
function token(req: NextRequest) {
  const value = req.cookies.get(cookie)?.value;
  if (!value || !/^[a-f0-9]{64}$/.test(value))
    throw new ApiError("Rouvrez votre lien d’invitation pour continuer.", 410);
  return value;
}
async function session() {
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new ApiError("Connectez-vous avec l’adresse invitée.", 401);
  return client;
}
function rpcError(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "42501")
    throw new ApiError(
      "Utilisez l’adresse email invitée et vérifiée. Vous pouvez changer de compte ou demander un nouveau lien.",
      403,
    );
  if (error.code === "22023")
    throw new ApiError(
      "Ce lien est expiré, annulé, remplacé ou déjà utilisé. Demandez un nouveau lien à l’administrateur.",
      410,
    );
  if (error.code === "55P03")
    throw new ApiError("Une modification est en cours. Réessayez dans quelques secondes.", 409);
  throw new ApiError("Impossible de traiter cette invitation. Réessayez.", 500);
}
export async function GET(req: NextRequest) {
  try {
    const secret = token(req);
    const client = await session();
    const { data, error } = await client.rpc("team_invitation_info", { secret });
    rpcError(error);
    return json(data);
  } catch (error) {
    return fail(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    checkOrigin(req);
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError("Requête invalide.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 2048) {
          await reader.cancel();
          throw new ApiError("Requête trop volumineuse.", 413);
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new ApiError("Requête invalide.");
    }
    const input = z
      .discriminatedUnion("action", [
        z.object({ action: z.literal("open"), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
        z.object({ action: z.literal("accept") }).strict(),
      ])
      .parse(value);
    if (input.action === "open") {
      // Keep the bearer secret out of login URLs, localStorage and browser-readable cookies.
      const response = json({ ok: true });
      response.cookies.set(cookie, input.token, options);
      return response;
    }
    const secret = token(req);
    const client = await session();
    const { data, error } = await client.rpc("team_invitation_accept", { secret });
    rpcError(error);
    const response = json({ workspace: data });
    response.cookies.set(cookie, "", { ...options, maxAge: 0 });
    return response;
  } catch (error) {
    return fail(error);
  }
}
