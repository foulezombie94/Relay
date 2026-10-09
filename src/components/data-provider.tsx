"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace, ObjectDefinition, Row } from "@/lib/domain/types";
import { toast } from "sonner";
import Link from "next/link";
import { AppearanceProvider } from "./appearance-provider";
export async function request<T = Record<string, unknown>>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Action impossible");
  return data;
}
const Context = createContext<{
  workspace: Workspace;
  objects: ObjectDefinition[];
  user: { id: string; email?: string };
  workspaces: Workspace[];
  switchWorkspace: (id: string) => void;
} | null>(null);
export function useWorkspace() {
  const c = useContext(Context);
  if (!c) throw new Error("Workspace missing");
  return c;
}
export function useRows<T extends Row = Row>(
  resource: string,
  params: Record<string, string | number | undefined> = {},
) {
  const { workspace } = useWorkspace();
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined) p.set(k, String(v));
  });
  return useQuery({
    queryKey: ["rows", workspace.id, resource, params],
    queryFn: () =>
      request<{ data: T[]; count: number }>("/api/" + workspace.id + "/" + resource + "?" + p),
  });
}
export function useSave() {
  const { workspace } = useWorkspace();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function save(resource: string, values: Record<string, unknown>, row?: Row) {
    setBusy(true);
    try {
      const data = await request<{ data: Row }>(
        "/api/" + workspace.id + "/" + resource,
        row ? "PATCH" : "POST",
        row ? { id: row.id, version: row.version, values } : values,
      );
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      toast.success("Enregistré");
      return data.data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function remove(resource: string, id: string) {
    try {
      await request("/api/" + workspace.id + "/" + resource + "?id=" + id, "DELETE");
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      toast.success("Élément retiré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
      throw e;
    }
  }
  return { save, remove, busy };
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Gate>{children}</Gate>
    </QueryClientProvider>
  );
}
function Gate({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("workspace") ?? ""),
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["workspaces"],
    queryFn: () =>
      request<{ data: Workspace[]; user: { id: string; email?: string } }>("/api/workspaces"),
  });
  const workspace = q.data?.data.find((w) => w.id === selected) ?? q.data?.data[0];
  const objects = useQuery({
    queryKey: ["rows", workspace?.id, "objects"],
    enabled: !!workspace,
    queryFn: () =>
      request<{ data: ObjectDefinition[] }>("/api/" + workspace!.id + "/objects?size=100"),
  });
  if (q.isPending) return <div className="page-loader">Ouverture de votre espace…</div>;
  if (q.error)
    return (
      <div className="page-loader">
        <p>{q.error.message}</p>
        <a href="/login">Se reconnecter</a>
      </div>
    );
  if (!workspace)
    return (
      <div className="onboarding">
        <span className="brand-mark">r</span>
        <h1>Bienvenue dans Relay.</h1>
        <p>Créez votre espace de travail.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await request("/api/workspaces", "POST", { name });
              await cache.invalidateQueries({ queryKey: ["workspaces"] });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Création impossible");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Nom de votre entreprise
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="button primary" disabled={busy}>
            Créer mon espace
          </button>
        </form>
        <Link href="/portal">Ouvrir mon portail client</Link>
      </div>
    );
  return (
    <Context.Provider
      value={{
        workspace,
        objects: objects.data?.data ?? [],
        user: q.data!.user,
        workspaces: q.data!.data,
        switchWorkspace(id) {
          setSelected(id);
          cache.removeQueries({ queryKey: ["rows"] });
        },
      }}
    >
      <AppearanceProvider key={q.data!.user.id} user={q.data!.user.id}>
        {children}
      </AppearanceProvider>
    </Context.Provider>
  );
}
