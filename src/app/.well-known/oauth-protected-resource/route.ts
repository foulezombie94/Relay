import { NextResponse } from "next/server";
import { resourceMetadata } from "@/lib/mcp/oauth";
export async function GET() {
  return NextResponse.json(resourceMetadata(), {
    headers: { "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" },
  });
}
