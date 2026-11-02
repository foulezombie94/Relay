import { consentContext } from "@/lib/mcp/consent-context";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase/server";
import { assertAuthAvailable } from "@/lib/supabase/session";
import { flowCookie } from "@/lib/mcp/config";
import { oauthDb, hash, flowDestination } from "@/lib/mcp/database";
import { McpConsent } from "@/components/mcp/consent";
import styles from "@/components/mcp/mcp.module.css";
export const dynamic = "force-dynamic";
export default async function ConsentPage() {
  const jar = await cookies();
  const flow = jar.get(flowCookie)?.value;
  if (!flow || !/^[A-Za-z0-9_-]{43}$/.test(flow))
    return (
      <main className={styles.consent}>
        <h1>Connexion expirée</h1>
        <p>Relancez la connexion OAuth depuis Claude Code ou Codex.</p>
        <Link href="/mcp">Guide de connexion</Link>
      </main>
    );
  const client = await db();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  assertAuthAvailable(error);
  if (!user || error) redirect("/login?next=/mcp/authorize");
  let info: { client_name: string; scopes: string[] };
  let destination: Awaited<ReturnType<typeof flowDestination>>;
  try {
    info = await oauthDb("flow", { flow_hash: hash(flow) });
    destination = await flowDestination(hash(flow));
  } catch {
    return (
      <main className={styles.consent}>
        <h1>Connexion expirée</h1>
        <p>Relancez la connexion depuis votre client MCP.</p>
        <Link href="/mcp">Guide de connexion</Link>
      </main>
    );
  }
  const memberships = await client
    .from("memberships")
    .select("role,workspaces(id,name)")
    .eq("user_id", user.id)
    .limit(100);
  if (memberships.error) throw new Error("Workspace lookup unavailable");
  const workspaces = (memberships.data ?? []).flatMap((row) => {
    const w = row.workspaces as unknown as { id: string; name: string } | null;
    return w ? [{ ...w, role: row.role }] : [];
  });
  if (!workspaces.length)
    return (
      <main className={styles.consent}>
        <h1>Créez votre espace Zyliad</h1>
        <p>Un espace de travail est nécessaire pour connecter votre client MCP.</p>
        <Link href="/onboarding">Créer mon espace</Link>
      </main>
    );
  return (
    <McpConsent
      consentContext={consentContext(flow)}
      clientName={info.client_name}
      destination={destination}
      requestedScopes={info.scopes}
      workspaces={workspaces}
    />
  );
}
