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
/** Canonical origin plus browser MCP clients explicitly allowed by MCP_ALLOWED_ORIGINS. */
export function mcpAllowedOrigins() {
  const extra = (process.env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i.test(value));
  return [mcpOrigin(), ...extra];
}
export const flowCookie = "zyliad_mcp_flow";
