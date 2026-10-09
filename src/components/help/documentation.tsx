"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BookOpen, ArrowRight, Search } from "lucide-react";
import { helpArticles } from "@/lib/help/guides";
import styles from "./documentation.module.css";
export function Documentation() {
  const params = useSearchParams();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const article = helpArticles.find((a) => a.id === params.get("article"));
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = helpArticles.filter((a) =>
    normalize(
      a.category +
        " " +
        a.title +
        " " +
        a.description +
        " " +
        a.sections
          .map((s) => [s.title, ...s.paragraphs, ...(s.steps ?? [])].join(" "))
          .join(" "),
    ).includes(normalize(term)),
  );
  const categories = [...new Set(helpArticles.map((a) => a.category))];
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <Link href="/" className="brand">
          <span className="brand-mark">r</span>relay{" "}
          <small>Guide utilisateur</small>
        </Link>
        <nav>
          <Link href="/doc" onNavigate={() => setTerm("")}>
            Tous les guides
          </Link>
          <Link className="button primary" href="/app/companies">
            Ouvrir Relay <ArrowRight size={14} />
          </Link>
        </nav>
      </header>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <label className={styles.search}>
            <Search size={16} />
            <input
              aria-label="Rechercher dans les guides"
              placeholder="Rechercher un guide…"
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                if (article) router.replace("/doc", { scroll: false });
              }}
            />
          </label>
          {categories.map((category) => (
            <section key={category}>
              <strong>{category}</strong>
              {filtered
                .filter((a) => a.category === category)
                .map((a) => (
                  <Link
                    key={a.id}
                    onNavigate={() => setTerm("")}
                    href={"/doc?article=" + a.id}
                    aria-current={article?.id === a.id ? "page" : undefined}
                  >
                    {a.title}
                  </Link>
                ))}
            </section>
          ))}
          {!filtered.length && <p>Aucun guide trouvé.</p>}
        </aside>
        <main className={styles.main}>
          {article ? (
            <>
              <Link
                className={styles.back}
                href="/doc"
                onNavigate={() => setTerm("")}
              >
                ← Tous les guides
              </Link>
              <span className={styles.category}>{article.category}</span>
              <h1>{article.title}</h1>
              <p className={styles.lead}>{article.description}</p>
              <nav className={styles.contents} aria-label="Sommaire">
                {article.sections.map((section, index) => (
                  <a href={"#section-" + index} key={index}>
                    {section.title}
                  </a>
                ))}
              </nav>
              {article.sections.map((section, index) => (
                <section
                  className={styles.section}
                  id={"section-" + index}
                  key={index}
                >
                  <h2>{section.title}</h2>
                  {section.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {section.steps && (
                    <ol>
                      {section.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  )}
                </section>
              ))}
              {article.href && (
                <Link className="button primary" href={article.href}>
                  Ouvrir cette fonction <ArrowRight size={14} />
                </Link>
              )}
              <footer className={styles.footer}>
                Guide Relay · Mis à jour le 6 octobre 2026
              </footer>
            </>
          ) : (
            <>
              <span className={styles.category}>
                <BookOpen size={14} /> CENTRE D’AIDE RELAY
              </span>
              <h1>
                Le guide de votre CRM.
                <br />
                Une action à la fois.
              </h1>
              <p className={styles.lead}>
                Des guides concrets pour organiser vos relations, suivre vos
                ventes et travailler avec votre équipe.
              </p>
              <p role="status" className={styles.resultCount}>
                {term
                  ? filtered.length + " guide(s) pour « " + term + " »"
                  : helpArticles.length +
                    " guides pour utiliser Relay au quotidien"}
              </p>
              {!filtered.length && (
                <div className={styles.contents}>
                  <p>
                    Aucun guide ne correspond à votre recherche. Essayez «
                    contact », « importer », « email » ou « vente ».
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setTerm("")}
                  >
                    Afficher tous les guides
                  </button>
                </div>
              )}
              <div className={styles.cards}>
                {filtered.map((a) => (
                  <Link
                    onNavigate={() => setTerm("")}
                    href={"/doc?article=" + a.id}
                    key={a.id}
                  >
                    <small>{a.category}</small>
                    <h2>{a.title}</h2>
                    <p>{a.description}</p>
                    <span>
                      Lire le guide <ArrowRight size={14} />
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
