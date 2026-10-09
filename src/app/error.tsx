"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="onboarding">
      <h1>Cette page n’a pas pu s’ouvrir.</h1>
      <p>Votre session ou une connexion peut nécessiter un nouvel essai.</p>
      <button className="button primary" onClick={reset}>
        Réessayer
      </button>
      <a href="/login">Se reconnecter</a>
    </main>
  );
}
