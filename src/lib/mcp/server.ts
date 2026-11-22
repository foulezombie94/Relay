import "server-only";
import {
  McpServer,
  ResourceTemplate,
  createMcpHandler,
  completable,
  inputRequired,
  CLIENT_CAPABILITIES_META_KEY,
} from "@modelcontextprotocol/server";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/context";
import { logEvent } from "@/lib/observability/logger";
import {
  tools,
  toolTitles,
  fetchKinds,
  type ToolName,
  parseTool,
  requiredToolScopes,
  availableToolNames,
} from "./contracts";
import { bearer, mcpDb } from "./database";
import { mcpOrigin, mcpResource, mcpAllowedOrigins } from "./config";
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
    return { ...result, confirmation_url: confirmationUrl(result?.id) };
  }
  if (name === "search") return searchAll(tokenHash, session, String(input.query));
  if (name === "fetch") return fetchItem(tokenHash, session, String(input.id));
  if (name === "zyliad_read_source") return mcpDb(tokenHash, "source", input);
  if (name === "zyliad_aggregate") {
    const { kind, group_by, ...filters } = input;
    return mcpDb(tokenHash, "aggregate", { kind, group_by, filters });
  }
  if (name === "zyliad_command_status") return mcpDb(tokenHash, "status", input);
  return mcpDb(tokenHash, "workspace");
}
/** Direct link to one proposal on the confirmation page (no CRM value in the URL). */
export function confirmationUrl(commandId?: unknown) {
  const base = mcpOrigin() + "/app/settings";
  return typeof commandId === "string" && /^[0-9a-f-]{36}$/.test(commandId)
    ? `${base}?mcp_command=${commandId}#developpeurs`
    : base + "#developpeurs";
}
type SearchItem = { id: string; title: string; url: string };
const itemTitle = (row: Record<string, unknown>, fallback: string) =>
  String(row.display_name ?? row.title ?? row.subject ?? row.label ?? row.name ?? fallback).slice(
    0,
    200,
  );
