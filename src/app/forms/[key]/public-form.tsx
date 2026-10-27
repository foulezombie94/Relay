"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { formSpec } from "@/lib/domain/record-studio";
import { request, RequestError } from "@/lib/api/request";
import { FormView } from "@/components/records/studio/form-view";
import { ErrorMessage, Loading } from "@/components/ui";
import styles from "@/components/records/studio/studio.module.css";
const responseSchema = z.object({ name: z.string(), config: formSpec });
export function PublicForm({ shareKey }: { shareKey: string }) {
  const [data, setData] = useState<z.infer<typeof responseSchema> | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [reload, setReload] = useState(0);
  const attempt = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    request<unknown>("/api/forms/" + encodeURIComponent(shareKey))
      .then((result) => {
        const parsed = responseSchema.safeParse(result);
        if (!parsed.success) throw new Error("Formulaire indisponible. Réessayez plus tard.");
        if (active) setData(parsed.data);
      })
      .catch((e) => {
        if (!active) return;
        const unavailable =
          e instanceof RequestError && [400, 401, 403, 404, 410].includes(e.status);
        setError({
          message: unavailable
            ? "Ce lien de formulaire est invalide ou n’est plus disponible."
            : e instanceof Error
              ? e.message
              : "Formulaire indisponible. Réessayez plus tard.",
          retryable: !unavailable,
        });
      });
    return () => {
      active = false;
    };
  }, [shareKey, reload]);
  return (
    <main className={styles.publicFormPage}>
      <div className={styles.publicFormInner}>
        {error ? (
          <>
            <h1>Formulaire indisponible</h1>
            <ErrorMessage error={new Error(error.message)} />
            {error.retryable && (
              <button
                className="button"
                onClick={() => {
                  setError(null);
                  setReload((value) => value + 1);
                }}
              >
                Réessayer
              </button>
            )}
          </>
        ) : data ? (
          <FormView
            name={data.name}
            spec={data.config}
            onSubmit={async (answers, website) => {
              attempt.current ??= crypto.randomUUID();
              const result = await request<{ ok?: boolean }>(
                "/api/forms/" + encodeURIComponent(shareKey),
                "POST",
                { answers, website, attempt: attempt.current },
              );
              if (result.ok !== true)
                throw new RequestError("La réponse n’a pas été enregistrée. Réessayez.", 502);
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
