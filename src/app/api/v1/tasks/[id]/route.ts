import { NextRequest } from "next/server";
import { z } from "zod";
import { apiCall, apiFailure, apiJson, boundedJson, writeIdentity } from "@/lib/api/public-api";
import { updateTaskBody } from "@/lib/domain/public-api";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.uuid().parse((await params).id);
    const body = { id, ...updateTaskBody.parse(await boundedJson(request)) };
    const result = await apiCall(
      request,
      "tasks.update",
      body,
      writeIdentity(request, "tasks.update", body),
    );
    return apiJson({ data: result.data });
  } catch (error) {
    return apiFailure(error);
  }
}