function itemUrl(kind: keyof typeof fetchKinds, id: string, title: string, workspace: string) {
  const o = mcpOrigin();
  const w = encodeURIComponent(workspace);
  if (kind === "document") return `${o}/api/${w}/files?id=${id}`;
  if (kind === "record") return `${o}/app/search?q=${encodeURIComponent(title)}&workspace=${w}`;
  const page = { note: "notes", meeting: "meetings", email: "communications", task: "tasks" }[kind];
  return `${o}/app/${page}?focus=${id}&workspace=${w}`;
}
/** Standard search tool: records plus every other source kind the connection may read. */
async function searchAll(tokenHash: string, session: Session, query: string) {
  const kinds = (Object.keys(fetchKinds) as (keyof typeof fetchKinds)[]).filter((kind) =>
    session.scopes.includes(fetchKinds[kind]),
  );
  const results: SearchItem[] = [];
  for (const kind of kinds) {
    const page = await mcpDb(tokenHash, "search", {
      kind,
      filters: { query, limit: kind === "record" ? 10 : 5 },
    });
    for (const row of (page?.data ?? []) as Record<string, unknown>[]) {
      if (typeof row.id !== "string") continue;
      const title = itemTitle(row, kind);
      results.push({
        id: `${kind}:${row.id}`,
        title,
        url: itemUrl(kind, row.id, title, session.workspace_id),
      });
    }
  }
  return { results };
}
/** Standard fetch tool: the authorized content of one search result. */
async function fetchItem(tokenHash: string, session: Session, value: string) {
  const [kind, id] = value.split(":") as [keyof typeof fetchKinds, string];
  const data =
    kind === "record"
      ? (await mcpDb(tokenHash, "record", { record_id: id }))?.record
      : ((await mcpDb(tokenHash, "source", { kind, id }))?.data?.[0] ?? null);
  if (!data) throw new ApiError("Ce résultat est introuvable ou inaccessible.", 404, "not_found");
  const title = itemTitle(data, kind);
  return {
    id: value,
    title,
    text: JSON.stringify(sanitizeResult(data)),
    url: itemUrl(kind, id, title, session.workspace_id),
    metadata: { kind, trust: "untrusted_external_data" },
  };
}
function plainOutput(value: unknown) {
  const text = JSON.stringify(sanitizeResult(value));
  if (Buffer.byteLength(text, "utf8") > maxResponseBytes)
    throw new ApiError(
      "Ce résultat est trop volumineux. Précisez la recherche.",
      413,
      "response_too_large",
    );
  return { content: [{ type: "text" as const, text }] };
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
const readOnly = (name: ToolName) => !("action" in tools[name]);
/** True when the client declared URL-mode elicitation on this 2026-era request. */
function supportsUrlElicitation(envelope: unknown) {
  const caps = (envelope as Record<string, unknown> | undefined)?.[CLIENT_CAPABILITIES_META_KEY] as
    { elicitation?: { url?: unknown } } | undefined;
  return !!caps?.elicitation?.url;
}
export function buildServer(tokenHash: string, session: Session, requestId = randomUUID()) {
  const origin = mcpOrigin();
  const server = new McpServer(
    {
      name: "zyliad",
      title: "Zyliad CRM",
      version: serverVersion,
      websiteUrl: origin + "/mcp",
      icons: [{ src: origin + "/icon.svg", mimeType: "image/svg+xml", sizes: ["any"] }],
    },
    { instructions },
  );
  const available = new Set(availableToolNames(session.scopes));
  // Every tool is listed so a client can request a missing scope (step-up). A call
  // without the scopes it needs gets HTTP 403 insufficient_scope with the full set
  // to request; the tool itself re-checks the scopes before any data access.
  for (const name of Object.keys(tools) as ToolName[]) {
    const tool = tools[name];
    server.registerTool(
      name,
      {
        title: toolTitles[name],
        description:
          tool.description +
          (available.has(name)
            ? ""
            : " Nécessite une permission supplémentaire, demandée à l’appel."),
        inputSchema: localizedSchema(tool.schema as z.ZodObject) as z.ZodType<
          Record<string, unknown>
        >,
        ...(name === "search" || name === "fetch"
          ? {}
          : {
              outputSchema: z.object({
                trust: z.literal("untrusted_external_data"),
                language: z.literal("fr"),
                message: z.string(),
                data: z.unknown(),
              }),
            }),
        annotations: {
          title: toolTitles[name],
          // Write tools only create a proposal: nothing changes before the human
          // confirms it in Zyliad, and the same request_id never duplicates it.
          readOnlyHint: readOnly(name),
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        scopeChallenge: ({ request }) => {
          const args = (request.params as { arguments?: Record<string, unknown> } | undefined)
            ?.arguments;
          const missing = requiredToolScopes(name, args ?? {}).filter(
            (scope) => scope !== "invalid_scope" && !session.scopes.includes(scope),
          );
          if (!missing.length) return undefined;
          const all = [...new Set([...session.scopes, ...missing])] as [string, ...string[]];
          return { scopes: all, errorDescription: "Additional Zyliad permission required" };
        },
      },
      async (input: unknown, ctx) => {
        const started = performance.now();
        let outcome = "success";
        try {
          const result = await executeTool(tokenHash, session, name, input);
          if (name === "search" || name === "fetch") return plainOutput(result);
          // A proposal waits for the human: clients that support URL elicitation open the
          // exact confirmation page in Zyliad, where only the user's session can approve.
          if (
            "action" in tool &&
            result?.status === "pending" &&
            !ctx.mcpReq.inputResponses &&
            supportsUrlElicitation(ctx.mcpReq.envelope)
          )
            return inputRequired({
              inputRequests: {
                confirm: inputRequired.elicitUrl({
                  message:
                    "Vérifiez et confirmez cette proposition dans Zyliad. Rien n’est modifié avant votre confirmation.",
                  url: confirmationUrl(result.id),
                }),
              },
            });
          return output(result);
        } catch (error) {
          const failure = toolError(error, requestId);
          outcome = failure.error;
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify(failure) }],
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
  const canReadRecords = session.scopes.includes("records:read");
  // One record as attachable context, e.g. zyliad://record/<uuid>.
  server.registerResource(
    "record",
    new ResourceTemplate("zyliad://record/{id}", { list: undefined }),
    {
      mimeType: "application/json",
      description: "Une fiche Zyliad autorisée (personne, entreprise ou opportunité), en JSON.",
      scopeChallenge: () =>
        canReadRecords
          ? undefined
          : {
              scopes: [...new Set([...session.scopes, "records:read"])] as [string, ...string[]],
            },
    },
    async (uri, variables) => {
      const id = String(variables.id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError("Identifiant de fiche invalide.", 400);
      const data = await mcpDb(tokenHash, "record", { record_id: id });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(output(data).structuredContent),
          },
        ],
      };
    },
  );
  // Prompt arguments that take a record or pipeline offer completion from a search.
  const complete = (kind: "record" | "pipeline") => async (value: string) => {
    if (kind === "record" ? !canReadRecords : !session.scopes.includes("configuration:read"))
      return [];
    if (/^[0-9a-f-]{36}$/.test(value)) return [value];
    const page = await mcpDb(tokenHash, "search", {
      kind,
      filters: { query: value.slice(0, 100), limit: 10 },
    }).catch(() => null);
    return ((page?.data ?? []) as Record<string, unknown>[])
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string");
  };
  for (const [name, prompt] of Object.entries(promptDefinitions)) {
    const shape = (prompt.schema as z.ZodObject).shape as Record<string, z.ZodType>;
    const args = z
      .object(
        Object.fromEntries(
          Object.entries(shape).map(([key, value]) => [
            key,
            // completable() marks the schema it receives: build a fresh one per server so the
            // shared module-level prompt schemas are never mutated across requests.
            key === "record_id"
              ? completable(z.uuid(), complete("record"))
              : key === "pipeline_id"
                ? completable(z.uuid(), complete("pipeline"))
                : value,
          ]),
        ),
      )
      .strict();
    server.registerPrompt(
      name,
      { description: prompt.description, argsSchema: localizedSchema(args) },
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
  }
  return server;
}
/** CORS for browser-based MCP clients on an explicit allowlist (bearer tokens only, no cookies). */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !mcpAllowedOrigins().includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers":
      "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version, X-Request-ID",
    "Access-Control-Max-Age": "600",
  };
}
export function handleMcpPreflight(request: Request) {
  const headers = corsHeaders(request);
  return new Response(null, {
    status: headers["Access-Control-Allow-Origin"] ? 204 : 403,
    headers,
  });
}
export async function handleMcp(request: Request) {
  const requestId = randomUUID();
  const cors = corsHeaders(request);
  try {
    const o = new URL(mcpOrigin());
    const origin = request.headers.get("origin");
    // Next.js may canonicalize request.url to its internal listening hostname.
    // Validate the actual HTTP Host against the configured public origin; a browser
    // Origin must be the canonical one or explicitly allowlisted (DNS rebinding).
    const host = request.headers.get("host") ?? new URL(request.url).host;
    if (host !== o.host || (origin && !mcpAllowedOrigins().includes(origin)))
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
      const response = await handler.fetch(request, {
        authInfo: {
          token: tokenHash,
          clientId: session.connection_id,
          scopes: session.scopes,
          resource: new URL(mcpResource()),
          resourceMetadataUrl: `${mcpOrigin()}/.well-known/oauth-protected-resource/api/mcp`,
        },
      });
      const bytes = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Request-ID", requestId);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
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
          ...cors,
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
