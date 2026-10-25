"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppSidebarView } from "../layout/app-sidebar-view";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "../ui/sidebar";
import { AssistantWelcome, AssistantQuickActions } from "./start";
import { AssistantComposerView, type RecordContext } from "./composer-view";
import type { Workspace } from "@/lib/domain/types";
import styles from "./assistant.module.css";
const workspace: Workspace = {
  id: "demo",
  workspace_id: "demo",
  created_at: "2026-10-01T12:00:00Z",
  name: "Équipe Rivage",
  role: "viewer",
  currency: "EUR",
  timezone: "Europe/Paris",
  locale: "fr-FR",
};
const records = [
  { id: "11111111-1111-4111-8111-111111111111", display_name: "Studio Rivage" },
  { id: "22222222-2222-4222-8222-222222222222", display_name: "Maison Atlas" },
];
export function AssistantStartDemo() {
  const router = useRouter();
  const [message, setMessage] = useState(""),
    [context, setContext] = useState<RecordContext>(null),
    [deepen, setDeepen] = useState(false),
    [contextOpen, setContextOpen] = useState(false),
    [search, setSearch] = useState(""),
    [sent, setSent] = useState("");
  function reset() {
    setSent("");
    setMessage("");
  }
  return (
    <SidebarProvider interactive={false} data-relay-ui>
      <AppSidebarView
        workspace={workspace}
        workspaces={[workspace]}
        switchWorkspace={() => {}}
        objects={[]}
        user={{ id: "demo", email: "marie@rivage.example" }}
        path="/app/assistant"
        onSignOut={() => {
          router.push("/login");
        }}
        persistPreferences={false}
      />
      <SidebarInset>
        <section
          className={styles.layout}
          data-history="false"
          data-view={sent ? "conversation" : "welcome"}
          aria-label="Aperçu de Nouvelle discussion"
        >
          <div className={styles.main}>
            <header className={"sb-topbar " + styles.header}>
              <SidebarTrigger />
              <span className="sb-topbar-divider" />
              <span className="sb-breadcrumb-current">Nouvelle discussion</span>
              <div className={styles.headerActions}>
                <span className={styles.demoBadge}>Démonstration</span>
                <Link href="/app/assistant" prefetch={false} className={styles.help}>
                  Ouvrir mon espace
                </Link>
              </div>
            </header>
            {!sent && <AssistantWelcome />}
            {sent && (
              <div className={styles.thread}>
                <div className={styles.messages}>
                  <div className={styles.userMessage}>{sent}</div>
                  <p className={styles.demoMessage}>
                    Cet aperçu n’envoie aucun message à une IA. Retrouvez vos données et votre
                    historique dans votre espace.
                  </p>
                  <button type="button" className="button" onClick={reset}>
                    Nouvelle discussion
                  </button>
                </div>
              </div>
            )}
            <AssistantComposerView
              message={message}
              setMessage={setMessage}
              context={context}
              setContext={setContext}
              busy={false}
              configured
              model="Aperçu local"
              deepen={deepen}
              setDeepen={setDeepen}
              placement={sent ? "bottom" : "top"}
              onSend={() => {
                if (message.trim()) {
                  setSent(message.trim());
                  setMessage("");
                }
              }}
              onStop={() => {}}
              contextOpen={contextOpen}
              setContextOpen={setContextOpen}
              recordSearch={search}
              setRecordSearch={setSearch}
              records={{
                loading: false,
                data: records.filter((record) =>
                  record.display_name
                    .toLocaleLowerCase("fr")
                    .includes(search.toLocaleLowerCase("fr")),
                ),
              }}
              prefetchPrivate={false}
            />
            {!sent && <AssistantQuickActions disabled={false} onChoose={setMessage} />}
            {!sent && (
              <p className={styles.demoNote}>
                Aperçu interactif · Données fictives · Aucun appel à une IA
              </p>
            )}
          </div>
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}
