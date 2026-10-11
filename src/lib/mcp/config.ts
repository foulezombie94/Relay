import "server-only";
import { ApiError } from "@/lib/api/context";
export function mcpOrigin() {
  const origin = new URL(process.env.APP_URL ?? "");
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/" ||
    (origin.protocol !== "https:" &&
      !(
        process.env.NEXT_PUBLIC_RELAY_ENVIRONMENT !== "production" &&
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      ))
  )
    throw new ApiError("Configuration MCP indisponible.", 503);
  return origin.origin;
}
export function mcpResource() {
  return mcpOrigin() + "/api/mcp";
}
export const flowCookie = "zyliad_mcp_flow";
