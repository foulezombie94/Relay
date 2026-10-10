"use client";
import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { z } from "zod";
import {
  LayoutDashboard,
  ListChecks,
  FileText,
  MessageSquare,
  CheckCheck,
  ArrowRight,
  CalendarDays,
  LockKeyhole,
  RefreshCw,
  Megaphone,
  CircleCheck,
} from "lucide-react";
import {
  portalDetailSchema,
  portalDate,
  portalInitials,
  type PortalItem,
} from "@/lib/domain/portals";
import { usePortalResource } from "./use-portal-resource";
import {
  PortalHeader,
  PortalLoading,
  PortalError,
  Progress,
  SharedItem,
  PortalPagination,
} from "./shared";
import { PortalMessages } from "./messages";
import styles from "./portal.module.css";
const responseSchema = z.object({ data: portalDetailSchema });
const tabs = [
  { id: "overview", label: "Vue d’ensemble", Icon: LayoutDashboard },
  { id: "update", label: "Actualités", Icon: Megaphone },
  { id: "step", label: "Étapes", Icon: ListChecks },
  { id: "document", label: "Documents", Icon: FileText },
  { id: "decision", label: "Décisions", Icon: CheckCheck },
  { id: "messages", label: "Échanges", Icon: MessageSquare },
];
export function PortalSpace({ id }: { id: string }) {
  const [tab, setTab] = useState("overview");
  const [pages, setPages] = useState({ items: 0, comments: 0 });
  const type = ["overview", "messages"].includes(tab) ? "all" : tab;
  const resource = usePortalResource(
    "/api/portal/" +
      id +
      "?" +
      new URLSearchParams({
        type,
        items_page: String(pages.items),
        comments_page: String(pages.comments),
      }),
    responseSchema,
  );
  const data = resource.data?.data;
  function select(value: string) {
    setTab(value);
    setPages({ items: 0, comments: 0 });
  }
  const content = (items: PortalItem[], empty: string) => (
    <>
      {items.map((item) => (
        <SharedItem key={item.id} item={item} portalId={id} />
      ))}
      {!items.length && (
        <div className={styles.inlineEmpty}>
          <FileText size={24} />
          <h3>{empty}</h3>
          <p>Votre interlocuteur choisit les éléments à partager dans cet espace.</p>
        </div>
      )}
    </>
  );
  return (
    <div className={styles.spacePage}>
      <PortalHeader back />
      <Tabs.Root
        value={tab}
        onValueChange={select}
        orientation="vertical"
        className={styles.spaceLayout}
      >
        <aside className={styles.spaceSidebar}>
          <div className={styles.sidebarProject}>
            <span className={styles.portalAvatar}>
              {data ? portalInitials(data.portal.name) : <LayoutDashboard size={20} />}
            </span>
            <strong>{data?.portal.name ?? "Votre espace client"}</strong>
            <small>
              <i />
              Partage privé
            </small>
          </div>
          <Tabs.List className={styles.spaceNav} aria-label="Sections du portail">
            {tabs.map(({ id: section, label, Icon }) => (
              <Tabs.Trigger key={section} value={section}>
                <Icon size={16} />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          <div className={styles.sidebarNote}>
            <LockKeyhole size={17} />
            <strong>Un espace de confiance</strong>
            <p>Retrouvez uniquement les informations partagées pour votre projet.</p>
          </div>
        </aside>
        <main className={styles.spaceMain}>
          {resource.loading ? (
            <PortalLoading />
          ) : resource.error ? (
            <PortalError error={resource.error} retry={resource.reload} />
          ) : (
            data && (
              <>
                <div className={styles.spaceHeading}>
                  <div>
                    <span className={styles.eyebrow}>ESPACE CLIENT</span>
                    <h1>{data.portal.name}</h1>
                    <p>Avancez ensemble, avec une vue claire sur votre projet.</p>
                  </div>
                  <button className="button" onClick={resource.reload}>
                    <RefreshCw size={14} />
                    Actualiser
                  </button>
                </div>
                <div className={styles.projectInfo}>
                  <span>
                    <CalendarDays size={13} />
                    Activité : {portalDate(data.summary.last_activity_at)}
                  </span>
                  <span>
                    <LockKeyhole size={13} />
                    {data.can_comment ? "Consultation et échanges" : "Consultation"}
                  </span>
                </div>
                <Tabs.Content value="overview" className={styles.tabContent}>
                  <div className={styles.overviewStats}>
                    <button onClick={() => select("step")}>
                      <ListChecks size={18} />
                      <strong>
                        {data.summary.completed_steps}
                        <small> / {data.summary.step_count}</small>
                      </strong>
                      <span>Étapes terminées</span>
                    </button>
                    <button onClick={() => select("document")}>
                      <FileText size={18} />
                      <strong>{data.summary.document_count}</strong>
                      <span>Documents partagés</span>
                    </button>
                    <button onClick={() => select("decision")}>
                      <CheckCheck size={18} />
                      <strong>{data.summary.open_decisions}</strong>
                      <span>Décisions en cours</span>
                    </button>
                    <button onClick={() => select("messages")}>
                      <MessageSquare size={18} />
                      <strong>{data.summary.comment_count}</strong>
                      <span>Messages échangés</span>
                    </button>
                  </div>
                  <div className={styles.overviewColumns}>
                    <section className={styles.overviewPanel}>
                      <header className={styles.sectionHeading}>
                        <div>
                          <h2>Avancement du projet</h2>
                          <p>Les étapes que votre équipe partage avec vous.</p>
                        </div>
                        <CircleCheck size={18} />
                      </header>
                      <Progress summary={data.summary} />
                      {data.items
                        .filter((item) => item.type === "step")
                        .slice(0, 4)
                        .map((item) => (
                          <div className={styles.compactStep} key={item.id}>
                            <i data-done={["done", "approved"].includes(item.status)} />
                            <div>
                              <strong>{item.title}</strong>
                              <small>
                                {item.due_date ? portalDate(item.due_date) : "Sans échéance"}
                              </small>
                            </div>
                            <span>
                              {["done", "approved"].includes(item.status) ? "Terminé" : "En cours"}
                            </span>
                          </div>
                        ))}
                      {!data.items.some((item) => item.type === "step") && (
                        <p className={styles.panelHint}>
                          {data.summary.step_count
                            ? "Consultez l’onglet Étapes pour retrouver toutes les étapes partagées."
                            : "Les prochaines étapes apparaîtront ici une fois partagées."}
                        </p>
                      )}
                      <button className={styles.panelLink} onClick={() => select("step")}>
                        Voir toutes les étapes
                        <ArrowRight size={14} />
                      </button>
                    </section>
                    <section className={styles.overviewPanel}>
                      <header className={styles.sectionHeading}>
                        <div>
                          <h2>À suivre</h2>
                          <p>Les repères utiles pour la suite du projet.</p>
                        </div>
                      </header>
                      <div className={styles.nextDue}>
                        <span>
                          <CalendarDays size={20} />
                        </span>
                        <div>
                          <small>Prochaine échéance partagée</small>
                          <strong>
                            {data.summary.next_due_at
                              ? portalDate(data.summary.next_due_at)
                              : "Aucune échéance pour le moment"}
                          </strong>
                        </div>
                      </div>
                      <div className={styles.attentionRow}>
                        <CheckCheck size={16} />
                        <span>{data.summary.open_decisions} décisions en cours</span>
                        <button onClick={() => select("decision")}>
                          Consulter
                          <ArrowRight size={12} />
                        </button>
                      </div>
                      <div className={styles.attentionRow}>
                        <MessageSquare size={16} />
                        <span>Une question sur votre projet ?</span>
                        <button onClick={() => select("messages")}>
                          Échanger
                          <ArrowRight size={12} />
                        </button>
                      </div>
                      <p className={styles.panelHint}>
                        Les statuts et échéances sont tenus à jour par votre interlocuteur.
                      </p>
                    </section>
                  </div>
                  <section className={styles.latestSection}>
                    <header className={styles.sectionHeading}>
                      <div>
                        <h2>Derniers éléments partagés</h2>
                        <p>Les informations récentes de votre espace.</p>
                      </div>
                      <button className={styles.panelLink} onClick={() => select("update")}>
                        Voir les actualités
                        <ArrowRight size={14} />
                      </button>
                    </header>
                    {content(
                      data.items.slice(0, 4),
                      "Votre espace est prêt à accueillir ses premiers partages",
                    )}
                  </section>
                </Tabs.Content>
                {tabs
                  .filter((item) => !["overview", "messages"].includes(item.id))
                  .map(({ id: section, label, Icon }) => (
                    <Tabs.Content value={section} key={section} className={styles.tabContent}>
                      <header className={styles.sectionHeading}>
                        <div>
                          <h2>
                            <Icon size={18} />
                            {label}
                          </h2>
                          <p>
                            {section === "decision"
                              ? "Consultez les décisions et leur statut, mis à jour par votre interlocuteur."
                              : "Les éléments explicitement partagés dans votre portail."}
                          </p>
                        </div>
                        <span>{data.items_count} éléments</span>
                      </header>
                      {section === "step" && <Progress summary={data.summary} />}
                      <div
                        className={section === "document" ? styles.documentGrid : styles.itemList}
                      >
                        {content(data.items, "Aucun élément partagé dans cette rubrique")}
                      </div>
                      {data.items_count > 50 && (
                        <PortalPagination
                          page={pages.items}
                          count={data.items_count}
                          size={50}
                          label="éléments"
                          onPage={(items) => setPages({ ...pages, items })}
                        />
                      )}
                    </Tabs.Content>
                  ))}
                <Tabs.Content value="messages" className={styles.tabContent}>
                  <PortalMessages
                    data={data}
                    onPage={(comments) => setPages({ ...pages, comments })}
                    onSent={resource.reload}
                  />
                </Tabs.Content>
              </>
            )
          )}
        </main>
      </Tabs.Root>
    </div>
  );
}
