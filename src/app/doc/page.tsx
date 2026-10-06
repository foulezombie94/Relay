import { Suspense } from "react";
import { Documentation } from "@/components/documentation";
export const metadata = {
  title: "Guide utilisateur · Relay CRM",
  description:
    "Aide Relay : démarrer, gérer vos contacts, suivre vos ventes, travailler en équipe et partager avec vos clients.",
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
