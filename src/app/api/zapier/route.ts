import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fail, ApiError } from "@/lib/api/context";
import {
  zapierRequest,
  zapierResource,
  zapierRecord,
  zapierTask,
} from "@/lib/integrations/zapier";
const headers = { "Cache-Control": "no-store" };
function failure(e: unknown) {
  const r = fail(e);
  r.headers.set("Cache-Control", "no-store");
  if (r.status === 429) r.headers.set("Retry-After", "60");
  return r;
}
async function boundedJson(req: NextRequest) {
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError("Content-Type application/json requis.", 415);
  if (Number(req.headers.get("content-length") || 0) > 20000)
    throw new ApiError("Payload trop volumineux.", 413);
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("JSON manquant.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 20000) {
        await reader.cancel();
        throw new ApiError("Payload trop volumineux.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError("JSON invalide.");
  }
}
export async function GET(req: NextRequest) {
  try {
    const resource = zapierResource.parse(
      req.nextUrl.searchParams.get("resource") || "people",
    );
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(100000)
      .parse(req.nextUrl.searchParams.get("page") || 0);
    return NextResponse.json(
      await zapierRequest(req, "list", resource, {}, page),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    const payload = z
      .object({ resource: zapierResource, values: z.unknown() })
      .strict()
      .parse(await boundedJson(req));
    const values = (
      payload.resource === "tasks" ? zapierTask : zapierRecord
    ).parse(payload.values);
    const id = z
      .string()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._:-]+$/)
      .parse(req.headers.get("idempotency-key"));
    return NextResponse.json(
      {
        data: await zapierRequest(
          req,
          "create",
          payload.resource,
          values,
          0,
          id,
        ),
      },
      { status: 201, headers },
    );
  } catch (e) {
    return failure(e);
  }
}
