import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { assertAuthAvailable } from "@/lib/supabase/session";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
export const metadata: Metadata = {
  title: "Votre espace · Relay",
  robots: { index: false, follow: false },
};
export default async function OnboardingPage() {
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  assertAuthAvailable(error);
  if (error || !user) redirect("/login?next=/onboarding");
  return (
    <OnboardingFlow
      user={{
        id: user.id,
        email: user.email,
        pending: user.user_metadata?.relay_onboarding_pending === true,
        name:
          typeof user.user_metadata.full_name === "string"
            ? user.user_metadata.full_name.slice(0, 80)
            : "",
      }}
    />
  );
}
