import { NextRequest } from "next/server";
import { apiCall, apiFailure, apiJson } from "@/lib/api/public-api";

export async function GET(request: NextRequest) {
  try {
    return apiJson(await apiCall(request, "objects"));
  } catch (error) {
    return apiFailure(error);
  }
}
