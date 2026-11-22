import { handleMcp, handleMcpPreflight } from "@/lib/mcp/server";
export const runtime = "nodejs";
export const maxDuration = 30;
export const POST = handleMcp;
export const GET = handleMcp;
export const DELETE = handleMcp;
export const OPTIONS = handleMcpPreflight;
