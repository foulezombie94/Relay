import { NextRequest } from "next/server";
import { oauthGet, oauthPost } from "@/lib/mcp/oauth";
export const runtime = "nodejs";
type P = { params: Promise<{ operation: string }> };
export async function GET(req: NextRequest, { params }: P) {
  return oauthGet(req, (await params).operation);
}
export async function POST(req: NextRequest, { params }: P) {
  return oauthPost(req, (await params).operation);
}
