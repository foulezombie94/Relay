import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDot,
  GitMerge,
  Inbox,
  Layers3,
  ListTodo,
  Mail,
  MessageSquare,
  Search,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Relay — Vos relations, la prochaine bonne action",
  description:
    "Rassemblez vos contacts, vos opportunités et les engagements de votre équipe dans un CRM clair. Découvrez Relay.",
};

const features = [
  {
    icon: Users,
    title: "Toute la relation, au même endroit.",
    text: "Contacts, entreprises, notes et échanges : retrouvez le contexte avant votre prochain rendez-vous.",
  },
  {
    icon: Layers3,
    title: "Un pipeline qui vous ressemble.",
    text: "Suivez vos opportunités en tableau ou en Kanban, avec vos étapes, vos champs et vos vues.",
  },
  {
    icon: GitMerge,
    title: "Des contacts mieux organisés.",
    text: "Comparez les doublons, corrigez les fiches et fusionnez avec un historique et la possibilité d’annuler.",
  },
  {
    icon: ListTodo,
    title: "La prochaine action est claire.",
    text: "Rassemblez les tâches et les engagements, avec leur responsable, leur échéance et leur contexte.",
  },
];
const connections = [
  { label: "Gmail", icon: Mail, color: "coral" },
  { label: "Google Calendar", icon: CalendarDays, color: "blue" },
  { label: "Outlook", icon: Inbox, color: "blue" },
  { label: "Outlook Calendar", icon: CalendarDays, color: "violet" },
  { label: "Zapier", icon: Workflow, color: "coral" },
];

function Logo() {
  return (
    <span className={styles.logo}>
      <span className={styles.logoMark}>r</span>relay
      <span className={styles.logoDot}>.</span>
    </span>
  );
}

