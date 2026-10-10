"use client";
import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { z } from "zod";
import {
  Plus,
  Copy,
  ArrowUpRight,
  FileText,
  Users,
  MessageSquare,
  Pencil,
  Trash2,
  LockKeyhole,
} from "lucide-react";
import { toast } from "sonner";
import { useRows, useSave, useWorkspace } from "../providers/data-provider";
import { Modal, Editor, ErrorMessage, str, type Field } from "../ui";
import { RequestError } from "@/lib/api/request";
import type { Row } from "@/lib/domain/types";
import {
  portalItemSchema,
  portalTypeLabels,
  portalStatusLabels,
  portalDate,
  portalDetailSchema,
} from "@/lib/domain/portals";
import { PortalLoading, SharedItem, PortalPagination } from "./shared";
import { PortalMessages } from "./messages";
import { usePortalResource } from "./use-portal-resource";
import styles from "./portal.module.css";
const discussionSchema = z.object({ data: portalDetailSchema });
function Discussion({ id }: { id: string }) {
  const [page, setPage] = useState(0);
  const result = usePortalResource(
    "/api/portal/" + id + "?comments_page=" + page,
    discussionSchema,
  );
  return result.loading ? (
    <PortalLoading />
  ) : result.error ? (
    <ErrorMessage error={result.error} />
  ) : result.data ? (
    <PortalMessages data={result.data.data} onPage={setPage} onSent={result.reload} />
  ) : null;
}
export function PortalSharing({ portal, onClose }: { portal: Row; onClose: () => void }) {
  const { workspace } = useWorkspace();
  const admin = ["owner", "admin"].includes(workspace.role);
  const readOnly = workspace.role === "viewer";
  const [tab, setTab] = useState("content");
  const [page, setPage] = useState(0);
  const [memberPage, setMemberPage] = useState(0);
  const items = useRows("portal_items", { portal_id: portal.id, size: 25, page });
  const members = useRows("portal_members", { portal_id: portal.id, size: 25, page: memberPage });
  const docs = useRows("documents", { record_id: str(portal.record_id), size: 100 });
  const { save, remove, busy } = useSave();
  const [editor, setEditor] = useState<{ resource: string; row?: Row } | null>(null);
  const [deletion, setDeletion] = useState<Row | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const accessLost = [items.error, members.error, docs.error].some(
    (error) => error instanceof RequestError && [401, 403].includes(error.status),
  );
  const fields: Field[] =
    editor?.resource === "portal_members"
      ? [
          { key: "email", label: "Adresse email autorisée", type: "email", required: true },
          { key: "can_comment", label: "Autoriser les commentaires", type: "checkbox" },
          {
            key: "expires_at",
            label: "Expiration de l’accès",
            type: "datetime-local",
            nullable: true,
          },
          { key: "revoked", label: "Révoquer cet accès", type: "checkbox" },
        ]
      : [
          { key: "title", label: "Titre", required: true },
          { key: "content", label: "Contenu visible du client", type: "textarea" },
          {
            key: "type",
            label: "Rubrique",
            type: "select",
            options: Object.entries(portalTypeLabels).map(([value, label]) => ({ value, label })),
          },
          {
            key: "status",
            label: "Statut",
            type: "select",
            options: Object.entries(portalStatusLabels).map(([value, label]) => ({ value, label })),
          },
          { key: "due_date", label: "Échéance", type: "datetime-local", nullable: true },
          {
            key: "document_id",
            label: "Document explicitement partagé",
            type: "select",
            nullable: true,
            options: (!docs.isError ? (docs.data?.data ?? []) : []).map((document) => ({
              value: document.id,
              label: str(document.name),
            })),
          },
        ];
  return (
    <Modal
      open
      onClose={onClose}
      title={str(portal.name)}
      description="Choisissez les informations partagées et les personnes qui peuvent les consulter."
      wide
      className={styles.sharingModal}
    >
      {accessLost ? (
        <ErrorMessage
          error={
            new Error(
              "Votre accès à ce portail a changé. Fermez cette fenêtre et actualisez la page.",
            )
          }
        />
      ) : (
        <>
          <div className={styles.sharingLink}>
            <span className={styles.pageIcon}>
              <LockKeyhole size={22} />
            </span>
            <div>
              <strong>Un lien, des accès maîtrisés</strong>
              <p>
                Le client se connecte avec son adresse autorisée. L’ajout d’un accès n’envoie pas
                d’email : partagez le lien avec votre interlocuteur.
              </p>
              <small>
                {portal.enabled
                  ? "Le portail est actif."
                  : "Le portail est en pause. Les clients ne peuvent pas l’ouvrir."}
              </small>
            </div>
            <div className={styles.tools}>
              <button
                className="button small"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      new URL("/portal/" + portal.id, window.location.origin).toString(),
                    );
                    toast.success("Lien du portail copié.");
                  } catch {
                    toast.error("Copie impossible.");
                  }
                }}
              >
                <Copy size={13} />
                Copier le lien
              </button>
              {!!portal.enabled && (
                <a
                  className="button small"
                  href={"/portal/" + portal.id}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Voir le portail
                  <ArrowUpRight size={13} />
                </a>
              )}
            </div>
          </div>
          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List className={styles.sharingTabs} aria-label="Gérer le portail">
              <Tabs.Trigger value="content">
                <FileText size={14} />
                Contenu partagé
              </Tabs.Trigger>
              <Tabs.Trigger value="access">
                <Users size={14} />
                Accès clients
              </Tabs.Trigger>
              <Tabs.Trigger value="messages">
                <MessageSquare size={14} />
                Échanges
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="content">
              <header className={styles.sectionHeading}>
                <div>
                  <h2>Éléments visibles du client</h2>
                  <p>Chaque élément ajouté ici est visible par les participants autorisés.</p>
                </div>
                <button
                  className="button primary small"
                  disabled={readOnly}
                  onClick={() => setEditor({ resource: "portal_items" })}
                >
                  <Plus size={14} />
                  Partager un élément
                </button>
              </header>
              <ErrorMessage error={items.error} />
              {items.isPending ? (
                <PortalLoading />
              ) : (
                !items.isError && (
                  <>
                    {items.data?.data.map((item) => {
                      const parsed = portalItemSchema.safeParse(item);
                      return (
                        <div key={item.id} className={styles.managedItem}>
                          {parsed.success && <SharedItem item={parsed.data} portalId={portal.id} />}
                          <div className={styles.itemActions}>
                            <button
                              className="button small"
                              disabled={readOnly}
                              onClick={() => setEditor({ resource: "portal_items", row: item })}
                            >
                              <Pencil size={12} />
                              Modifier
                            </button>
                            <button
                              className="button small"
                              disabled={readOnly || busy}
                              onClick={() => setDeletion(item)}
                            >
                              <Trash2 size={12} />
                              Retirer
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {!items.data?.data.length && (
                      <div className={styles.inlineEmpty}>
                        <FileText size={25} />
                        <h3>Composez votre espace client</h3>
                        <p>
                          Partagez une actualité, une étape, une décision ou un document depuis le
                          bouton ci-dessus.
                        </p>
                      </div>
                    )}
                    {(items.data?.count ?? 0) > 25 && (
                      <PortalPagination
                        page={page}
                        count={items.data?.count ?? 0}
                        size={25}
                        label="éléments"
                        onPage={setPage}
                      />
                    )}
                  </>
                )
              )}
            </Tabs.Content>
            <Tabs.Content value="access">
              <header className={styles.sectionHeading}>
                <div>
                  <h2>Personnes autorisées</h2>
                  <p>Définissez les droits de commentaire et la durée des accès.</p>
                </div>
                {admin && (
                  <button
                    className="button primary small"
                    onClick={() => setEditor({ resource: "portal_members" })}
                  >
                    <Plus size={14} />
                    Autoriser un client
                  </button>
                )}
              </header>
              {!admin ? (
                <div className={styles.readOnly}>
                  <LockKeyhole size={16} />
                  La gestion des adresses et des accès est réservée aux administrateurs.
                </div>
              ) : (
                <>
                  <ErrorMessage error={members.error} />
                  {members.isPending ? (
                    <PortalLoading />
                  ) : (
                    !members.isError && (
                      <>
                        {members.data?.data.map((member) => {
                          const expired =
                            !!member.expires_at &&
                            Date.parse(str(member.expires_at)) <= members.dataUpdatedAt;
                          return (
                            <article key={member.id} className={styles.memberRow}>
                              <span className={styles.messageAvatar}>
                                {str(member.email).slice(0, 1).toUpperCase()}
                              </span>
                              <div>
                                <strong>{str(member.email)}</strong>
                                <small>
                                  {member.can_comment
                                    ? "Consultation et commentaires"
                                    : "Consultation uniquement"}{" "}
                                  ·{" "}
                                  {member.expires_at
                                    ? "Expire le " + portalDate(str(member.expires_at), true)
                                    : "Sans expiration"}
                                </small>
                              </div>
                              <span
                                className={styles.status}
                                data-done={!member.revoked && !expired}
                              >
                                {member.revoked
                                  ? "Révoqué"
                                  : expired
                                    ? "Expiré"
                                    : member.user_id
                                      ? "Actif"
                                      : "Autorisé"}
                              </span>
                              <button
                                className="button small"
                                onClick={() =>
                                  setEditor({ resource: "portal_members", row: member })
                                }
                              >
                                <Pencil size={12} />
                                Modifier
                              </button>
                            </article>
                          );
                        })}
                        {!members.data?.data.length && (
                          <div className={styles.inlineEmpty}>
                            <Users size={25} />
                            <h3>Choisissez les participants</h3>
                            <p>
                              Autorisez l’adresse de votre client puis transmettez-lui le lien du
                              portail.
                            </p>
                          </div>
                        )}
                        {(members.data?.count ?? 0) > 25 && (
                          <PortalPagination
                            page={memberPage}
                            count={members.data?.count ?? 0}
                            size={25}
                            label="accès"
                            onPage={setMemberPage}
                          />
                        )}
                      </>
                    )
                  )}
                </>
              )}
            </Tabs.Content>
            <Tabs.Content value="messages">
              {portal.enabled ? (
                <Discussion id={portal.id} />
              ) : (
                <div className={styles.readOnly}>
                  Réactivez le portail pour consulter son espace d’échanges.
                </div>
              )}
            </Tabs.Content>
          </Tabs.Root>
          {editor && (
            <Editor
              key={editor.row?.id ?? editor.resource}
              open
              onClose={() => setEditor(null)}
              title={editor.resource === "portal_members" ? "Accès client" : "Élément partagé"}
              fields={fields}
              initial={editor.row ?? { type: "update", status: "open", can_comment: true }}
              busy={busy}
              onSave={(values) =>
                save(
                  editor.resource,
                  { ...values, ...(!editor.row ? { portal_id: portal.id } : {}) },
                  editor.row,
                )
              }
            />
          )}
          <Modal
            open={!!deletion}
            onClose={() => setDeletion(null)}
            title="Retirer cet élément du portail ?"
            description="Le client ne pourra plus consulter cet élément ni télécharger son document depuis ce portail. Le document d’origine est conservé."
          >
            <div className={styles.tools}>
              <button className="button" onClick={() => setDeletion(null)}>
                Annuler
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  if (!deletion) return;
                  setError(null);
                  try {
                    await remove("portal_items", deletion.id);
                    setDeletion(null);
                  } catch (e) {
                    setError(e instanceof Error ? e : new Error("Retrait impossible."));
                  }
                }}
              >
                Retirer le partage
              </button>
            </div>
            <ErrorMessage error={error} />
          </Modal>
        </>
      )}
    </Modal>
  );
}
