"use client";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { request } from "@/lib/api/request";
/** No shared cache; URL changes and failed revalidation never reuse private data. */
export function usePortalResource<T>(url: string, schema: z.ZodType<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    url: string;
    revision: number;
    data?: T;
    error?: Error;
  } | null>(null);
  useEffect(() => {
    let active = true;
    request(url)
      .then((value) => {
        const data = schema.parse(value);
        if (active) setState({ url, revision, data });
      })
      .catch((error) => {
        if (active)
          setState({
            url,
            revision,
            error: error instanceof Error ? error : new Error("Chargement impossible."),
          });
      });
    return () => {
      active = false;
    };
  }, [url, revision, schema]);
  const current = state?.url === url && state.revision === revision ? state : null;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    reload: () => setRevision((value) => value + 1),
  };
}
