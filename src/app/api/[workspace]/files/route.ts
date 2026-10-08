import { NextRequest, NextResponse } from "next/server";
import { context, checkOrigin, ApiError, databaseError, fail } from "@/lib/api/context";
import { z } from "zod";
import { boundedFormData } from "@/lib/api/bounded-form";
import { extractDocument } from "@/lib/agent/documents";
type P = { params: Promise<{ workspace: string }> };
export async function POST(req: NextRequest, { params }: P) {
  try {
    checkOrigin(req);
    const { workspace } = await params;
    const { client, user } = await context(workspace, true);
    const form = await boundedFormData(req, 22 * 1024 * 1024);
    const file = form.get("file");
    const record_id = z.uuid().parse(form.get("record_id"));
    if (!(file instanceof File) || file.size > 20 * 1024 * 1024 || file.size === 0)
      throw new ApiError("Fichier vide ou supérieur à 20 Mo.");
    const { data: record } = await client
      .from("records")
      .select("id")
      .eq("workspace_id", workspace)
      .eq("id", record_id)
      .single();
    if (!record) throw new ApiError("Fiche inaccessible.", 404);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const mimes: Record<string, string> = {
      pdf: "application/pdf",
      txt: "text/plain",
      csv: "text/csv",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    if (!ext || !mimes[ext]) throw new ApiError("Format non autorisé.");
    const extracted = await extractDocument(file, ext);
    const path = workspace + "/" + crypto.randomUUID() + "." + ext;
    const { error } = await client.storage
      .from("relay-documents")
      .upload(path, file, { contentType: mimes[ext], upsert: false });
    databaseError(error);
    const { data, error: insertError } = await client
      .from("documents")
      .insert({
        workspace_id: workspace,
        record_id,
        name: file.name.slice(0, 250),
        path,
        mime: mimes[ext],
        size: file.size,
        uploader_id: user.id,
        ...extracted,
      })
      .select("*")
      .single();
    if (insertError) {
      await client.storage.from("relay-documents").remove([path]);
      databaseError(insertError);
    }
    return NextResponse.json({ data });
  } catch (e) {
    return fail(e);
  }
}
export async function GET(req: NextRequest, { params }: P) {
  try {
    const { workspace } = await params;
    const { client } = await context(workspace);
    const id = z.uuid().parse(req.nextUrl.searchParams.get("id"));
    const { data: doc } = await client
      .from("documents")
      .select("path")
      .eq("workspace_id", workspace)
      .eq("id", id)
      .single();
    if (!doc) throw new ApiError("Document inaccessible.", 404);
    const { data, error } = await client.storage
      .from("relay-documents")
      .createSignedUrl(doc.path, 60);
    databaseError(error);
    return NextResponse.redirect(data!.signedUrl);
  } catch (e) {
    return fail(e);
  }
}
