import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, databaseError } from "./context";
import { validateSkillValues, type SkillManifest } from "@/lib/domain/agent-skills";
import {
  skillMentionIds,
  skillVariableNames,
  type SkillBindings,
} from "@/lib/domain/skill-context";
import type { SourceContent } from "./assistant-context";

type RecordData = {
  id: string;
  object_id: string;
  display_name: string;
  email: string | null;
  domain: string | null;
  stage: string;
  amount: number | string;
  currency: string;
  close_date: string | null;
};
const columns = "id,object_id,display_name,email,domain,stage,amount,currency,close_date";
export async function assertSkillResources(
  client: SupabaseClient,
  workspace: string,
  manifest: SkillManifest,
) {
  const mentions = skillMentionIds(manifest.instructions);
  if (
    mentions.some(
      (id) =>
        !manifest.resources.some((ref) => ref.type === "record" && ref.id.toLowerCase() === id),
    )
  )
    throw new ApiError("Une mention doit être liée à une ressource de la méthode.");
  await Promise.all(
    (
      [
        ["record", "records"],
        ["note", "notes"],
        ["document", "documents"],
      ] as const
    ).map(async ([kind, table]) => {
      const ids = [
        ...new Set(manifest.resources.filter((ref) => ref.type === kind).map((ref) => ref.id)),
      ];
      if (!ids.length) return;
      let query = client.from(table).select("id").eq("workspace_id", workspace).in("id", ids);
      if (kind === "record") query = query.eq("archived", false);
      const result = await query;
      databaseError(result.error);
      if (result.data?.length !== ids.length)
        throw new ApiError("Une ressource de la méthode n’est plus accessible.", 403);
    }),
  );
}
export async function resolveSkillContext(
  client: SupabaseClient,
  workspace: string,
  manifest: SkillManifest,
  supplied: unknown,
  recordId?: string,
  allowMissing = false,
) {
  const values = validateSkillValues(manifest, supplied, true);
  const bindings: SkillBindings = Object.create(null);
  const sources: SourceContent[] = [];
  let record: RecordData | null = null,
    company: RecordData | null = null;
  let slug = "";
  if (recordId) {
    const found = await client
      .from("records")
      .select(columns)
      .eq("workspace_id", workspace)
      .eq("id", recordId)
      .eq("archived", false)
      .is("merged_into", null)
      .maybeSingle();
    databaseError(found.error);
    if (!found.data) throw new ApiError("La fiche de contexte n’est plus accessible.", 404);
    record = found.data as RecordData;
    const objects = await client.from("objects").select("id,slug").eq("workspace_id", workspace);
    databaseError(objects.error);
    slug = objects.data?.find((item) => item.id === record!.object_id)?.slug ?? "";
    if (slug === "companies") company = record;
    else if (
      manifest.inputs.some((field) => ["company_id", "entreprise_id"].includes(field.key)) ||
      skillVariableNames(manifest.instructions).some((key) => key.startsWith("entreprise."))
    ) {
      const relations = await client
        .from("record_relations")
        .select("source_id,target_id")
        .eq("workspace_id", workspace)
        .or(`source_id.eq.${record.id},target_id.eq.${record.id}`)
        .limit(101);
      databaseError(relations.error);
      const companyObject = objects.data?.find((item) => item.slug === "companies")?.id;
      const ids = [
        ...new Set(
          (relations.data ?? []).map((link) =>
            link.source_id === record!.id ? link.target_id : link.source_id,
          ),
        ),
      ];
      if (companyObject && ids.length && (relations.data?.length ?? 0) <= 100) {
        const linked = await client
          .from("records")
          .select(columns)
          .eq("workspace_id", workspace)
          .eq("object_id", companyObject)
          .in("id", ids)
          .eq("archived", false)
          .is("merged_into", null)
          .limit(2);
        databaseError(linked.error);
        if (linked.data?.length === 1) company = linked.data[0] as RecordData;
      }
    }
    const companyChoice = values.company_id ?? values.entreprise_id;
    if (
      typeof companyChoice === "string" &&
      manifest.inputs.some(
        (field) => ["company_id", "entreprise_id"].includes(field.key) && field.kind === "record",
      )
    ) {
      const object = objects.data?.find((item) => item.slug === "companies");
      const chosen = await client
        .from("records")
        .select(columns)
        .eq("workspace_id", workspace)
        .eq("id", companyChoice)
        .eq("object_id", object?.id ?? "00000000-0000-0000-0000-000000000000")
        .eq("archived", false)
        .maybeSingle();
      databaseError(chosen.error);
      if (!chosen.data) throw new ApiError("L’entreprise choisie n’est pas accessible.", 403);
      company = chosen.data as RecordData;
    }
    bindings["fiche.nom"] = record.display_name;
    if (record.email) bindings["fiche.email"] = record.email;
    if (record.domain) bindings["fiche.domaine"] = record.domain;
    bindings["fiche.etape"] = record.stage;
    if (slug === "people") bindings["contact.nom"] = record.display_name;
    if (slug === "deals") {
      bindings["opportunite.nom"] = record.display_name;
      bindings["opportunite.montant"] = String(record.amount);
      bindings["opportunite.devise"] = record.currency;
      if (record.close_date) bindings["opportunite.date_cloture"] = record.close_date;
    }
    if (company) {
      bindings["entreprise.nom"] = company.display_name;
      if (company.domain) bindings["entreprise.domaine"] = company.domain;
    }
    for (const field of manifest.inputs) {
      if (Object.hasOwn(values, field.key)) continue;
      let id: string | undefined;
      if (field.kind === "record") {
        if (["record_id", "fiche_id"].includes(field.key)) id = record.id;
        else if (["company_id", "entreprise_id"].includes(field.key)) id = company?.id;
        else if (field.key === "contact_id" && slug === "people") id = record.id;
        else if (
          ["deal_id", "opportunity_id", "opportunite_id"].includes(field.key) &&
          slug === "deals"
        )
          id = record.id;
      }
      if (id) values[field.key] = id;
    }
    for (const item of [record, ...(company && company.id !== record.id ? [company] : [])])
      sources.push({
        id: item.id,
        type: "record",
        record_id: item.id,
        object_id: item.object_id,
        label: item.display_name,
        content: JSON.stringify(item),
      });
  }
  const space = await client
    .from("workspaces")
    .select("timezone")
    .eq("id", workspace)
    .maybeSingle();
  databaseError(space.error);
  const timezone = space.data?.timezone || "Europe/Paris";
  try {
    bindings.aujourdhui = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    throw new ApiError("Le fuseau horaire de l’espace est invalide.");
  }
  const inputs = validateSkillValues(manifest, values, allowMissing);
  const inputRecords = [
    ...new Set(
      manifest.inputs.flatMap((field) =>
        field.kind === "record" && typeof inputs[field.key] === "string"
          ? [inputs[field.key] as string]
          : field.kind === "records" && Array.isArray(inputs[field.key])
            ? (inputs[field.key] as string[])
            : [],
      ),
    ),
  ];
  if (inputRecords.length) {
    const allowed = await client
      .from("records")
      .select("id")
      .eq("workspace_id", workspace)
      .in("id", inputRecords)
      .eq("archived", false);
    databaseError(allowed.error);
    if (allowed.data?.length !== inputRecords.length)
      throw new ApiError("Une fiche saisie n’est plus accessible.", 403);
  }
  for (const [key, value] of Object.entries(inputs))
    bindings[`input.${key}`] = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  return {
    inputs,
    bindings,
    sources,
    record: record ? { id: record.id, label: record.display_name } : null,
    missingVariables: skillVariableNames(manifest.instructions).filter(
      (key) => !Object.hasOwn(bindings, key),
    ),
  };
}
