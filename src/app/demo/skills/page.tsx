import { Suspense } from "react";
import { SkillsLocalPreview } from "@/components/skills/preview";

export default function Page() {
  return (
    <Suspense fallback={<p>Ouverture de l’éditeur…</p>}>
      <SkillsLocalPreview />
    </Suspense>
  );
}
