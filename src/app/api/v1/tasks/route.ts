import { NextRequest } from "next/server";
import { z } from "zod";
import {
  apiCall,
  apiFailure,
  apiJson,
  boundedJson,
  decodeCursor,
  page,
  writeIdentity,
} from "@/lib/api/public-api";
import { createTaskBody, listQuery } from "@/lib/domain/public-api";

const query = listQuery.extend({
  record_id: z.uuid().optional(),
  status: z.enum(["open", "in_progress", "done", "cancelled"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const { cursor, ...filters } = query.parse(Object.fromEntries(request.nextUrl.searchParams));
    return apiJson(
      page(await apiCall(request, "tasks.list", { ...filters, ...decodeCursor(cursor ?? null) })),
    );
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = createTaskBody.parse(await boundedJson(request));
    const result = await apiCall(
      request,
      "tasks.create",
      body,
      writeIdentity(request, "tasks.create", body),
    );
    return apiJson({ data: result.data }, result.replayed ? 200 : 201);
  } catch (error) {
    return apiFailure(error);
  }
}
