import Link from "next/link";
import type { Metadata } from "next";
import { McpInstaller } from "@/components/mcp/installer";
import styles from "@/components/mcp/mcp.module.css";
export const metadata: Metadata = {
  title: "MCP Zyliad — Claude Code et Codex",
  description:
    "Connectez votre CRM Zyliad à Claude Code et Codex avec OAuth, des permissions par workspace et des modifications confirmées.",
};
export default function McpPage() {
  return (
    <main style={{ maxWidth: 1000, margin: "70px auto", padding: "0 24px" }}>
      <Link href="/">← Zyliad</Link>
      <p className={styles.eyebrow} style={{ marginTop: 36 }}>
        MCP DISTANT · SDK V2
      </p>
      <h1>Votre CRM, dans votre environnement de travail.</h1>
      <p style={{ marginBottom: 32, lineHeight: 1.7 }}>
        Retrouvez vos contacts, tâches, notes et réunions depuis Claude Code et Codex. Connectez
        votre compte Zyliad et choisissez un espace : aucun secret d’intégration n’est transmis à
        l’IA.
      </p>
      <McpInstaller />
      <section style={{ marginTop: 40, lineHeight: 1.8 }}>
        <h2>Une connexion, des permissions explicites</h2>
        <ol>
          <li>Copiez la commande adaptée à votre client.</li>
          <li>Connectez-vous à Zyliad dans le navigateur.</li>
          <li>Choisissez votre espace et les permissions accordées.</li>
          <li>
            Demandez à votre assistant de rechercher un contact, préparer un rendez-vous ou analyser
            vos opportunités.
          </li>
          <li>
            Confirmez les modifications proposées dans{" "}
            <Link href="/app/settings#developpeurs">Paramètres → Développeurs</Link>.
          </li>
        </ol>
        <h2>Ce que le MCP peut faire</h2>
        <p>
          Recherches paginées, lecture par extraits, agrégats et propositions de
          création/modification de fiches, tâches et notes. Emails et calendriers proviennent des
          données déjà synchronisées. Les documents proviennent du texte déjà indexé.
        </p>
        <p>
          Le MCP n’envoie pas d’emails, ne télécharge pas votre boîte complète, ne supprime pas de
          données et ne modifie pas les permissions. Les notes créées sont privées ; leur partage
          demande une confirmation séparée.
        </p>
        <h2>Garder le contrôle</h2>
        <p>
          Les règles d’accès Zyliad s’appliquent à chaque appel. L’accès expire après 30 jours au
          maximum et peut être révoqué immédiatement dans vos paramètres. Une proposition expire
          après 15 minutes ; sa validation revérifie vos droits et la version de la fiche.
        </p>
        <h2>Dépannage</h2>
        <p>
          Si l’accès expire ou est révoqué, reconnectez Zyliad depuis <code>/mcp</code> dans Claude
          Code ou <code>codex mcp login zyliad</code>. En cas de limite de requêtes, attendez une
          minute. Les clients anciens peuvent utiliser le pont npx/npm ; les clients distants n’ont
          besoin d’aucun package local.
        </p>
      </section>
    </main>
  );
}
