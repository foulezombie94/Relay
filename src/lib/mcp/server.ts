import "server-only";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/context";
import { logEvent } from "@/lib/observability/logger";
import {
  tools,
  type ToolName,
  parseTool,
  requiredToolScopes,
  availableToolNames,
} from "./contracts";
import { bearer, mcpDb } from "./database";
import { mcpOrigin } from "./config";
import { instructions, serverVersion, localizedSchema, promptDefinitions } from "./guidance";
export { instructions } from "./guidance";

const sessionSchema = z.object({
  connection_id: z.uuid(),
  workspace_id: z.uuid(),
  scopes: z.array(z.string()),
  expires_at: z.string(),
});
type Session = z.infer<typeof sessionSchema>;
const maxResponseBytes = 262144;
const coverageTranslations: Record<string, string> = {
  "Imported items only; synchronization is not a complete mailbox mirror.":
    "Éléments importés uniquement ; la synchronisation n’est pas une copie complète de la boîte mail.",
  "Imported available transcripts only; not a complete provider archive.":
    "Transcriptions importées disponibles uniquement ; ce n’est pas une archive complète du fournisseur.",
  "Indexed extracted text only; extraction status is reported.":
    "Texte extrait et indexé uniquement ; vérifier le statut d’extraction.",
  "All currently authorized matching rows; page and content limits reported.":
    "Résultats correspondants actuellement autorisés ; limites de page et de contenu indiquées.",
  "Imported authorized items only; not a complete provider archive.":
    "Éléments importés autorisés uniquement ; ce n’est pas une archive complète du fournisseur.",
  "Exact aggregation of authorized matching rows.":
    "Agrégation exacte des résultats correspondants autorisés.",
};
const statusLabels: Record<string, string> = {
  pending: "En attente de confirmation dans Zyliad ; aucune modification exécutée.",
  executed: "Modification exécutée et confirmée par Zyliad.",
  rejected: "Proposition refusée ; aucune modification exécutée par cette proposition.",
  expired: "Proposition expirée ; préparer une nouvelle proposition avant toute confirmation.",
};

