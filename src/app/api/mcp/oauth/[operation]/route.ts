import { NextRequest } from "next/server";
import { oauthGet, oauthPost } from "@/lib/mcp/oauth";
import { corsHeaders, handleMcpPreflight } from "@/lib/mcp/server";
export const runtime = "nodejs";
type P = { params: Promise<{ operation: string }> };
export async function GET(req: NextRequest, { params }: P) {
  return oauthGet(req, (await params).operation);
}
export async function POST(req: NextRequest, { params }: P) {
  const operation = (await params).operation;
  const response = await oauthPost(req, operation);
  // Browser MCP clients on the allowlist read token/registration responses (never consent).
  if (operation !== "consent")
    for (const [key, value] of Object.entries(corsHeaders(req))) response.headers.set(key, value);
  return response;
}
export const OPTIONS = handleMcpPreflight;
