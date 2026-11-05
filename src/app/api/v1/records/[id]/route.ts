import { NextRequest } from "next/server";
import { z } from "zod";
import { apiCall, apiFailure, apiJson, boundedJson, writeIdentity } from "@/lib/api/public-api";
import { updateRecordBody } from "@/lib/domain/public-api";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const id = z.uuid().parse((await params).id);
    return apiJson(await apiCall(request, "records.get", { id }));
  } catch (error) {
    return apiFailure(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const id = z.uuid().parse((await params).id);
    const body = { id, ...updateRecordBody.parse(await boundedJson(request)) };
    const result = await apiCall(
      request,
      "records.update",
      body,
      writeIdentity(request, "records.update", body),
    );
    return apiJson({ data: result.data });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const id = z.uuid().parse((await params).id);
    const body = { id };
    const result = await apiCall(
      request,
      "records.delete",
      body,
      writeIdentity(request, "records.delete", body),
    );
    return apiJson({ data: result.data });
  } catch (error) {
    return apiFailure(error);
  }
}
