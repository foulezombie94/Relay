"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Globe,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
  Workflow,
} from "lucide-react";
import { AppLogo } from "./app-logo";
import { categoryName, type CatalogApp } from "./app-catalog";
import styles from "./apps.module.css";

export function AppDetails({
  app,
  installed,
  backHref,
  busy,
  canInstall,
  needsSetup,
  comingSoon = false,
  onInstall,
  children,
}: {
  app: CatalogApp;
  installed: boolean;
  backHref: string;
  busy: boolean;
  canInstall: boolean;
  needsSetup: boolean;
  comingSoon?: boolean;
  onInstall: () => void;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState(0);
  const actionLabel = busy
    ? "Ouverture…"
    : comingSoon
      ? "En développement"
      : installed
        ? "Configure"
        : "Install app";
  const previewTitles = ["Vos données", "Synchronisation", "Contexte CRM"];
  const Icon =
    app.category === "communication"
      ? Mail
      : app.category === "calendars"
        ? CalendarDays
        : app.category === "calling"
          ? Video
          : Workflow;
  const action = (secondary = false) => (
    <button
      className={`button ${secondary ? "" : "primary"} ${styles.installButton}`}
      disabled={busy || comingSoon || !canInstall || (needsSetup && !installed)}
      onClick={onInstall}
    >
      {installed ? <CheckCheck size={15} /> : <ArrowRight size={15} />}
      {actionLabel}
    </button>
  );
  return (
    <article className={styles.detail}>
      <div className={styles.detailBreadcrumb}>
        <Link href={backHref}>
          <ArrowLeft size={14} /> Apps
        </Link>
        <ChevronRight size={12} />
        <span>{app.name}</span>
        <span className={styles.detailVersion}>Zyliad integration</span>
      </div>
      <header className={styles.detailHero}>
        <AppLogo id={app.id} large />
        <div>
          <div className={styles.heroTitle}>
            <h1>{app.name}</h1>
            {installed && (
              <span className={styles.installedBadge}>
                <Check size={12} />
                Installed
              </span>
            )}
          </div>
          <p>{app.headline}</p>
          {action()}
          {needsSetup && !installed && !comingSoon && (
            <p className={styles.setupHint}>
              La configuration doit être finalisée par votre administrateur.{" "}
              <a href="#app-configure">Voir Configure</a>
            </p>
          )}
          {!canInstall && (
            <p className={styles.setupHint}>
              Demandez à un administrateur ou à un membre autorisé de connecter cette app.
            </p>
          )}
        </div>
      </header>
      <div className={styles.detailBody}>
        <aside className={styles.metadata}>
          <span className={styles.officialBadge}>
            <BadgeCheck size={14} />
            Connecteur Zyliad
          </span>
          <div>
            <h3>Built by</h3>
            <p>
              <span className={styles.publisherMark}>z</span>Zyliad
            </p>
          </div>
          <div>
            <h3>Category</h3>
            <p>
              <Icon size={14} />
              {categoryName(app.category)}
            </p>
          </div>
          <div className={styles.resources}>
            <h3>Resources</h3>
            <a href={app.website} target="_blank" rel="noreferrer">
              <Globe size={14} />
              Website
              <ArrowUpRight size={12} />
            </a>
            <a href={app.documentation} target="_blank" rel="noreferrer">
              <BookOpen size={14} />
              Documentation
              <ArrowUpRight size={12} />
            </a>
            <a href={app.support} target="_blank" rel="noreferrer">
              <CircleHelp size={14} />
              Support
              <ArrowUpRight size={12} />
            </a>
          </div>
          {action(true)}
          <nav className={styles.sectionLinks} aria-label="Sections de l’app">
            <a href="#app-overview">Overview</a>
            <a href="#app-how-it-works">How it works</a>
            <a href="#app-configure">Configure</a>
          </nav>
        </aside>
        <div className={styles.detailContent}>
          <div className={styles.gallery}>
            <div
              className={styles.preview}
              role="img"
              aria-label={`Aperçu illustré : ${app.name} et ${previewTitles[preview]}`}
            >
              <div className={styles.previewWindow}>
                <div className={styles.previewBar}>
                  <span />
                  <span />
                  <span />
                  <strong>Zyliad</strong>
                  <span className={styles.previewBarLabel}>{app.name}</span>
                </div>
                <div className={styles.previewCanvas}>
                  <div className={styles.previewApp}>
                    <AppLogo id={app.id} />
                    <span>
                      {app.name}
                      <small>Votre app, dans votre CRM</small>
                    </span>
                    <BadgeCheck size={15} />
                  </div>
                  {preview === 0 ? (
                    <>
                      <h3>
                        {app.category === "communication"
                          ? "Chaque échange compte."
                          : app.category === "calendars"
                            ? "Votre prochain rendez-vous."
                            : app.category === "calling"
                              ? "Le contexte de votre réunion."
                              : "Vos outils travaillent ensemble."}
                      </h3>
                      <p>{app.description}</p>
                      {app.features.slice(0, 2).map((feature) => (
                        <div className={styles.previewRow} key={feature.title}>
                          <Icon size={16} />
                          <span>
                            {feature.title}
                            <small>Retrouvez vos informations dans Zyliad</small>
                          </span>
                          <ChevronRight size={13} />
                        </div>
                      ))}
                    </>
                  ) : preview === 1 ? (
                    <>
                      <h3>Connectez. Retrouvez. Avancez.</h3>
                      <p>Un parcours simple, avec des permissions que vous choisissez.</p>
                      <div className={styles.previewFlow}>
                        <AppLogo id={app.id} />
                        <ArrowRight size={20} />
                        <span className={styles.previewSync}>
                          <RefreshCw size={21} />
                        </span>
                        <ArrowRight size={20} />
                        <span className={styles.zyliadTile}>z</span>
                      </div>
                      <div className={styles.previewNote}>
                        <ShieldCheck size={16} />
                        Un accès limité aux autorisations accordées
                      </div>
                    </>
                  ) : (
                    <>
                      <h3>Tout le contexte, au même endroit.</h3>
                      <p>Vos informations utiles accompagnent vos prochaines actions.</p>
                      <div className={styles.previewInsight}>
                        <Sparkles size={20} />
                        <div>
                          <strong>Préparez la suite</strong>
                          <p>{app.features[app.features.length - 1].description}</p>
                        </div>
                      </div>
                      <div className={styles.previewNote}>
                        <CheckCheck size={16} />
                        Votre CRM, enrichi de votre contexte
                      </div>
                    </>
                  )}
                </div>
              </div>
              <span className={styles.previewCaption}>
                Aperçu illustré · {previewTitles[preview]}
              </span>
            </div>
            <div className={styles.thumbnails} role="group" aria-label="Choisir un aperçu">
              {previewTitles.map((title, index) => (
                <button
                  type="button"
                  key={title}
                  aria-pressed={preview === index}
                  onClick={() => setPreview(index)}
                >
                  <span className={styles.thumbnailDrawing}>
                    {index === 0 ? (
                      <Icon size={24} />
                    ) : index === 1 ? (
                      <RefreshCw size={24} />
                    ) : (
                      <Sparkles size={24} />
                    )}
                    <i />
                    <i />
                  </span>
                  <span>{title}</span>
                </button>
              ))}
            </div>
          </div>
          <section id="app-overview" className={styles.articleSection}>
            <h2>Overview</h2>
            {app.overview.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
          <section id="app-how-it-works" className={styles.articleSection}>
            <h2>How it works</h2>
            <p>
              {comingSoon
                ? "Fonctionnalités prévues, non activées :"
                : "Une fois connectée, cette intégration vous permet de :"}
            </p>
            <ul>
              {app.features.map((feature) => (
                <li key={feature.title}>
                  <strong>{feature.title}.</strong> {feature.description}
                </li>
              ))}
            </ul>
          </section>
          <section id="app-configure" className={styles.articleSection}>
            <h2>Configure</h2>
            <p>{app.requirements}</p>
            {app.id !== "zapier" && !comingSoon && (
              <ol>
                <li>
                  Cliquez sur <strong>Install app</strong> pour ouvrir la connexion sécurisée chez
                  le fournisseur.
                </li>
                <li>Choisissez votre compte et autorisez les permissions demandées.</li>
                <li>Revenez dans Zyliad et lancez une première synchronisation.</li>
                <li>Activez la synchronisation automatique si le service est disponible.</li>
              </ol>
            )}
            {children}
          </section>
        </div>
      </div>
    </article>
  );
}
