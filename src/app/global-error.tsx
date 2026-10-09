"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="fr">
      <body>
        <main>
          <h1>Relay a rencontré un problème.</h1>
          <p>Réessayez pour reprendre votre travail.</p>
          <button onClick={reset}>Réessayer</button>
        </main>
      </body>
    </html>
  );
}
