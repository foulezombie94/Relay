import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { context, ApiError, databaseError } from "@/lib/api/context";
import { workflowBody, boundedJsonBody } from "@/lib/api/workflow-body";
import { mcpOrigin, mcpResource, flowCookie } from "./config";
import { hash, oauthDb } from "./database";
import {
  registrationSchema,
  authorizationSchema,
  tokenSchema,
  uniqueParams,
  opaque,
} from "./oauth-validation";
import { defaultScopes, scopes } from "./contracts";

const noStore = { "Cache-Control": "no-store", Pragma: "no-cache" };
export const randomSecret = () => randomBytes(32).toString("base64url");
export function oauthFailure(error: unknown) {
  const status = error instanceof ApiError ? error.status : 400;
  const code =
    error instanceof ApiError && error.code
      ? error.code
      : status >= 500
        ? "temporarily_unavailable"
        : "invalid_request";
  return NextResponse.json(
    {
      error: code,
      error_description:
        status >= 500
          ? "Please try again later."
          : "Authorization could not be completed. Start again from your MCP client.",
    },
    { status, headers: { ...noStore, ...(status === 429 ? { "Retry-After": "60" } : {}) } },
  );
}
function verifyOrigin(req: NextRequest, required = false) {
  const origin = req.headers.get("origin");
  if ((required && !origin) || (origin && origin !== mcpOrigin()))
    throw new ApiError("Origine non autorisée.", 403, "access_denied");
}
async function form(req: NextRequest) {
  if (req.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded")
    throw new ApiError("Form content type required.", 415);
  return uniqueParams(new URLSearchParams(await workflowBody(req, 12000)));
}
export function authorizationMetadata() {
  const o = mcpOrigin();
  return {
    issuer: o,
    authorization_endpoint: o + "/api/mcp/oauth/authorize",
    token_endpoint: o + "/api/mcp/oauth/token",
    registration_endpoint: o + "/api/mcp/oauth/register",
    revocation_endpoint: o + "/api/mcp/oauth/revoke",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: scopes,
    authorization_response_iss_parameter_supported: true,
  };
}
export function resourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [mcpOrigin()],
    scopes_supported: scopes,
    bearer_methods_supported: ["header"],
    resource_name: "Zyliad CRM",
    resource_documentation: mcpOrigin() + "/mcp",
  };
}
export async function oauthGet(req: NextRequest, operation: string) {
  try {
    if (operation !== "authorize") throw new ApiError("Not found.", 404);
    const params = new URLSearchParams(req.nextUrl.searchParams);
    if (!params.has("scope")) params.set("scope", defaultScopes);
    const body = authorizationSchema.parse(uniqueParams(params));
    if (body.resource !== mcpResource())
      throw new ApiError("Wrong resource.", 400, "invalid_target");
    const flow = randomSecret();
    await oauthDb("begin", { ...body, flow_hash: hash(flow) });
    const response = NextResponse.redirect(mcpOrigin() + "/mcp/authorize", 303);
    response.cookies.set(flowCookie, flow, {
      httpOnly: true,
      secure: process.env.NEXT_PUBLIC_RELAY_ENVIRONMENT === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    Object.entries(noStore).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  } catch (error) {
    return oauthFailure(error);
  }
}
export async function oauthPost(req: NextRequest, operation: string) {
  try {
    verifyOrigin(req, operation === "consent");
    if (operation === "register") {
      if (req.headers.get("content-type")?.split(";")[0] !== "application/json")
        throw new ApiError("JSON required.", 415);
      const body = registrationSchema.parse(await boundedJsonBody(req, 12000));
      const registered = await oauthDb("register", body);
      return NextResponse.json(
        {
          ...body,
          scope: body.scope?.join(" "),
          client_id: registered.client_id,
          client_id_issued_at: Math.floor(Date.now() / 1000),
        },
        { status: 201, headers: noStore },
      );
    }
    if (operation === "token") {
      const body = tokenSchema.parse(await form(req));
      if (body.resource !== mcpResource())
        throw new ApiError("Wrong resource.", 400, "invalid_target");
      const access = "zmc_a_" + randomSecret(),
        refresh = "zmc_r_" + randomSecret();
      const tokens = await oauthDb(
        body.grant_type === "authorization_code" ? "exchange" : "refresh",
        {
          client_id: body.client_id,
          resource: body.resource,
          access_hash: hash(access),
          new_refresh_hash: hash(refresh),
          ...(body.grant_type === "authorization_code"
            ? {
                code_hash: hash(body.code),
                redirect_uri: body.redirect_uri,
                challenge: createHash("sha256").update(body.code_verifier).digest("base64url"),
              }
            : {
                refresh_hash: hash(body.refresh_token),
                ...(body.scope ? { scope: body.scope } : {}),
              }),
        },
      );
      return NextResponse.json(
        {
          access_token: access,
          refresh_token: refresh,
          token_type: "Bearer",
          expires_in: tokens.expires_in,
          scope: tokens.scope,
        },
        { headers: noStore },
      );
    }
    if (operation === "revoke") {
      const body = z
        .object({
          client_id: z.uuid(),
          token: z.string().max(100),
          token_type_hint: z.enum(["access_token", "refresh_token"]).optional(),
        })
        .strict()
        .parse(await form(req));
      await oauthDb("revoke", { client_id: body.client_id, token_hash: hash(body.token) });
      return NextResponse.json({}, { headers: noStore });
    }
    if (operation === "consent") {
      if (req.headers.get("content-type")?.split(";")[0] !== "application/json")
        throw new ApiError("JSON required.", 415);
      const body = z
        .object({
          workspace: z.uuid(),
          scopes: z.array(z.enum(scopes)).max(scopes.length),
          allow: z.boolean(),
        })
        .strict()
        .parse(await boundedJsonBody(req, 4000));
      const flow = opaque.parse(req.cookies.get(flowCookie)?.value);
      const { client } = await context(body.workspace);
      const code = randomSecret();
      const { data, error } = await client.rpc("mcp_consent", {
        flow_hash: hash(flow),
        w: body.workspace,
        approved_scopes: body.scopes,
        code_hash: hash(code),
        allow: body.allow,
      });
      databaseError(error);
      const destination = new URL(data.redirect_uri);
      destination.searchParams.set(
        body.allow ? "code" : "error",
        body.allow ? code : "access_denied",
      );
      destination.searchParams.set("state", data.state);
      destination.searchParams.set("iss", mcpOrigin());
      const response = NextResponse.json({ redirect: destination.href }, { headers: noStore });
      response.cookies.set(flowCookie, "", {
        httpOnly: true,
        secure: process.env.NEXT_PUBLIC_RELAY_ENVIRONMENT === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }
    throw new ApiError("Not found.", 404);
  } catch (error) {
    return oauthFailure(error);
  }
}
