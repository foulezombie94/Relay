import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/supabase/admin";
import { ApiError, databaseError, fail } from "@/lib/api/context";
import { boundedJsonBody } from "@/lib/api/workflow-body";
import { formSpec, visibleFormQuestions } from "@/lib/domain/record-studio";
import { resources } from "@/lib/domain/resource-schemas";
import { validateAttributes } from "@/lib/domain/attributes";
import type { Attribute } from "@/lib/domain/types";
type Params = { params: Promise<{ key: string }> };
async function configuration(key: string) {
  const admin = adminDb();
  const row = await admin
    .from("record_configs")
    .select("id,workspace_id,object_id,name,config,created_by")
    .eq("share_key", z.uuid().parse(key))
    .eq("kind", "form")
    .contains("config", { published: true })
    .maybeSingle();
  databaseError(row.error);
  if (!row.data) throw new ApiError("Formulaire indisponible.", 404);
  const member = await admin
    .from("memberships")
    .select("role")
    .eq("workspace_id", row.data.workspace_id)
    .eq("user_id", row.data.created_by)
    .maybeSingle();
  databaseError(member.error);
  if (!member.data || !["owner", "admin", "member"].includes(member.data.role))
    throw new ApiError("Formulaire indisponible.", 404);
  return { admin, row: row.data, spec: formSpec.parse(row.data.config) };
}
const json = (data: unknown) =>
  NextResponse.json(data, {
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
export async function GET(_: NextRequest, { params }: Params) {
  try {
    const { row, spec } = await configuration((await params).key);
    return json({ name: row.name, config: spec });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const input = z
      .object({
        attempt: z.uuid(),
        answers: z.record(
          z.string(),
          z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
        ),
        website: z.string().max(300).optional(),
      })
      .strict()
      .parse(await boundedJsonBody(req, 40000));
    if (input.website) return json({ ok: true });
    const { admin, row, spec } = await configuration((await params).key);
    const values: Record<string, unknown> = {},
      attributes: Record<string, unknown> = {};
    for (const question of visibleFormQuestions(spec, input.answers)) {
      const raw = input.answers[question.id];
      if (question.required && question.type === "checkbox" && raw !== true)
        throw new ApiError(`${question.label} doit être confirmé.`);
      if (raw === undefined || raw === "") {
        if (question.required) throw new ApiError(`${question.label} est obligatoire.`);
        continue;
      }
      let value: unknown = raw;
      switch (question.type) {
        case "checkbox":
          value = z.boolean().parse(raw);
          break;
        case "number":
          value = z.coerce.number().finite().parse(raw);
          break;
        case "email":
          value = z.email().parse(raw);
          break;
        case "url":
          value = z.url({ protocol: /^https?$/ }).parse(raw);
          break;
        case "date":
          value = z.iso.date().parse(raw);
          break;
        case "select":
          value = z
            .string()
            .refine((s) => question.options.includes(s))
            .parse(raw);
          break;
        default:
          value = z.string().max(10000).parse(raw);
      }
      if (question.property.startsWith("attr_")) attributes[question.property.slice(5)] = value;
      else values[question.property] = value;
    }
    const payload = resources.records.parse({ ...values, attributes, object_id: row.object_id });
    const attrs = await admin
      .from("attributes")
      .select("*")
      .eq("workspace_id", row.workspace_id)
      .eq("object_id", row.object_id);
    databaseError(attrs.error);
    const issues = validateAttributes(attributes, (attrs.data ?? []) as Attribute[]);
    if (issues.length) throw new ApiError(issues.join(" "));
    const result = await admin.rpc("record_form_submit", {
      configuration: row.id,
      payload,
      attempt: input.attempt,
    });
    if (result.error?.code === "53300")
      throw new ApiError("Trop de réponses. Réessayez dans quelques minutes.", 429);
    if (result.error?.code === "42501") throw new ApiError("Formulaire indisponible.", 404);
    databaseError(result.error);
    return json({ ok: true, receipt: result.data });
  } catch (error) {
    return fail(error);
  }
}
