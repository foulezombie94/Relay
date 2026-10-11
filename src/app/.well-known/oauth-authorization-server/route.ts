import { NextResponse } from "next/server";
import { authorizationMetadata } from "@/lib/mcp/oauth";
export async function GET() {
  return NextResponse.json(authorizationMetadata(), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
