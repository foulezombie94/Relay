import { mcpInstallationOrigin } from "@/lib/domain/mcp-installation";
import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Plus,
  Minus,
  GitMerge,
  LockKeyhole,
  Mail,
  Menu,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import ProductPreview, { ProductScene } from "./landing-preview";
import styles from "./landing.module.css";
import { McpInstaller } from "@/components/mcp/installer";

const display = localFont({
  src: "../../public/fonts/manrope.ttf",
  variable: "--landing-display",
  display: "swap",
  weight: "200 800",
});
const body = localFont({
  src: "../../public/fonts/dm-sans.ttf",
  variable: "--landing-body",
  display: "swap",
  weight: "100 1000",
});

export const metadata: Metadata = {
  title: "Zyliad — Le CRM qui fait avancer vos ventes et vos clients",
  description:
    "Contacts, pipeline, emails et engagements client dans un même CRM. Découvrez Zyliad et explorez sa démo sans compte.",
  openGraph: {
    title: "Zyliad — Faites avancer vos ventes. Tenez vos engagements.",
    description: "Un même espace pour vos relations, vos opportunités et la réalisation client.",
    type: "website",
    locale: "fr_FR",
  },
};

const integrations = [
  {
    name: "Gmail",
    icon: Mail,
    description: "Vos échanges email",
    color: "red",
  },
  {
    name: "Google Calendar",
    icon: CalendarDays,
    description: "Vos rendez-vous",
    color: "blue",
  },
  {
    name: "Outlook",
    icon: Mail,
    description: "Votre messagerie Microsoft",
    color: "blue",
  },
  {
    name: "Outlook Calendar",
    icon: CalendarDays,
    description: "Votre calendrier Microsoft",
    color: "violet",
  },
  {
    name: "Zapier",
    icon: Workflow,
    description: "Webhooks et intégration privée",
    color: "orange",
  },
];
const questions = [
  {
    title: "À qui s’adresse Zyliad ?",
    text: "Aux équipes B2B qui veulent suivre leurs contacts, leurs ventes et leurs engagements client dans un même espace. Les équipes commerciales, agences et entreprises de services peuvent organiser leurs pipelines et leurs prochaines actions selon leur manière de travailler.",
  },
  {
    title: "Puis-je découvrir le produit sans créer de compte ?",
    text: "Oui. La démo publique est accessible sans compte, en lecture seule, avec des données entièrement fictives. Pour gérer vos propres clients, créez votre espace de travail.",
  },
  {
    title: "Puis-je importer mes contacts existants ?",
    text: "Vous pouvez importer des fichiers CSV ou Excel depuis votre espace. Préparez vos colonnes, vérifiez leur correspondance avec les champs de Zyliad et consultez le guide utilisateur pour les étapes d’import.",
  },
  {
    title: "Quels emails et calendriers puis-je connecter ?",
    text: "Zyliad propose Gmail, Google Calendar, Outlook et Outlook Calendar. Vous choisissez les services à connecter et autorisez les permissions nécessaires auprès de Google ou Microsoft. Zapier se connecte via webhooks ou intégration privée.",
  },
  {
    title: "Comment fonctionne l’assistant IA ?",
    text: "L’assistant aide à retrouver le contexte de votre CRM et à préparer des actions. Sa disponibilité dépend de la configuration de votre espace. Les suggestions restent à examiner avant d’agir : elles ne remplacent pas le jugement de votre équipe.",
  },
  {
    title: "Comment mon équipe garde-t-elle le contrôle ?",
    text: "Les membres travaillent dans un espace avec des rôles et des permissions. Zyliad conserve un historique des actions et permet de comparer les doublons avant de les fusionner, avec la possibilité d’annuler une fusion. Le guide détaille ces fonctions.",
  },
];

function Logo() {
  return (
    <span className={styles.logo}>
      <span className={styles.logoMark}>z</span>Zyliad
      <span className={styles.logoDot}>.</span>
    </span>
  );
}

