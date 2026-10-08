import Link from "next/link";
export default function NotFound() {
  return (
    <main className="onboarding">
      <h1>Page introuvable</h1>
      <Link className="button primary" href="/app/companies">
        Retour au CRM
      </Link>
    </main>
  );
}
