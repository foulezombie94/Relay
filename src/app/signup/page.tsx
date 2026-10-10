import { Suspense } from "react";
import type { Metadata } from "next";
import { SignupFlow } from "@/components/onboarding/signup-flow";
export const metadata: Metadata = { title: "Créer votre compte · Relay" };
export default function SignupPage() {
  return (
    <Suspense>
      <SignupFlow />
    </Suspense>
  );
}
