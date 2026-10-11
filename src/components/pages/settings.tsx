"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Search,
  UserRound,
  Palette,
  Mail,
  Video,
  Bell,
  Sparkles,
  Building2,
  Users,
  Database,
  Gauge,
  CreditCard,
  Code2,
  History,
  HelpCircle,
  ChevronRight,
  ShieldCheck,
  Globe,
  Pencil,
  Plus,
  SlidersHorizontal,
  Check,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, useSave, request } from "../providers/data-provider";
import { Editor, str, ErrorMessage, type Field } from "../ui";
import { RepeatFields } from "../ui/structured-fields";
import { TeamSettings } from "../settings/team-settings";
import { SettingsAppearance } from "../settings/appearance";
import { SettingsUsage, SettingsAgent } from "../settings/usage";
import { IntegrationsPage } from "./integrations";
import { Notifications } from "../layout/notifications";
import { ZapierConnection } from "../integrations/zapier-connection";
import { McpConnection } from "../mcp/connection";
import { browserDb } from "@/lib/supabase/client";
import type { Row } from "@/lib/domain/types";
import styles from "../settings/settings.module.css";

const sections = [
  {
    id: "profil",
    label: "Profil",
    group: "Personnel",
    icon: UserRound,
    description: "Votre identité et les espaces qui vous réunissent.",
  },
  {
    id: "apparence",
    label: "Apparence",
    group: "Personnel",
    icon: Palette,
    description: "Une interface qui vous ressemble, jusque dans les détails.",
  },
  {
    id: "comptes",
    label: "Emails et calendriers",
    group: "Personnel",
    icon: Mail,
    description: "Vos échanges et vos rendez-vous, réunis dans Zyliad.",
  },
  {
    id: "reunions",
    label: "Intelligence des réunions",
    group: "Personnel",
    icon: Video,
    description: "Connectez vos réunions et retrouvez leurs transcriptions.",
  },
  {
    id: "notifications",
    label: "Notifications",
    group: "Personnel",
    icon: Bell,
    description: "Les bonnes informations, au bon moment.",
  },
  {
    id: "assistant",
    label: "Ask Zyliad",
    group: "Personnel",
    icon: Sparkles,
    description: "Votre assistant CRM, ses sources et ses autorisations.",
  },
  {
    id: "organisation",
    label: "Général",
    group: "Espace de travail",
    icon: Building2,
    description: "Les informations qui définissent votre espace de travail.",
  },
  {
    id: "equipe",
    label: "Membres et accès",
    group: "Espace de travail",
    icon: Users,
    description: "Une équipe alignée, avec les bons accès pour chacun.",
  },
  {
    id: "donnees",
    label: "Objets et champs",
    group: "Espace de travail",
    icon: Database,
    description: "Un CRM organisé autour de votre façon de travailler.",
  },
  {
    id: "utilisation",
    label: "Utilisation Ask Zyliad",
    group: "Espace de travail",
    icon: Gauge,
    description: "Gardez un œil sur les analyses et les budgets de votre espace.",
  },
  {
    id: "facturation",
    label: "Facturation",
    group: "Espace de travail",
    icon: CreditCard,
    description: "Votre espace, son utilisation et les informations de facturation.",
  },
  {
    id: "integrations",
    label: "Intégrations",
    group: "Espace de travail",
    icon: Code2,
    description: "Le store, vos connexions et les permissions de leurs actions IA.",
  },
  {
    id: "developpeurs",
    label: "Développeurs",
    group: "Espace de travail",
    icon: Code2,
    description: "Reliez Zyliad à vos outils et à vos automatisations.",
  },
  {
    id: "activite",
    label: "Historique d’activité",
    group: "Espace de travail",
    icon: History,
    description: "Retrouvez les opérations enregistrées dans votre espace.",
  },
] as const;
type Section = (typeof sections)[number]["id"];
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function hashSnapshot() {
  return window.location.hash.slice(1);
}
function sectionId(hash: string): Section {
  const aliases: Record<string, string> = {
    appearance: "apparence",
    general: "organisation",
    team: "equipe",
    billing: "facturation",
    profile: "profil",
    usage: "utilisation",
  };
  const id = aliases[hash] || hash;
  return sections.find((s) => s.id === id)?.id ?? "apparence";
}
const roles: Record<string, string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  member: "Membre",
  viewer: "Lecteur",
};
export function SettingsPage() {
  const { workspace } = useWorkspace();
  return <SettingsView key={workspace.id} />;
}
function SettingsView() {
  const router = useRouter();
  const { workspace, objects, user, workspaces, switchWorkspace } = useWorkspace();
  const admin = ["owner", "admin"].includes(workspace.role);
  const hash = useSyncExternalStore(subscribeHash, hashSnapshot, () => "");
  const selected = sectionId(hash);
  const current = sections.find((s) => s.id === selected)!;
  const CurrentIcon = current.icon;
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const cache = useQueryClient();
  const { save, busy } = useSave();
  const attrs = useQuery({
    queryKey: ["rows", workspace.id, "attributes", { size: 100 }],
    enabled: selected === "donnees",
    queryFn: () =>
      request<{ data: Row[]; count: number }>(`/api/${workspace.id}/attributes?size=100`),
  });
  const audit = useQuery({
    queryKey: ["rows", workspace.id, "audit_events", { size: 30 }],
    enabled: selected === "activite",
    queryFn: () =>
      request<{ data: Row[]; count: number }>(`/api/${workspace.id}/audit_events?size=30`),
  });
  const visible = useMemo(
    () => sections.filter((s) => normalize(s.label + " " + s.group).includes(normalize(search))),
    [search],
  );
  const forms: Record<string, Field[]> = {
    workspace: [
      { key: "name", label: "Nom de l’espace", required: true },
      { key: "timezone", label: "Fuseau horaire", required: true },
      { key: "currency", label: "Devise par défaut", required: true },
      {
        key: "locale",
        label: "Langue",
        type: "select",
        options: [
          { value: "fr", label: "Français" },
          { value: "en", label: "English" },
        ],
      },
    ],
    objects: [
      { key: "name", label: "Nom de l’objet", required: true },
      { key: "slug", label: "Identifiant — lettres minuscules", required: true },
    ],
    attributes: [
      {
        key: "object_id",
        label: "Objet",
        type: "select",
        required: true,
        options: objects.map((o) => ({ value: o.id, label: o.name })),
      },
      { key: "name", label: "Nom affiché", required: true },
      { key: "key", label: "Identifiant — lettres minuscules", required: true },
      {
        key: "type",
        label: "Type",
        type: "select",
        required: true,
        options: [
          "text",
          "number",
          "money",
          "date",
          "datetime",
          "boolean",
          "select",
          "multi_select",
          "email",
          "phone",
          "url",
          "location",
          "user",
          "relation",
        ].map((v) => ({ value: v, label: v })),
      },
      { key: "required", label: "Champ obligatoire", type: "checkbox" },
      {
        key: "options",
        label: "Options proposées",
        type: "custom",
        render: (initial, name) => <RepeatFields kind="options" initial={initial} name={name} />,
      },
    ],
  };
  const displayName = (user.email?.split("@")[0] || "Votre compte").replace(/[._-]+/g, " ");
  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Navigation des paramètres">
        <header className={styles.sidebarHeading}>
          <Link href="/app/dashboard" aria-label="Retour au CRM" title="Retour au CRM">
            <ArrowLeft size={17} />
          </Link>
          <span>Paramètres</span>
        </header>
        <div className={styles.settingsSearch}>
          <Search size={15} />
          <input
            aria-label="Rechercher un paramètre"
            placeholder="Rechercher un paramètre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Effacer la recherche">
              ×
            </button>
          )}
        </div>
        <nav className={styles.navigation} aria-label="Sections des paramètres">
          {["Personnel", "Espace de travail"].map((group) => (
            <div className={styles.navGroup} key={group}>
              {visible.some((s) => s.group === group) && <span>{group}</span>}
              {visible
                .filter((s) => s.group === group)
                .map(({ id, label, icon: Icon }) => (
                  <a key={id} href={"#" + id} aria-current={selected === id ? "page" : undefined}>
                    <Icon size={16} />
                    <span>{label}</span>
                    {selected === id && <i />}
                  </a>
                ))}
            </div>
          ))}
          {!visible.length && (
            <div className={styles.searchEmpty}>
              <Search size={20} />
              <strong>Aucun paramètre trouvé</strong>
              <button type="button" onClick={() => setSearch("")}>
                Effacer la recherche
              </button>
            </div>
          )}
        </nav>
        <div className={styles.sidebarFooter}>
          <Link href="/doc">
            <HelpCircle size={16} />
            <span>Aide et documentation</span>
            <ArrowUpRight size={13} />
          </Link>
          <div className={styles.sidebarWorkspace}>
            <span>{workspace.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{workspace.name}</strong>
              <small>Espace de travail</small>
            </div>
            <ShieldCheck size={14} />
          </div>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <CurrentIcon size={16} />
            <span>{current.label}</span>
          </div>
          <select
            className={styles.mobileSelect}
            aria-label="Choisir une section des paramètres"
            value={selected}
            onChange={(e) => {
              window.location.hash = e.target.value;
              setSearch("");
            }}
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <Link href="/doc" aria-label="Aide sur les paramètres">
            <HelpCircle size={16} />
            <span>Aide</span>
          </Link>
        </header>
        <div className={styles.content} key={selected}>
          <div className={styles.pageHeading}>
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </div>
          {selected === "apparence" && <SettingsAppearance />}
          {selected === "profil" && (
            <>
              <div className={styles.profileCard}>
                <span className={styles.profileAvatar}>
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h2>{displayName}</h2>
                  <p>{user.email || "Email non renseigné"}</p>
                  <span className={styles.softBadge}>{roles[workspace.role]}</span>
                </div>
              </div>
              <section className={styles.settingSection}>
                <div className={styles.sectionCopy}>
                  <h2>Votre compte</h2>
                  <p>Votre identité de connexion dans Zyliad.</p>
                </div>
                <div className={styles.infoRows}>
                  <div>
                    <span>Adresse email</span>
                    <strong>{user.email || "Non renseignée"}</strong>
                  </div>
                  <div>
                    <span>Rôle dans cet espace</span>
                    <strong>{roles[workspace.role]}</strong>
                  </div>
                  <div>
                    <span>Préférences d’affichage</span>
                    <a href="#apparence">
                      Personnaliser <ChevronRight size={14} />
                    </a>
                  </div>
                </div>
              </section>
              <section className={styles.settingSection}>
                <div className={styles.sectionCopy}>
                  <h2>Vos espaces de travail</h2>
                  <p>Chaque espace conserve ses données et ses autorisations.</p>
                </div>
                <div className={styles.workspaceList}>
                  {workspaces.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => switchWorkspace(w.id)}
                      aria-pressed={w.id === workspace.id}
                    >
                      <span className={styles.workspaceAvatar}>
                        {w.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{w.name}</strong>
                        <small>{roles[w.role]}</small>
                      </span>
                      {w.id === workspace.id ? <Check size={16} /> : <ChevronRight size={15} />}
                    </button>
                  ))}
                </div>
              </section>
              <div className={styles.sessionRow}>
                <div>
                  <strong>Session actuelle</strong>
                  <p>Connecté avec votre compte Zyliad.</p>
                </div>
                <button
                  className="button small"
                  disabled={signingOut}
                  onClick={async () => {
                    setSigningOut(true);
                    try {
                      const { error } = await browserDb().auth.signOut({ scope: "local" });
                      if (error) throw error;
                      router.replace("/login");
                      router.refresh();
                    } catch {
                      toast.error("La déconnexion a échoué. Réessayez.");
                      setSigningOut(false);
                    }
                  }}
                >
                  <LogOut size={14} />
                  Se déconnecter
                </button>
              </div>
            </>
          )}
          {selected === "organisation" && (
            <>
              <div className={styles.workspaceHero}>
                <span className={styles.workspaceHeroIcon}>
                  <Building2 size={25} />
                </span>
                <div>
                  <h2>{workspace.name}</h2>
                  <p>Un espace pour toute votre relation client.</p>
                </div>
                <span className={styles.softBadge}>{roles[workspace.role]}</span>
              </div>
              <section className={styles.settingSection}>
                <div className={styles.sectionHeading}>
                  <div className={styles.sectionCopy}>
                    <h2>Informations générales</h2>
                    <p>Les préférences communes à votre équipe.</p>
                  </div>
                  <button
                    className="button small"
                    disabled={!admin}
                    onClick={() => setEdit("workspace")}
                  >
                    <Pencil size={13} />
                    Modifier
                  </button>
                </div>
                <div className={styles.infoRows}>
                  <div>
                    <span>Nom de l’espace</span>
                    <strong>{workspace.name}</strong>
                  </div>
                  <div>
                    <span>
                      <Globe size={14} />
                      Fuseau horaire
                    </span>
                    <strong>{workspace.timezone}</strong>
                  </div>
                  <div>
                    <span>Devise par défaut</span>
                    <strong>{workspace.currency}</strong>
                  </div>
                  <div>
                    <span>Langue préférée</span>
                    <strong>{workspace.locale === "en" ? "English" : "Français"}</strong>
                  </div>
                </div>
                <p className={styles.systemHint}>
                  La préférence de langue est enregistrée pour l’espace. L’interface actuelle est en
                  français.
                </p>
                {!admin && (
                  <p className={styles.systemHint}>
                    Un administrateur peut modifier les informations de cet espace.
                  </p>
                )}
              </section>
              <div className={styles.shortcuts}>
                <a href="#equipe">
                  <span>
                    <Users size={19} />
                  </span>
                  <div>
                    <strong>Membres et accès</strong>
                    <small>Une place pour chaque collaborateur.</small>
                  </div>
                  <ChevronRight size={15} />
                </a>
                <Link href="/app/pipelines">
                  <span>
                    <SlidersHorizontal size={19} />
                  </span>
                  <div>
                    <strong>Pipelines commerciaux</strong>
                    <small>Vos étapes, vos règles, votre rythme.</small>
                  </div>
                  <ChevronRight size={15} />
                </Link>
              </div>
            </>
          )}
          {selected === "equipe" && (
            <div className={styles.teamContainer}>
              <TeamSettings />
            </div>
          )}
          {selected === "comptes" && (
            <div className={styles.integrationContainer}>
              <IntegrationsPage
                embedded
                providers={["gmail", "outlook", "google-calendar", "outlook-calendar"]}
              />
            </div>
          )}
          {selected === "reunions" && (
            <div className={styles.integrationContainer}>
              <IntegrationsPage embedded providers={["google-meet", "microsoft-teams", "zoom"]} />
            </div>
          )}
          {selected === "notifications" && (
            <div className={styles.notificationContainer}>
              <Notifications embedded />
            </div>
          )}
          {selected === "assistant" && (
            <>
              <SettingsAgent />
              <div className={styles.shortcuts}>
                <a href="#integrations">
                  <span>
                    <ShieldCheck size={19} />
                  </span>
                  <div>
                    <strong>Permissions des intégrations</strong>
                    <small>
                      Ouvrez une app connectée pour gérer ses autorisations et confirmations.
                    </small>
                  </div>
                  <ChevronRight size={15} />
                </a>
              </div>
            </>
          )}
          {selected === "integrations" && (
            <div className={styles.integrationContainer}>
              <IntegrationsPage />
            </div>
          )}
          {selected === "utilisation" && <SettingsUsage />}
          {selected === "facturation" && <SettingsUsage billing />}
          {selected === "developpeurs" && (
            <>
              <McpConnection key={workspace.id} />
              <div className={styles.inlineNotice}>
                <ShieldCheck size={16} />
                Les clés d’intégration restent limitées à leur espace, leurs permissions et leur
                durée de validité.
              </div>
              <div className={styles.integrationContainer}>
                <ZapierConnection />
              </div>
              <div className={styles.shortcuts}>
                <Link href="/app/workflows">
                  <span>
                    <Code2 size={19} />
                  </span>
                  <div>
                    <strong>Webhooks et automatisations</strong>
                    <small>Préparez vos workflows dans Zyliad.</small>
                  </div>
                  <ArrowUpRight size={15} />
                </Link>
                <Link href="/doc">
                  <span>
                    <HelpCircle size={19} />
                  </span>
                  <div>
                    <strong>Documentation</strong>
                    <small>Connexion des services et aide CRM.</small>
                  </div>
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </>
          )}
          {selected === "donnees" && (
            <>
              <div className={styles.sectionHeading}>
                <div className={styles.sectionCopy}>
                  <h2>Votre modèle de données</h2>
                  <p>Les objets de votre CRM et leurs champs personnalisés.</p>
                </div>
                <div className={styles.actions}>
                  <button
                    className="button small"
                    disabled={!admin}
                    onClick={() => setEdit("objects")}
                  >
                    <Plus size={14} />
                    Créer un objet
                  </button>
                  <button
                    className="button primary small"
                    disabled={!admin}
                    onClick={() => setEdit("attributes")}
                  >
                    <Plus size={14} />
                    Ajouter un champ
                  </button>
                </div>
              </div>
              <ErrorMessage error={attrs.error} />
              <div className={styles.objectList}>
                {objects.map((o) => (
                  <section key={o.id}>
                    <div className={styles.objectHeading}>
                      <span>
                        <Database size={17} />
                      </span>
                      <div>
                        <h3>{o.name}</h3>
                        <small>{o.slug}</small>
                      </div>
                      <span className={styles.softBadge}>
                        {o.standard ? "Objet standard" : "Personnalisé"}
                      </span>
                    </div>
                    {attrs.isPending ? (
                      <p className={styles.systemHint}>Chargement des champs…</p>
                    ) : (
                      attrs.data?.data
                        .filter((a) => a.object_id === o.id)
                        .map((a) => (
                          <div className={styles.attributeRow} key={a.id}>
                            <div>
                              <strong>{str(a.name)}</strong>
                              <small>
                                {str(a.type)}
                                {a.required ? " · obligatoire" : ""}
                                {a.archived ? " · archivé" : ""}
                              </small>
                            </div>
                            <button
                              className="button small"
                              disabled={!admin || busy}
                              onClick={() =>
                                void save("attributes", { archived: !a.archived }, a).catch(
                                  () => {},
                                )
                              }
                            >
                              {a.archived ? "Réactiver" : "Archiver"}
                            </button>
                          </div>
                        ))
                    )}
                  </section>
                ))}
              </div>
              {attrs.data && attrs.data.count > attrs.data.data.length && (
                <p className={styles.systemHint}>
                  {attrs.data.data.length} champs affichés sur {attrs.data.count}. Cette vue charge
                  les 100 premiers champs.
                </p>
              )}
            </>
          )}
          {selected === "activite" && (
            <>
              <ErrorMessage error={audit.error} />
              <div className={styles.auditList}>
                {audit.isPending ? (
                  <p>Chargement de l’activité…</p>
                ) : (
                  audit.data?.data.map((a) => (
                    <article key={a.id}>
                      <span>
                        <History size={16} />
                      </span>
                      <div>
                        <strong>{str(a.entity)}</strong>
                        <p>{str(a.action)}</p>
                      </div>
                      <time dateTime={a.created_at}>
                        {new Date(a.created_at).toLocaleString("fr-FR")}
                      </time>
                    </article>
                  ))
                )}
                {!audit.error && audit.data?.data.length === 0 && (
                  <div className={styles.emptyState}>
                    <History size={28} />
                    <h2>Un historique encore tranquille</h2>
                    <p>Les opérations enregistrées dans cet espace apparaîtront ici.</p>
                  </div>
                )}
              </div>
              {audit.data && audit.data.count > audit.data.data.length && (
                <p className={styles.systemHint}>
                  Les {audit.data.data.length} dernières opérations sont affichées sur{" "}
                  {audit.data.count}.
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {edit && (
        <Editor
          open
          key={edit}
          title={
            edit === "workspace"
              ? "Informations de l’espace"
              : edit === "objects"
                ? "Nouvel objet"
                : "Nouveau champ"
          }
          fields={forms[edit]}
          initial={
            edit === "workspace"
              ? workspace
              : edit === "attributes"
                ? { type: "text", options: [] }
                : {}
          }
          onClose={() => setEdit(null)}
          busy={busy}
          onSave={async (v) => {
            if (edit === "workspace") {
              await request("/api/workspaces", "PATCH", { id: workspace.id, values: v });
              await cache.invalidateQueries({ queryKey: ["workspaces"] });
              toast.success("Informations de l’espace enregistrées.");
            } else await save(edit, v);
          }}
        />
      )}
    </div>
  );
}
