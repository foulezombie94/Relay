import { NextRequest, NextResponse } from "next/server";
import {
  context,
  checkOrigin,
  databaseError,
  fail,
  ApiError,
} from "@/lib/api/context";
import { adminDb } from "@/lib/supabase/admin";
import { simulate } from "@/lib/domain/workflows";
import { z } from "zod";
import type { CrmRecord, Workflow } from "@/lib/domain/types";
type P = { params: Promise<{ workspace: string }> };
export async function POST(request: NextRequest, { params }: P) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client, user } = await context(workspace, true);
    const { workflow_id } = z
      .object({ workflow_id: z.uuid() })
      .parse(await request.json());
    const { data: w, error } = await client
      .from("workflows")
      .select("*")
      .eq("workspace_id", workspace)
      .eq("id", workflow_id)
      .single();
    databaseError(error);
    if (!w) throw new ApiError("Automatisation inaccessible.", 404);
    const records: CrmRecord[] = [];
    let scanned = 0;
    for (let page = 0; page < 100; page++) {
      let query = client
        .from("records")
        .select("*")
        .eq("workspace_id", workspace)
        .eq("object_id", w.definition.object_id)
        .eq("archived", false);
      for (const condition of w.definition.conditions) {
        if (
          ["stage", "owner_id", "display_name", "email", "domain"].includes(
            condition.field,
          ) &&
          condition.operator === "equals" &&
          String(condition.value ?? "") !== ""
        )
          query = query.filter(
            condition.field,
            "eq",
            String(condition.value ?? ""),
          );
        if (
          condition.field === "amount" &&
          ["gt", "lt"].includes(condition.operator) &&
          Number.isFinite(Number(condition.value))
        )
          query =
            condition.operator === "gt"
              ? query.gt("amount", Number(condition.value))
              : query.lt("amount", Number(condition.value));
      }
      const { data, error: readError } = await query
        .order("id")
        .range(page * 500, page * 500 + 499);
      databaseError(readError);
      scanned += (data ?? []).length;
      const eligible = simulate(
        w as Workflow,
        (data ?? []) as CrmRecord[],
      ).records;
      const eligibleIds = new Set(eligible.map((row) => row.id));
      records.push(
        ...((data ?? []) as CrmRecord[]).filter((row) =>
          eligibleIds.has(row.id),
        ),
      );
      if (records.length > 100)
        throw new ApiError(
          "Plus de 100 fiches correspondent aux conditions. Précisez le workflow avant de confirmer des modifications.",
        );
      if ((data?.length ?? 0) < 500) break;
      if (page === 99)
        throw new ApiError(
          "Périmètre trop large pour une simulation interactive. Précisez vos conditions.",
        );
    }
    const snapshot = simulate(w as Workflow, (records ?? []) as CrmRecord[]);
    const { data: run, error: runError } = await adminDb()
      .from("workflow_runs")
      .insert({
        workspace_id: workspace,
        workflow_id,
        workflow_version: w.version,
        mode: "simulation",
        snapshot,
        created_by: user.id,
      })
      .select("id")
      .single();
    databaseError(runError);
    if (!run) throw new ApiError("L’aperçu n’a pas pu être enregistré.", 500);
    return NextResponse.json({ data: { ...snapshot, id: run.id } });
  } catch (e) {
    return fail(e);
  }
}
export async function PATCH(request: NextRequest, { params }: P) {
  try {
    checkOrigin(request);
    const { workspace } = await params;
    const { client } = await context(workspace, true);
    const { preview_id } = z
      .object({ preview_id: z.uuid() })
      .parse(await request.json());
    const { data: run } = await client
      .from("workflow_runs")
      .select("id")
      .eq("workspace_id", workspace)
      .eq("id", preview_id)
      .single();
    if (!run) throw new ApiError("Aperçu inaccessible.", 403);
    const { data, error } = await client.rpc("execute_preview", {
      preview: preview_id,
    });
    if (error)
      throw new ApiError(
        /changed|expired/.test(error.message)
          ? "L’aperçu a expiré ou les données ont changé. Relancez la simulation."
          : /email connection/.test(error.message)
            ? "Connectez un compte d’envoi avant d’exécuter des actions email. Aucune modification effectuée."
            : "Cette exécution n’a pas pu être effectuée.",
        409,
      );
    return NextResponse.json({ data });
  } catch (e) {
    return fail(e);
  }
}
