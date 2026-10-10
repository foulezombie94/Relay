import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, checkOrigin, databaseError, fail, jsonBody } from "@/lib/api/context";
import { db } from "@/lib/supabase/server";
import { assertAuthAvailable } from "@/lib/supabase/session";
import { onboardingWorkspace } from "@/lib/domain/onboarding";
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const values = onboardingWorkspace.parse(await jsonBody(request));
    const client = await db();
    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser();
    assertAuthAvailable(authError);
    if (authError || !user) throw new ApiError("Connexion requise.", 401);
    const { data, error } = await client.rpc("create_onboarding_workspace", {
      label: values.name,
      person_name: values.fullName,
      zone: values.timezone,
      attempt: values.attemptId,
    });
    databaseError(error);
    if (!z.uuid().safeParse(data).success)
      throw new ApiError("La création de l’espace n’a pas été confirmée.", 502);
    return NextResponse.json({ id: data }, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