export default function Home() {
  return (
    <div className={`${styles.landing} ${display.variable} ${body.variable}`}>
      <a href="#contenu" className={styles.skipLink}>
        Aller au contenu
      </a>
      <header className={styles.header}>
        <Link prefetch={false} href="/" aria-label="Zyliad, accueil">
          <Logo />
        </Link>
        <nav className={styles.nav} aria-label="Navigation principale">
          <a href="#produit">Produit</a>
          <a href="#realisation">Pourquoi Zyliad</a>
          <a href="#integrations">Intégrations</a>
          <Link prefetch={false} href="/doc">
            Doc
          </Link>
        </nav>
        <div className={styles.headerActions}>
          <Link prefetch={false} href="/login" className={styles.login}>
            Se connecter
          </Link>
          <Link prefetch={false} href="/signup" className={styles.primary}>
            Créer mon espace <ArrowUpRight size={15} />
          </Link>
        </div>
        <details className={styles.mobileMenu}>
          <summary aria-label="Ouvrir le menu">
            <Menu size={23} />
          </summary>
          <nav aria-label="Navigation mobile">
            <a href="#produit">Produit</a>
            <a href="#realisation">Pourquoi Zyliad</a>
            <a href="#integrations">Intégrations</a>
            <Link prefetch={false} href="/doc">
              Documentation
            </Link>
            <Link prefetch={false} href="/login">
              Se connecter
            </Link>
            <Link prefetch={false} href="/signup">
              Créer mon espace
            </Link>
          </nav>
        </details>
      </header>
      <main id="contenu">
        <section className={styles.hero}>
          <h1>
            Faites avancer vos ventes.
            <br />
            <span>Tenez vos engagements.</span>
          </h1>
          <p>
            Le CRM qui réunit vos contacts, vos échanges et vos opportunités.
            <br className={styles.desktopBreak} /> Et garde votre équipe dans le même élan, jusqu’à
            la réalisation client.
          </p>
          <div className={styles.heroActions}>
            <Link prefetch={false} href="/signup" className={styles.primary}>
              Créer mon espace <ArrowRight size={17} />
            </Link>
            <Link prefetch={false} href="/demo" className={styles.secondary}>
              Explorer la démo <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className={styles.heroNote}>
            <Check size={14} /> Démo sans compte <span /> Données d’exemple
          </div>
        </section>
        <section
          className={styles.productSection}
          id="produit"
          aria-label="Découvrir les vues du CRM Zyliad"
        >
          <ProductPreview />
          <div className={styles.productCaption}>
            <span>Vos relations. Vos ventes. La suite à donner.</span>
            <Link prefetch={false} href="/demo">
              Explorer la démo complète <ArrowRight size={15} />
            </Link>
          </div>
        </section>
        <section className={styles.connectionStrip} aria-label="Services proposés">
          <p>Avec les outils que votre équipe utilise déjà.</p>
          <div>
            {integrations.map(({ name, icon: Icon }) => (
              <span key={name}>
                <Icon size={19} strokeWidth={1.7} />
                {name}
              </span>
            ))}
          </div>
        </section>
        <section className={styles.storySection}>
          <div className={styles.sectionIntro}>
            <h2>
              Moins de dispersion.
              <br />
              Plus de prochaines étapes.
            </h2>
            <p>
              Un échange dans votre boîte mail. Une opportunité dans un tableau. Une promesse dans
              vos notes. Zyliad rassemble le contexte pour que votre équipe sache où reprendre.
            </p>
          </div>
          <div className={styles.storyRow}>
            <div className={styles.storyCopy}>
              <h3>
                Le contexte d’une relation,
                <br />
                avant chaque conversation.
              </h3>
              <p>
                Retrouvez les personnes, entreprises, notes et échanges liés à votre client. Une
                même histoire, accessible à ceux qui en ont besoin.
              </p>
              <ul>
                <li>
                  <Check size={16} /> Fiches personnes et entreprises reliées
                </li>
                <li>
                  <Check size={16} /> Notes, messages et rendez-vous
                </li>
                <li>
                  <Check size={16} /> Champs et vues adaptés à votre équipe
                </li>
              </ul>
              <Link prefetch={false} href="/doc" className={styles.textLink}>
                Découvrir le CRM <ArrowRight size={16} />
              </Link>
            </div>
            <ProductScene kind="relations" />
          </div>
          <div className={`${styles.storyRow} ${styles.reverseRow}`}>
            <ProductScene kind="forecast" />
            <div className={styles.storyCopy}>
              <h3>
                Un pipeline lisible.
                <br />
                Des prévisions à leur place.
              </h3>
              <p>
                Suivez chaque opportunité avec son montant, son étape, son responsable et sa date de
                clôture prévue. Distinguez ce qui est en cours, pondéré, gagné ou perdu.
              </p>
              <ul>
                <li>
                  <Check size={16} /> Vue Kanban ou tableau
                </li>
                <li>
                  <Check size={16} /> Étapes et probabilités personnalisables
                </li>
                <li>
                  <Check size={16} /> Rapports pour suivre l’activité commerciale
                </li>
              </ul>
              <Link prefetch={false} href="/doc" className={styles.textLink}>
                Comprendre les opportunités <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
        <section id="realisation" className={styles.deliverySection}>
          <div className={styles.deliveryIntro}>
            <h2>
              La vente est gagnée.
              <br />
              <span>La relation continue.</span>
            </h2>
            <p>
              Ce qui a été promis mérite d’être suivi. Zyliad relie les engagements client à une
              personne, une échéance et leur réalisation.
            </p>
            <Link prefetch={false} href="/demo" className={styles.lightButton}>
              Découvrir Zyliad <ArrowRight size={17} />
            </Link>
          </div>
          <ProductScene kind="realisation" />
        </section>
        <section className={styles.teamSection}>
          <div className={styles.sectionIntro}>
            <h2>
              Un espace qui aide
              <br />
              toute l’équipe à avancer.
            </h2>
            <p>
              Gardez les données utiles, retrouvez le contexte et préparez les actions. Avec le
              contrôle nécessaire au travail en équipe.
            </p>
          </div>
          <div className={styles.teamFeatures}>
            <article>
              <GitMerge size={26} />
              <h3>Des données plus claires.</h3>
              <p>
                Comparez et corrigez les doublons avant la fusion. Retrouvez son historique et
                annulez-la si nécessaire.
              </p>
            </article>
            <article>
              <Sparkles size={26} />
              <h3>Une aide, dans le contexte.</h3>
              <p>
                Utilisez l’assistant IA pour retrouver des informations et préparer la suite, selon
                la configuration de votre espace.
              </p>
            </article>
            <article>
              <ShieldCheck size={26} />
              <h3>Le contrôle reste à vous.</h3>
              <p>
                Rôles, permissions et historique des actions accompagnent le travail de vos membres
                dans l’espace.
              </p>
            </article>
          </div>
        </section>
        <section id="integrations" className={styles.integrationsSection}>
          <div className={styles.sectionIntro}>
            <h2>
              Votre CRM s’intègre
              <br />à votre journée.
            </h2>
            <p>
              Connectez votre messagerie et votre calendrier. Vos échanges trouvent leur place dans
              le suivi de vos relations.
            </p>
          </div>
          <div className={styles.integrationList}>
            {integrations.map(({ name, icon: Icon, description, color }) => (
              <div key={name}>
                <span className={`${styles.integrationIcon} ${styles[color]}`}>
                  <Icon size={24} />
                </span>
                <div>
                  <strong>{name}</strong>
                  <small>{description}</small>
                </div>
                <Check size={17} />
              </div>
            ))}
          </div>
          <Link prefetch={false} href="/doc" className={styles.textLink}>
            Consulter le guide des intégrations <ArrowRight size={16} />
          </Link>
        </section>
        <section className={styles.faqSection} id="questions">
          <div>
            <h2>
              Vos questions,
              <br />
              avant de commencer.
            </h2>
            <p>
              Les réponses essentielles.
              <br />
              Et un guide pour aller plus loin.
            </p>
            <Link prefetch={false} href="/doc" className={styles.textLink}>
              Ouvrir la documentation <ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.faqList}>
            {questions.map(({ title, text }) => (
              <details key={title}>
                <summary>
                  {title}
                  <span aria-hidden="true">
                    <Plus size={18} className={styles.faqExpand} />
                    <Minus size={18} className={styles.faqCollapse} />
                  </span>
                </summary>
                <p>{text}</p>
              </details>
            ))}
          </div>
        </section>
        <section id="mcp" className={styles.mcpSection}>
          <p className={styles.mcpEyebrow}>ZYLIAD MCP</p>
          <h2>Votre CRM. Là où vous travaillez.</h2>
          <p className={styles.mcpDescription}>
            Retrouvez vos contacts, préparez vos réunions et analysez vos opportunités dans Claude
            Code ou Codex. Une connexion sécurisée, des permissions explicites, vos modifications
            sous contrôle.
          </p>
          <McpInstaller origin={mcpInstallationOrigin(process.env.APP_URL)} />
        </section>
        <section className={styles.finalCta}>
          <h2>
            Votre prochain client.
            <br />
            Votre prochaine bonne action.
          </h2>
          <p>Donnez à votre équipe un espace pour les relier.</p>
          <div className={styles.heroActions}>
            <Link prefetch={false} href="/signup" className={styles.primary}>
              Créer mon espace <ArrowRight size={17} />
            </Link>
            <Link prefetch={false} href="/demo" className={styles.secondary}>
              Explorer la démo <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div>
          <Link prefetch={false} href="/" aria-label="Zyliad, accueil">
            <Logo />
          </Link>
          <p>
            Les relations avancent.
            <br />
            Votre équipe aussi.
          </p>
        </div>
        <nav aria-label="Liens du produit">
          <strong>Produit</strong>
          <a href="#produit">Le CRM</a>
          <a href="#realisation">Réalisation client</a>
          <a href="#integrations">Intégrations</a>
        </nav>
        <nav aria-label="Ressources">
          <strong>Ressources</strong>
          <Link prefetch={false} href="/doc">
            Documentation
          </Link>
          <Link prefetch={false} href="/demo">
            Démonstration
          </Link>
          <a
            href="https://relay-crm-status.betteruptime.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            État des services <ArrowUpRight size={13} />
          </a>
        </nav>
        <nav aria-label="Accès au compte">
          <strong>Votre espace</strong>
          <Link prefetch={false} href="/login">
            Se connecter
          </Link>
          <Link prefetch={false} href="/signup">
            Créer un compte
          </Link>
        </nav>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} Zyliad</span>
          <span>
            <LockKeyhole size={13} /> Votre contexte. Vos prochaines actions.
          </span>
        </div>
      </footer>
    </div>
  );
}
