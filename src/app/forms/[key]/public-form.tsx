"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { formSpec } from "@/lib/domain/record-studio";
import { FormView } from "@/components/records/studio/form-view";
import { ErrorMessage, Loading } from "@/components/ui";
import styles from "@/components/records/studio/studio.module.css";
const responseSchema = z.object({ name: z.string(), config: formSpec });
export function PublicForm({ shareKey }: { shareKey: string }) {
  const [data, setData] = useState<z.infer<typeof responseSchema> | null>(null);
  const [error, setError] = useState("");
  const attempt = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/forms/" + encodeURIComponent(shareKey), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Formulaire indisponible.");
        setData(responseSchema.parse(result));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Formulaire indisponible.");
      });
    return () => controller.abort();
  }, [shareKey]);
  return (
    <main className={styles.publicFormPage}>
      <div className={styles.publicFormInner}>
        {error ? (
          <>
            <h1>Formulaire indisponible</h1>
            <ErrorMessage error={new Error(error)} />
          </>
        ) : data ? (
          <FormView
            name={data.name}
            spec={data.config}
            onSubmit={async (answers, website) => {
              attempt.current ??= crypto.randomUUID();
              const response = await fetch("/api/forms/" + encodeURIComponent(shareKey), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers, website, attempt: attempt.current }),
              });
              const result = await response.json();
              if (!response.ok || result.ok !== true)
                throw new Error(result.error || "La réponse n’a pas été enregistrée.");
            }}
          />
        ) : (
          <Loading />
        )}
        <footer className={styles.formBrand}>Créé avec Zyliad</footer>
      </div>
    </main>
  );
}
