import { z } from "zod";
import {
  apiScopes,
  createNoteBody,
  createRecordBody,
  createTaskBody,
  createWebhookBody,
  scopeLabels,
  signatureHeader,
  updateRecordBody,
  updateTaskBody,
  webhookEvents,
} from "@/lib/domain/public-api";

const schema = (value: z.ZodType) =>
  z.toJSONSchema(value, { target: "openapi-3.0", unrepresentable: "any", io: "input" });
const error = { $ref: "#/components/schemas/Error" };
const responses = (ok: Record<string, unknown>, extra: number[] = []) => ({
  ...ok,
  ...Object.fromEntries(
    [400, 401, 403, 429, ...extra].map((code) => [
      String(code),
      { description: errorTitles[code], content: { "application/json": { schema: error } } },
    ]),
  ),
});
const errorTitles: Record<number, string> = {
  400: "Requête invalide ou Idempotency-Key manquante",
  401: "Clé API invalide, expirée ou révoquée",
  403: "Permission (scope) insuffisante",
  404: "Ressource introuvable",
  409: "Conflit de version ou d’idempotence",
  422: "Validation refusée",
  429: "Limite de débit atteinte (voir Retry-After)",
};
const json = (ref: string, description = "Succès") => ({
  description,
  content: { "application/json": { schema: { $ref: ref } } },
});
const idempotency = {
  name: "Idempotency-Key",
  in: "header",
  required: true,
  description:
    "Identifiant unique de la tentative (8–100 caractères). Rejouer la même requête renvoie la même réponse ; la réutiliser pour un autre corps renvoie 409.",
  schema: { type: "string", minLength: 8, maxLength: 100 },
};
const pageParams = [
  {
    name: "limit",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
  },
  {
    name: "cursor",
    in: "query",
    schema: { type: "string" },
    description: "next_cursor de la page précédente.",
  },
];
const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

