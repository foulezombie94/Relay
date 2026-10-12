import { z } from "zod";
import { scopeSchema, defaultScopes } from "./contracts";
export const opaque = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const redirectUri = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      const u = new URL(value);
      const loopback = ["127.0.0.1", "[::1]", "localhost"].includes(u.hostname);
      return (
        !u.username &&
        !u.password &&
        !u.hash &&
        (u.protocol === "https:" || (u.protocol === "http:" && loopback && !!u.port))
      );
    } catch {
      return false;
    }
  }, "Redirect URI must use HTTPS or an explicit loopback port.");
export const registrationSchema = z
  .object({
    client_name: z.string().trim().min(1).max(100).default("MCP client"),
    redirect_uris: z.array(redirectUri).min(1).max(5),
    token_endpoint_auth_method: z.literal("none").default("none"),
    grant_types: z
      .array(z.enum(["authorization_code", "refresh_token"]))
      .min(1)
      .max(2)
      .default(["authorization_code", "refresh_token"]),
    response_types: z.array(z.literal("code")).length(1).default(["code"]),
    scope: scopeSchema.optional(),
    // Do not fetch client-supplied logos, documents or URLs (SSRF).
  })
  .strip();
export const authorizationSchema = z
  .object({
    client_id: z.uuid(),
    redirect_uri: redirectUri,
    response_type: z.literal("code"),
    code_challenge: opaque,
    code_challenge_method: z.literal("S256"),
    state: z.string().min(1).max(512),
    resource: z.string().url(),
    scope: scopeSchema.prefault(defaultScopes),
  })
  .strict();
export const tokenSchema = z.discriminatedUnion("grant_type", [
  z
    .object({
      grant_type: z.literal("authorization_code"),
      client_id: z.uuid(),
      code: opaque,
      redirect_uri: redirectUri,
      code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
      resource: z.string().url(),
    })
    .strict(),
  z
    .object({
      grant_type: z.literal("refresh_token"),
      client_id: z.uuid(),
      refresh_token: z.string().regex(/^zmc_r_[A-Za-z0-9_-]{43}$/),
      // Some native clients omit resource on refresh; the server binds it
      // to its sole canonical audience and checks the stored family again.
      resource: z.string().url().optional(),
      scope: scopeSchema.optional(),
    })
    .strict(),
]);
export function uniqueParams(params: URLSearchParams) {
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (key in result) throw new Error("Duplicate parameter");
    result[key] = value;
  }
  return result;
}
