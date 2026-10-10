import Link from "next/link";
import { ArrowUpRight, Building2, Check, LayoutDashboard, Mail, Search, Users } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./onboarding.module.css";

export function AuthFrame({ children, step }: { children: ReactNode; step?: number }) {
  return (
    <div className={styles.page}>
      <div className={styles.formSide}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand} aria-label="Relay, accueil">
            <span className={styles.mark}>r</span> relay
          </Link>
          <Link href="/doc" className={styles.help}>
            Besoin d’aide ? <ArrowUpRight size={14} />
          </Link>
        </header>
        <main className={styles.main}>
          {step !== undefined && (
            <ol className={styles.steps} aria-label="Votre inscription">
              {["Compte", "Profil", "Espace", "Prêt"].map((label, index) => (
                <li
                  key={label}
                  aria-current={index === step ? "step" : undefined}
                  data-done={index < step}
                >
                  <span>{index < step ? <Check size={12} /> : index + 1}</span>
                  {label}
                </li>
              ))}
            </ol>
          )}
          <div className={styles.content}>{children}</div>
        </main>
        <footer className={styles.footer}>Vos relations. Un espace pour avancer ensemble.</footer>
      </div>
      <aside className={styles.previewSide} aria-label="Aperçu du CRM avec des données fictives">
        <div className={styles.previewIntro}>
          <span className={styles.eyebrow}>UN ESPACE, TOUT LE CONTEXTE</span>
          <h2>
            Vos relations prennent
            <br />
            une nouvelle dimension.
          </h2>
          <p>Rassemblez les personnes, les entreprises et les prochaines étapes de votre équipe.</p>
        </div>
        <div className={styles.preview}>
          <div className={styles.previewNav}>
            <strong>
              <span className={styles.miniMark}>r</span> Studio Horizon
            </strong>
            <span>
              <Search size={14} /> Rechercher
            </span>
            <span>
              <LayoutDashboard size={14} /> Accueil
            </span>
            <span className={styles.activeNav}>
              <Users size={14} /> Personnes
            </span>
            <span>
              <Building2 size={14} /> Entreprises
            </span>
            <span>
              <Mail size={14} /> Échanges
            </span>
          </div>
          <div className={styles.previewBody}>
            <div className={styles.previewTop}>
              <span>Personnes</span>
              <small>Aperçu fictif</small>
            </div>
            <h3>
              Les bonnes relations,
              <br />
              au bon endroit.
            </h3>
            <div className={styles.tableHead}>
              <span>Nom</span>
              <span>Entreprise</span>
            </div>
            {[
              ["AL", "Alex Laurent", "Studio Horizon"],
              ["MC", "Morgan Colin", "Atelier Nord"],
              ["SD", "Sam Dubois", "Maison Azur"],
            ].map(([initials, name, company]) => (
              <div className={styles.previewRow} key={initials}>
                <span className={styles.avatar}>{initials}</span>
                <strong>{name}</strong>
                <span>{company}</span>
              </div>
            ))}
            <div className={styles.previewNote}>
              <span className={styles.noteDot} />
              Prochaine étape <strong>Préparer le rendez-vous</strong>
              <small>Demain, 10:00</small>
            </div>
          </div>
        </div>
        <p className={styles.previewCaption}>
          Un aperçu pour vous projeter. Votre espace démarre avec vos propres données.
        </p>
      </aside>
    </div>
  );
}