/** OpenAPI 3.0 description of the public REST API, generated from the validation schemas. */
export function openApiDocument(origin: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "API Zyliad CRM",
      version: "1.0.0",
      description: [
        "API REST de votre espace Zyliad. Authentifiez chaque requête avec `Authorization: Bearer zk_…` (clé créée dans Paramètres › Développeurs).",
        "Une clé agit avec les droits de son créateur dans un seul espace et selon ses permissions. Limite : 120 requêtes par minute et par clé.",
        "Toutes les écritures exigent l’en-tête `Idempotency-Key`. Les listes sont paginées par curseur (`next_cursor`).",
        `Webhooks : chaque livraison est signée dans l’en-tête \`${signatureHeader}: t=<timestamp>,v1=<hmac>\`, HMAC-SHA256 de \`<timestamp>.<corps>\` avec le secret du webhook. Livraison au moins une fois : dédupliquez sur \`id\`.`,
      ].join("\n\n"),
    },
    servers: [{ url: origin + "/api/v1" }],
    security: [{ bearer: [] }],
    tags: [
      { name: "Compte" },
      { name: "Fiches" },
      { name: "Tâches" },
      { name: "Notes" },
      { name: "Webhooks" },
    ],
    paths: {
      "/me": {
        get: {
          tags: ["Compte"],
          summary: "Clé et espace courants",
          responses: responses({ 200: json("#/components/schemas/Me") }),
        },
      },
      "/objects": {
        get: {
          tags: ["Fiches"],
          summary: "Objets, attributs et pipelines de l’espace",
          description: "Permission : records:read.",
          responses: responses({ 200: { description: "Modèle de données" } }),
        },
      },
      "/records": {
        get: {
          tags: ["Fiches"],
          summary: "Lister les fiches d’un objet",
          description: "Permission : records:read. Tri par dernière modification décroissante.",
          parameters: [
            {
              name: "object",
              in: "query",
              required: true,
              schema: { type: "string" },
              example: "people",
            },
            {
              name: "q",
              in: "query",
              schema: { type: "string" },
              description: "Recherche plein texte.",
            },
            { name: "stage", in: "query", schema: { type: "string" } },
            { name: "owner_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "pipeline_id", in: "query", schema: { type: "string", format: "uuid" } },
            { name: "email", in: "query", schema: { type: "string" } },
            { name: "domain", in: "query", schema: { type: "string" } },
            { name: "updated_after", in: "query", schema: { type: "string", format: "date-time" } },
            {
              name: "archived",
              in: "query",
              schema: { type: "boolean" },
              description: "Fiches de la corbeille.",
            },
            ...pageParams,
          ],
          responses: responses({ 200: json("#/components/schemas/RecordPage") }),
        },
        post: {
          tags: ["Fiches"],
          summary: "Créer une fiche",
          description:
            "Permission : records:write. Les attributs sont validés comme dans l’application.",
          parameters: [idempotency],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schema(createRecordBody) } },
          },
          responses: responses(
            { 201: json("#/components/schemas/RecordResult", "Fiche créée") },
            [409, 422],
          ),
        },
      },
      "/records/{id}": {
        parameters: [idParam],
        get: {
          tags: ["Fiches"],
          summary: "Lire une fiche",
          responses: responses({ 200: json("#/components/schemas/RecordResult") }, [404]),
        },
        patch: {
          tags: ["Fiches"],
          summary: "Modifier une fiche",
          description:
            "Permission : records:write. Fournissez `version` pour un contrôle de concurrence optimiste. Les attributs sont fusionnés.",
          parameters: [idempotency],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schema(updateRecordBody) } },
          },
          responses: responses({ 200: json("#/components/schemas/RecordResult") }, [404, 409, 422]),
        },
        delete: {
          tags: ["Fiches"],
          summary: "Mettre une fiche à la corbeille",
          description: "Permission : records:write. Restaurable 30 jours depuis l’application.",
          parameters: [idempotency],
          responses: responses({ 200: { description: "Fiche à la corbeille" } }, [404]),
        },
      },
      "/tasks": {
        get: {
          tags: ["Tâches"],
          summary: "Lister les tâches",
          parameters: [
            { name: "record_id", in: "query", schema: { type: "string", format: "uuid" } },
            {
              name: "status",
              in: "query",
              schema: { type: "string", enum: ["open", "in_progress", "done", "cancelled"] },
            },
            ...pageParams,
          ],
          responses: responses({ 200: { description: "Page de tâches" } }),
        },
        post: {
          tags: ["Tâches"],
          summary: "Créer une tâche",
          parameters: [idempotency],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schema(createTaskBody) } },
          },
          responses: responses({ 201: { description: "Tâche créée" } }, [422]),
        },
      },
      "/tasks/{id}": {
        parameters: [idParam],
        patch: {
          tags: ["Tâches"],
          summary: "Modifier une tâche",
          parameters: [idempotency],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schema(updateTaskBody) } },
          },
          responses: responses({ 200: { description: "Tâche modifiée" } }, [404, 422]),
        },
      },
      "/notes": {
        get: {
          tags: ["Notes"],
          summary: "Lister les notes partagées",
          description: "Les notes privées ne sont jamais exposées.",
          parameters: [
            { name: "record_id", in: "query", schema: { type: "string", format: "uuid" } },
            ...pageParams,
          ],
          responses: responses({ 200: { description: "Page de notes" } }),
        },
        post: {
          tags: ["Notes"],
          summary: "Créer une note partagée",
          parameters: [idempotency],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schema(createNoteBody) } },
          },
          responses: responses({ 201: { description: "Note créée" } }, [422]),
        },
      },
      "/webhooks": {
        get: {
          tags: ["Webhooks"],
          summary: "Lister les webhooks",
          description: "Permission : webhooks:manage (créateur administrateur).",
          responses: responses({ 200: { description: "Webhooks" } }),
        },
        post: {
          tags: ["Webhooks"],
          summary: "Créer un webhook",
          description: "Le secret de signature n’est renvoyé qu’une seule fois.",
          parameters: [idempotency],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schema(createWebhookBody) } },
          },
          responses: responses({ 201: { description: "Webhook créé (secret inclus)" } }, [422]),
        },
      },
      "/webhooks/{id}": {
        parameters: [idParam],
        delete: {
          tags: ["Webhooks"],
          summary: "Supprimer un webhook",
          parameters: [idempotency],
          responses: responses({ 200: { description: "Webhook supprimé" } }, [404]),
        },
      },
    },
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description:
            "Clé API `zk_…`. Permissions : " +
            apiScopes.map((s) => `${s} (${scopeLabels[s]})`).join(", ") +
            ".",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: { code: { type: "string" }, message: { type: "string" } },
              required: ["code", "message"],
            },
          },
        },
        Me: {
          type: "object",
          properties: {
            key: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                scopes: { type: "array", items: { type: "string" } },
              },
            },
            workspace: {
              type: "object",
              properties: { id: { type: "string" }, name: { type: "string" } },
            },
          },
        },
        Record: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            object_id: { type: "string", format: "uuid" },
            display_name: { type: "string" },
            email: { type: "string", nullable: true },
            domain: { type: "string", nullable: true },
            stage: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            owner_id: { type: "string", nullable: true },
            close_date: { type: "string", format: "date", nullable: true },
            pipeline_id: { type: "string", nullable: true },
            attributes: { type: "object", additionalProperties: true },
            version: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        RecordResult: {
          type: "object",
          properties: { data: { $ref: "#/components/schemas/Record" } },
        },
        RecordPage: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/Record" } },
            has_more: { type: "boolean" },
            next_cursor: { type: "string", nullable: true },
          },
        },
        WebhookEvent: {
          type: "object",
          description: "Corps envoyé aux webhooks.",
          properties: {
            id: { type: "string", format: "uuid" },
            type: { type: "string", enum: [...webhookEvents, "ping"] },
            created_at: { type: "string", format: "date-time" },
            workspace_id: { type: "string", format: "uuid" },
            data: {
              type: "object",
              properties: {
                object: { type: "object", additionalProperties: true },
                changes: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  };
}
