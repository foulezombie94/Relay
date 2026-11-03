"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Workspace, ObjectDefinition, Row } from "@/lib/domain/types";
import { toast } from "sonner";
import { redirect, usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppearanceProvider } from "./appearance-provider";
import { browserDb } from "@/lib/supabase/client";
import { observeSession } from "@/lib/supabase/session";
import { request, RequestError, confirmedRow, confirmedRows } from "@/lib/api/request";
import { creationAttempt } from "@/lib/api/save-attempt";
import { isResource, resources } from "@/lib/domain/resource-schemas";
import { EditorDraftScope, clearEditorStorage } from "../ui/editor-draft";
import { workspaceHref, workspaceSwitchHref } from "@/lib/domain/workspace-navigation";
import { SecondFactorRequired } from "../settings/second-factor-required";
export { request, RequestError } from "@/lib/api/request";
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
    queryFn: async () =>
      confirmedRows(
        await request<{ data: T[]; count: number }>(
          "/api/" + workspace.id + "/" + resource + "?" + p,
        ),
      ),
  });
}
export function useSave() {
  const { workspace, user } = useWorkspace();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  async function save(resource: string, values: Record<string, unknown>, row?: Row) {
    if (saving.current) throw new RequestError("Un enregistrement est déjà en cours.", 409);
    saving.current = true;
    setBusy(true);
    try {
      if (!isResource(resource)) throw new RequestError("Ressource inconnue.", 400);
      const parsed = (row ? resources[resource].partial() : resources[resource]).safeParse(values);
      if (!parsed.success)
        throw new RequestError(parsed.error.issues.map((issue) => issue.message).join(" "), 400);
      const attempt = row
        ? null
        : await creationAttempt(
            `${process.env.NEXT_PUBLIC_RELAY_ENVIRONMENT}:${process.env.NEXT_PUBLIC_SUPABASE_URL}:${user.id}:${workspace.id}`,
            resource,
            parsed.data,
          );
      const data = await request<{ data: Row }>(
        "/api/" + workspace.id + "/" + resource,
        row ? "PATCH" : "POST",
        row ? { id: row.id, version: row.version, values: parsed.data } : parsed.data,
        { idempotencyKey: attempt?.id },
      );
      const saved = confirmedRow(data.data, row?.id ?? attempt?.id);
      attempt?.confirm();
      void cache.invalidateQueries({ queryKey: ["rows", workspace.id] }).catch(() => {});
      toast.success("Enregistré");
      return saved;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
      throw e;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function remove(resource: string, id: string) {
    try {
      const result = await request("/api/" + workspace.id + "/" + resource + "?id=" + id, "DELETE");
      if (result.ok !== true)
        throw new RequestError("La suppression n’a pas été confirmée. Réessayez.", 502);
      await cache.invalidateQueries({ queryKey: ["rows", workspace.id] });
      toast.success("Élément retiré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
      throw e;
    }
  }
  return { save, remove, busy };
}
export function AppProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 15000, refetchOnWindowFocus: false },
        },
      }),
  );
  useEffect(
    () =>
      observeSession(
        browserDb().auth,
        userId,
        () => {
          client.clear();
          clearEditorStorage();
        },
        () => window.location.replace("/login"),
        () => window.location.reload(),
      ),
    [client, userId],
  );
  return (
    <QueryClientProvider client={client}>
      <Gate>{children}</Gate>
    </QueryClientProvider>
  );
}
function Gate({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get("workspace");
  const [selection, setSelection] = useState({ requested, remembered: requested ?? "" });
  // An explicit URL wins, including Back/Forward. Links without a workspace
  // inherit the current tab's last selection and are qualified below.
  if (selection.requested !== requested)
    setSelection({ requested, remembered: requested ?? selection.remembered });
  const q = useQuery({
    queryKey: ["workspaces"],
    queryFn: async () => {
      const result = await request<{
        data: Workspace[];
        mfa_blocked?: { id: string; name: string }[];
        user: { id: string; email?: string };
      }>("/api/workspaces");
      if (!Array.isArray(result.data) || !result.user?.id)
        throw new RequestError(
          "Le chargement de votre espace n’a pas été confirmé. Réessayez.",
          502,
        );
      return result;
    },
  });
  const selected = requested ?? selection.remembered;
  const workspace =
    requested !== null || selected ? q.data?.data.find((w) => w.id === selected) : q.data?.data[0];
  useEffect(() => {
    if (!workspace) return;
    if (requested === null)
      window.history.replaceState(
        null,
        "",
        workspaceHref(pathname + window.location.search + window.location.hash, workspace.id),
      );
  }, [workspace, requested, pathname]);
  function switchWorkspace(id: string) {
    if (!q.data?.data.some((w) => w.id === id)) return;
    const href = workspaceSwitchHref(pathname, window.location.hash, id);
    if (new URL(href, window.location.origin).pathname !== pathname) {
      router.push(href);
      return;
    }
    window.history.pushState(null, "", href);
    setSelection({ requested: id, remembered: id });
    cache.removeQueries({ queryKey: ["rows"] });
  }
  const objects = useQuery({
    queryKey: ["rows", workspace?.id, "objects"],
    enabled: !!workspace,
    queryFn: async () => {
      const result = await request<{ data: ObjectDefinition[] }>(
        "/api/" + workspace!.id + "/objects?size=100",
      );
      if (!Array.isArray(result.data))
        throw new RequestError("Le chargement des types de fiches a échoué. Réessayez.", 502);
      return result;
    },
  });
  if (q.isPending) return <div className="page-loader">Ouverture de votre espace…</div>;
  if (q.error)
    return (
      <div className="page-loader">
        <p>{q.error.message}</p>
        {q.error instanceof RequestError && q.error.status === 401 ? (
          <a href="/login">Se reconnecter</a>
        ) : (
          <button className="button" onClick={() => void q.refetch()}>
            Réessayer
          </button>
        )}
      </div>
    );
  const blocked = q.data?.mfa_blocked ?? [];
  // Workspaces requiring 2FA are hidden by RLS until the account has a second factor.
  if (blocked.length && (!q.data?.data.length || blocked.some((w) => w.id === requested)))
    return <SecondFactorRequired workspaces={blocked} />;
  if (!q.data?.data.length) redirect("/onboarding");
  if (!workspace)
    return (
      <main className="page-loader">
        <h1>Espace inaccessible</h1>
        <p role="alert">Ce lien désigne un espace auquel vous n’avez pas accès.</p>
        <p>Choisissez un de vos espaces pour continuer.</p>
        {q.data.data.map((w) => (
          <button className="button" key={w.id} onClick={() => switchWorkspace(w.id)}>
            {w.name}
          </button>
        ))}
      </main>
    );
  return (
    <Context.Provider
      value={{
        workspace,
        objects: objects.data?.data ?? [],
        user: q.data!.user,
        workspaces: q.data!.data,
        switchWorkspace,
      }}
    >
      <EditorDraftScope.Provider
        key={workspace.id}
        value={`${process.env.NEXT_PUBLIC_RELAY_ENVIRONMENT}:${process.env.NEXT_PUBLIC_SUPABASE_URL}:${q.data!.user.id}:${workspace.id}`}
      >
        <AppearanceProvider key={q.data!.user.id} user={q.data!.user.id}>
          {children}
        </AppearanceProvider>
      </EditorDraftScope.Provider>
    </Context.Provider>
  );
}
