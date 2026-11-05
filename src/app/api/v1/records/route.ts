import { NextRequest } from "next/server";
import {
  apiCall,
  apiFailure,
  apiJson,
  boundedJson,
  decodeCursor,
  page,
  writeIdentity,
} from "@/lib/api/public-api";
import { createRecordBody, recordListQuery } from "@/lib/domain/public-api";

export async function GET(request: NextRequest) {
  try {
    const query = recordListQuery.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { cursor, archived, ...filters } = query;
    const result = await apiCall(request, "records.list", {
      ...filters,
      ...(archived ? { archived: archived === "true" } : {}),
      ...decodeCursor(cursor ?? null),
    });
    return apiJson(page(result));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = createRecordBody.parse(await boundedJson(request));
    const result = await apiCall(
      request,
      "records.create",
      body,
      writeIdentity(request, "records.create", body),
    );
    return apiJson({ data: result.data }, result.replayed ? 200 : 201);
  } catch (error) {
    return apiFailure(error);
  }
}
