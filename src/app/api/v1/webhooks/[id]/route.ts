import { NextRequest } from "next/server";
import { z } from "zod";
import { apiCall, apiFailure, apiJson, writeIdentity } from "@/lib/api/public-api";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = { id: z.uuid().parse((await params).id) };
    const result = await apiCall(
      request,
      "webhooks.delete",
      body,
      writeIdentity(request, "webhooks.delete", body),
    );
    return apiJson({ data: result.data });
  } catch (error) {
    return apiFailure(error);
  }
}
