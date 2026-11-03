import { NextRequest, NextResponse } from "next/server";
import { openApiDocument } from "@/lib/api/openapi";

/** Public, cacheable API description. Contains no workspace data. */
export function GET(request: NextRequest) {
  const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
  return NextResponse.json(openApiDocument(origin), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