function ProductPreview() {
  return (
    <div className={styles.preview} aria-label="Aperçu fictif du CRM Relay">
      <aside className={styles.previewSidebar} aria-hidden="true">
        <Logo />
        <div className={styles.workspace}>
          <span>A</span> Atelier Studio <ChevronRight size={13} />
        </div>
        <div className={styles.sidebarLabel}>VOTRE ESPACE</div>
        <div>
          <Search size={15} /> Rechercher
        </div>
        <div>
          <CircleDot size={15} /> Priorités
        </div>
        <div className={styles.selected}>
          <Building2 size={15} /> Entreprises
        </div>
        <div>
          <Users size={15} /> Personnes
        </div>
        <div>
          <Layers3 size={15} /> Opportunités
        </div>
        <div>
          <CheckCheck size={15} /> Engagements
        </div>
        <div className={styles.sidebarBottom}>
          <span className={styles.avatar}>ML</span> Marie Laurent
        </div>
      </aside>
      <div className={styles.previewMain}>
        <div className={styles.previewTop}>
          <span>
            Entreprises <ChevronRight size={12} /> Maison Noma
          </span>
          <span className={styles.demoLabel}>Aperçu fictif</span>
        </div>
        <div className={styles.recordHead}>
          <div className={styles.companyMark}>N</div>
          <div>
            <h3>Maison Noma</h3>
            <span>Design & architecture · Paris</span>
          </div>
          <span className={styles.recordStatus}>En discussion</span>
        </div>
        <div className={styles.recordTabs}>
          <span>Vue d’ensemble</span>
          <span>Activité</span>
          <span>Engagements</span>
        </div>
        <div className={styles.recordBody}>
          <div className={styles.activity}>
            <h4>Une relation, tout son contexte</h4>
            <div className={styles.timelineItem}>
              <span className={styles.timelineIcon}>
                <Mail size={15} />
              </span>
              <div>
                <strong>Un échange qui fait avancer</strong>
                <small>Camille Dubois · Email</small>
                <p>
                  « Pourriez-vous nous envoyer une proposition avant jeudi ? »
                </p>
              </div>
            </div>
            <div className={styles.timelineItem}>
              <span className={styles.timelineIcon}>
                <MessageSquare size={15} />
              </span>
              <div>
                <strong>Le contexte reste dans l’équipe</strong>
                <small>Note partagée · Marie</small>
                <p>
                  Le périmètre est confirmé. Prévoir deux options dans la
                  proposition.
                </p>
              </div>
            </div>
            <div className={styles.timelineItem}>
              <span className={styles.timelineIcon}>
                <CheckCheck size={15} />
              </span>
              <div>
                <strong>Un engagement avec une échéance</strong>
                <small>Envoyer la proposition · Jeudi</small>
              </div>
            </div>
          </div>
          <div className={styles.nextAction}>
            <span className={styles.actionEyebrow}>
              <CircleDot size={13} /> PROCHAINE ACTION
            </span>
            <h4>
              Envoyer la
              <br />
              proposition.
            </h4>
            <p>L’échange, la note et l’échéance sont reliés à la même fiche.</p>
            <div className={styles.actionOwner}>
              <span className={styles.avatar}>ML</span>
              <div>
                <strong>Marie Laurent</strong>
                <small>Responsable</small>
              </div>
            </div>
            <span className={styles.actionDue}>
              <CalendarDays size={14} /> Jeudi, 15:00
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className={styles.landing}>
      <a className={styles.skipLink} href="#contenu">
        Aller au contenu
      </a>
      <header className={styles.header}>
        <Link href="/" aria-label="Relay, accueil">
          <Logo />
        </Link>
        <nav className={styles.nav} aria-label="Navigation principale">
          <a href="#fonctionnalites">Le produit</a>
          <a href="#integrations">Intégrations</a>
          <a href="#methode">Notre approche</a>
        </nav>
        <div className={styles.headerActions}>
          <Link className={styles.login} href="/login">
            Se connecter
          </Link>
          <Link className={styles.primary} href="/login?mode=signup">
            Commencer <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main id="contenu">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span /> LE CRM QUI RELIE LES POINTS
            </span>
            <h1>
              De belles relations.
              <br />
              Et la prochaine
              <br />
              <span>bonne action.</span>
            </h1>
            <p>
              Vos contacts, vos échanges et vos engagements, enfin au même
              endroit. Pour avancer ensemble, sans perdre le fil.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primary} href="/login?mode=signup">
                Créer mon espace <ArrowRight size={18} />
              </Link>
              <Link className={styles.secondary} href="/demo">
                Explorer la démo <ArrowUpRight size={17} />
              </Link>
            </div>
            <span className={styles.heroNote}>
              Une démo accessible sans compte, avec des données fictives.
            </span>
          </div>
          <div className={styles.relayFlow}>
            <div className={styles.flowTop}>
              <span className={styles.flowDot} /> LE FIL DE VOTRE RELATION
              <span className={styles.flowTag}>Tout est relié</span>
            </div>
            <div className={styles.flowContact}>
              <div className={styles.contactAvatar}>CD</div>
              <div>
                <strong>Camille Dubois</strong>
                <span>Maison Noma</span>
              </div>
              <span className={styles.contactLabel}>Votre contact</span>
            </div>
            <div className={styles.flowSteps}>
              <div>
                <span className={styles.flowStepIcon}>
                  <Mail size={18} />
                </span>
                <div>
                  <small>UN ÉCHANGE</small>
                  <strong>« On avance ensemble ? »</strong>
                </div>
              </div>
              <div>
                <span className={styles.flowStepIcon}>
                  <CheckCheck size={18} />
                </span>
                <div>
                  <small>UN ENGAGEMENT</small>
                  <strong>Une proposition pour jeudi.</strong>
                </div>
              </div>
              <div className={styles.flowActive}>
                <span className={styles.flowStepIcon}>
                  <ArrowRight size={18} />
                </span>
                <div>
                  <small>UNE ACTION</small>
                  <strong>Marie prend le relais.</strong>
                </div>
                <span className={styles.assignee}>ML</span>
              </div>
            </div>
            <div className={styles.flowFooter}>
              <ShieldCheck size={15} /> Le contexte reste. Votre équipe avance.
              <span>Aperçu fictif</span>
            </div>
          </div>
        </section>
        <section
          className={styles.productSection}
          aria-labelledby="apercu-title"
        >
          <div className={styles.previewCaption}>
            <h2 id="apercu-title">
              Moins de « où en est-on ? ».
              <br />
              Plus de « voilà la suite ».
            </h2>
            <p>
              Un espace commun pour chaque relation.
              <br />
              Du premier contact à la prochaine étape.
            </p>
          </div>
          <ProductPreview />
          <div className={styles.benefitStrip}>
            <span>
              <Check size={16} /> Contacts & entreprises
            </span>
            <span>
              <Check size={16} /> Pipeline personnalisable
            </span>
            <span>
              <Check size={16} /> Engagements & tâches
            </span>
            <span>
              <Check size={16} /> Travail en équipe
            </span>
          </div>
        </section>
        <section id="fonctionnalites" className={styles.featuresSection}>
          <div className={styles.sectionHeading}>
            <span className={styles.eyebrow}>UN CRM, UN FIL CONDUCTEUR</span>
            <h2>
              Tout ce qu’il faut
              <br />
              pour faire avancer la relation.
            </h2>
            <p>
              De l’information organisée et des actions concrètes.
              <br />
              Chaque membre de l’équipe sait où reprendre.
            </p>
          </div>
          <div className={styles.featuresGrid}>
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className={styles.featureIcon}>
                  <Icon size={23} strokeWidth={1.6} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="methode" className={styles.methodSection}>
          <div className={styles.methodCopy}>
            <span className={styles.eyebrow}>
              LA PROMESSE NE S’ARRÊTE PAS À LA VENTE
            </span>
            <h2>
              Une parole donnée.
              <br />
              <span>Une suite à suivre.</span>
            </h2>
            <p>
              Une date annoncée, un document promis, une prochaine étape : Relay
              vous aide à garder les engagements visibles, jusqu’à leur
              réalisation.
            </p>
            <Link href="/demo" className={styles.textLink}>
              Découvrir les engagements <ArrowRight size={17} />
            </Link>
          </div>
          <div className={styles.commitment}>
            <div className={styles.commitmentHeading}>
              <span className={styles.featureIcon}>
                <CheckCheck size={23} />
              </span>
              <span>ENGAGEMENT CLIENT</span>
              <span className={styles.commitmentBadge}>À suivre</span>
            </div>
            <h3>
              Envoyer la proposition
              <br />à Maison Noma
            </h3>
            <div className={styles.commitmentMeta}>
              <span>
                <CalendarDays size={15} /> Jeudi, 15:00
              </span>
              <span>
                <span className={styles.assignee}>ML</span> Marie Laurent
              </span>
            </div>
            <div className={styles.commitmentSource}>
              <Mail size={17} />
              <div>
                <strong>Le pourquoi est toujours là.</strong>
                <p>
                  Retrouvez l’échange à l’origine de l’engagement, directement
                  depuis la fiche.
                </p>
              </div>
            </div>
            <div className={styles.commitmentBottom}>
              <Check size={15} /> Un responsable. Une échéance. Une preuve.
            </div>
            <small className={styles.exampleNote}>
              Exemple fictif d’un engagement
            </small>
          </div>
        </section>
        <section id="integrations" className={styles.integrationsSection}>
          <span className={styles.eyebrow}>VOS OUTILS GARDENT LEUR PLACE</span>
          <h2>Vos échanges trouvent la leur.</h2>
          <p>
            Reliez vos emails et vos calendriers à votre CRM.
            <br />
            Connectez vos autres outils avec Zapier.
          </p>
          <div className={styles.connections}>
            {connections.map(({ label, icon: Icon, color }) => (
              <div key={label}>
                <span className={`${styles.connectionIcon} ${styles[color]}`}>
                  <Icon size={24} strokeWidth={1.8} />
                </span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
          <p className={styles.integrationNote}>
            Connexion depuis votre espace de travail. Zapier via Webhooks ou
            intégration privée.
          </p>
        </section>
        <section className={styles.finalCta}>
          <span className={styles.eyebrow}>
            VOTRE ÉQUIPE A DÉJÀ DES RELATIONS. DONNEZ-LEUR UN FIL.
          </span>
          <h2>
            Prêt à prendre
            <br />
            le relais ?
          </h2>
          <div className={styles.heroActions}>
            <Link href="/login?mode=signup" className={styles.primary}>
              Créer mon espace <ArrowRight size={18} />
            </Link>
            <Link href="/demo" className={styles.secondary}>
              Voir la démo <ArrowUpRight size={17} />
            </Link>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Link href="/" aria-label="Relay, accueil">
          <Logo />
        </Link>
        <span>Votre contexte. Vos prochaines actions.</span>
        <div>
          <Link href="/demo">Démonstration</Link>
          <Link href="/login">Connexion</Link>
        </div>
      </footer>
    </div>
  );
}