// Defense in depth for secrets a user might have pasted into CRM text. Provider
// vaults and OAuth tables are never queried by the tools in the first place.
export function sanitizeResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeResult);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /^(?:access_token|refresh_token|api_key|bot_token|client_secret|authorization|password|key_hash|token_hash)$/i.test(
          k,
        )
          ? "[REDACTED]"
          : k === "coverage" && typeof v === "string" && coverageTranslations[v]
            ? coverageTranslations[v]
            : sanitizeResult(v),
      ]),
    );
  if (typeof value === "string")
    return value
      .replace(
        /(?:zmc_[ar]_|(?:sk|rk)_(?:live|test)_|xox[baprs]-)[A-Za-z0-9_-]{12,}/g,
        "[REDACTED]",
      )
      .replace(/Bearer\s+[A-Za-z0-9._~-]{20,}/gi, "Bearer [REDACTED]");
  return value;
}
export function output(value: unknown) {
  const data = sanitizeResult(value);
  const status = data && typeof data === "object" && "status" in data ? String(data.status) : "";
  const result = {
    trust: "untrusted_external_data" as const,
    language: "fr" as const,
    message:
      statusLabels[status] ??
      "Données autorisées récupérées. Vérifiez les limites et la couverture indiquées.",
    data,
  };
  const text = JSON.stringify(result);
  if (Buffer.byteLength(text, "utf8") > maxResponseBytes)
    throw new ApiError(
      "Ce résultat est trop volumineux. Sélectionnez moins de champs, réduisez la page ou précisez les filtres.",
      413,
      "response_too_large",
    );
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: result,
  };
}
export async function executeTool(
  tokenHash: string,
  session: Session,
  name: ToolName,
  raw: unknown,
) {
  const tool = tools[name];
  const input = parseTool(name, raw) as Record<string, unknown>;
  if (!requiredToolScopes(name, input).every((scope) => session.scopes.includes(scope)))
    throw new ApiError(
      "Permission MCP manquante pour cet outil ou une section demandée. Vérifiez zyliad_connection et demandez une nouvelle autorisation si nécessaire.",
      403,
      "insufficient_scope",
    );
  if (name === "zyliad_connection") {
    const result = await mcpDb(tokenHash, "connection");
    const effectiveScopes =
      result.user?.role === "viewer"
        ? result.scopes.filter((scope: string) => scope !== "crm:write")
        : result.scopes;
    return {
      ...result,
      scopes: effectiveScopes,
      granted_scopes: result.scopes,
      server_version: serverVersion,
      language: "fr",
      tools: availableToolNames(effectiveScopes),
      limits: {
        max_page_size: 20,
        max_context_items_per_section: 5,
        request_bytes: 65536,
        response_bytes: maxResponseBytes,
        verifications_per_connection_per_minute: 120,
        verifications_per_workspace_per_minute: 600,
      },
      confirmation_url: mcpOrigin() + "/app/settings#developpeurs",
    };
  }
  if ("operation" in tool) return mcpDb(tokenHash, tool.operation, input);
  if ("kind" in tool) return mcpDb(tokenHash, "search", { kind: tool.kind, filters: input });
  if ("action" in tool) {
    const result = await mcpDb(tokenHash, "prepare", {
      action: tool.action,
      values: input.values,
      request_id: input.request_id,
    });
    return { ...result, confirmation_url: mcpOrigin() + "/app/settings#developpeurs" };
  }
  if (name === "zyliad_read_source") return mcpDb(tokenHash, "source", input);
  if (name === "zyliad_aggregate") {
    const { kind, group_by, ...filters } = input;
    return mcpDb(tokenHash, "aggregate", { kind, group_by, filters });
  }
  if (name === "zyliad_command_status") return mcpDb(tokenHash, "status", input);
  return mcpDb(tokenHash, "workspace");
}
export function toolError(error: unknown, requestId: string) {
  const status = error instanceof ApiError ? error.status : error instanceof ZodError ? 400 : 503;
  return {
    error:
      error instanceof ApiError
        ? (error.code ?? (status === 403 ? "forbidden" : "request_failed"))
        : status === 400
          ? "validation_error"
          : "temporarily_unavailable",
    message:
      error instanceof ApiError
        ? error.message
        : status === 400
          ? "Les paramètres ne respectent pas le schéma de l’outil. Corrigez-les avant de réessayer."
          : "Le service MCP est temporairement indisponible. Réessayez après quelques secondes.",
    language: "fr",
    status,
    retryable: status === 429 || status === 503,
    ...(status === 429
      ? { retry_after_seconds: 60 }
      : status === 503
        ? { retry_after_seconds: 5 }
        : {}),
    request_id: requestId,
  };
}
export function buildServer(tokenHash: string, session: Session, requestId = randomUUID()) {
  const server = new McpServer({ name: "zyliad", version: serverVersion }, { instructions });
  const available = new Set(availableToolNames(session.scopes));
  for (const [name, tool] of Object.entries(tools)) {
    if (!available.has(name as ToolName)) continue;
    server.registerTool(
      name,
      {
        description: tool.description,
        inputSchema: localizedSchema(tool.schema) as z.ZodType<Record<string, unknown>>,
        outputSchema: z.object({
          trust: z.literal("untrusted_external_data"),
          language: z.literal("fr"),
          message: z.string(),
          data: z.unknown(),
        }),
        annotations: {
          readOnlyHint: tool.scope !== "crm:write" || name === "zyliad_command_status",
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (input: unknown) => {
        const started = performance.now();
        let outcome = "success";
        try {
          return output(await executeTool(tokenHash, session, name as ToolName, input));
        } catch (error) {
          const failure = toolError(error, requestId);
          outcome = failure.error;
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(failure),
              },
            ],
          };
        } finally {
          await logEvent(outcome === "success" ? "info" : "warn", "mcp_tool_result", {
            provider: "zyliad-mcp",
            workspace_id: session.workspace_id,
            connection_id: session.connection_id,
            action: name,
            code: outcome,
            duration_ms: Math.round(performance.now() - started),
            request_id: requestId,
          });
        }
      },
    );
  }
  server.registerResource(
    "usage",
    "zyliad://usage",
    {
      mimeType: "text/plain",
      description:
        "Guide français des permissions Zyliad, des confirmations et des sources non fiables.",
    },
    async (uri) => ({ contents: [{ uri: uri.href, text: instructions, mimeType: "text/plain" }] }),
  );
  for (const [name, prompt] of Object.entries(promptDefinitions))
    server.registerPrompt(
      name,
      { description: prompt.description, argsSchema: localizedSchema(prompt.schema) },
      async (input) => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: prompt.text(input as Record<string, string>),
            },
          },
        ],
      }),
    );
  return server;
}
export async function handleMcp(request: Request) {
  const requestId = randomUUID();
  try {
    const o = new URL(mcpOrigin());
    const origin = request.headers.get("origin");
    // Next.js may canonicalize request.url to its internal listening hostname.
    // Validate the actual HTTP Host against the configured public origin.
    const host = request.headers.get("host") ?? new URL(request.url).host;
    if (host !== o.host || (origin && origin !== o.origin))
      throw new ApiError(
        "Cette origine n’est pas autorisée à utiliser le MCP Zyliad.",
        403,
        "forbidden_origin",
      );
    const tokenHash = bearer(request);
    const verified = sessionSchema.safeParse(await mcpDb(tokenHash, "session"));
    if (!verified.success)
      throw new ApiError(
        "La connexion MCP est temporairement indisponible.",
        503,
        "temporarily_unavailable",
      );
    const session = verified.data;
    // v2's per-request handler explicitly serves 2026-07-28, with stateless
    // compatibility for the dated versions negotiated by Claude Code/Codex.
    const handler = createMcpHandler(() => buildServer(tokenHash, session, requestId), {
      responseMode: "json",
      maxRequestBodySize: 65536,
      maxSubscriptions: 0,
    });
    try {
      const response = await handler.fetch(request);
      const bytes = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Request-ID", requestId);
      return new Response(bytes, { status: response.status, headers });
    } finally {
      await handler.close();
    }
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 503;
    return Response.json(
      {
        ...toolError(error, requestId),
        error:
          status === 401
            ? "unauthorized"
            : status === 429
              ? "rate_limited"
              : toolError(error, requestId).error,
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          "X-Request-ID": requestId,
          ...(status === 401
            ? {
                "WWW-Authenticate": `Bearer resource_metadata="${mcpOrigin()}/.well-known/oauth-protected-resource/api/mcp"`,
              }
            : {}),
          ...(status === 429
            ? { "Retry-After": "60" }
            : status === 503
              ? { "Retry-After": "5" }
              : {}),
        },
      },
    );
  }
}
