import { Suspense } from "react";
import { Documentation } from "@/components/documentation";
export const metadata = {
  title: "Documentation · Relay CRM",
  description:
    "Guides Relay : contacts, pipelines, imports, modèles email et intégrations.",
};
export default function DocumentationPage() {
  return (
    <Suspense
      fallback={<main className="page-content">Chargement des guides…</main>}
    >
      <Documentation />
    </Suspense>
  );
}
