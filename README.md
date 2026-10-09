# Relay CRM

CRM B2B en français : Next.js 16, React 19, TypeScript, Supabase Auth/PostgreSQL/Storage et worker Node.js. Web sur Vercel, worker sur Railway. Les versions installées font référence dans [package.json](package.json) et son lockfile.

## Commencer

1. Installer Node.js 24 et exécuter `npm ci`.
2. Copier `.env.example` vers `.env.local` et renseigner les variables Supabase de développement.
3. Utiliser un projet Supabase de développement initialisé avec les migrations versionnées ; la production ne sert pas de bac à sable.
4. Exécuter `npm run dev`, puis ouvrir http://127.0.0.1:3000.
5. Pour les tâches différées, configurer les variables serveur et lancer `npm run worker` dans un second terminal.

`/login` permet de se connecter, `/login?mode=signup` de créer un compte, `/app` ouvre le CRM, `/demo` présente des données fictives et `/doc` est l'aide utilisateur.

Un nouveau développeur commence par [CONTRIBUTING](CONTRIBUTING.md), puis [l'architecture](docs/architecture/README.md). Toutes les notes sont indexées dans [docs/README.md](docs/README.md). Le précédent guide est conservé dans [l'historique](docs/history/README-2026-10-08.md).

## Où intervenir

| Besoin | Emplacement |
| --- | --- |
| Routes, layouts, endpoints HTTP | `src/app/`, `src/proxy.ts` |
| Écrans du CRM | `src/components/pages/` et composants de la fonctionnalité |
| Fiches et vues CRM | `src/components/records/`, `src/lib/domain/` |
| Ask Relay | `src/components/assistant/`, `src/lib/agent/`, routes `assistant/` |
| Dashboard et rapports | `src/components/dashboard/`, `src/components/reports/`, `src/lib/api/dashboards.ts` |
| Paramètres, équipe et droits | `src/components/settings/`, `src/lib/team/`, routes `team/` |
| OAuth, emails, calendriers et réunions | `src/lib/integrations/` |
| Queue et exécution différée | `src/lib/jobs/`, `scripts/worker.mts` |
| Schéma et permissions SQL | `supabase/migrations/` |
| Tests | Fichiers `.test.ts(x)`, `supabase/tests/`, `scripts/tests/` |
| Aide visible dans le produit | `src/lib/help/guides.ts`, `src/components/help/` |

Les routes et le point d'entrée du worker suivent les conventions des hébergeurs ; leurs configurations restent à la racine. Voir [les responsabilités et flux](docs/architecture/README.md).

## Fonctions présentes

Espaces de travail et rôles ; personnes, entreprises, opportunités et objets personnalisés ; relations, vues, listes et pipelines ; tâches, notes, documents, réunions, engagements et contradictions ; imports/exports et doublons ; dashboards et rapports ; automatisations, séquences, portail client et supervision des jobs.

Ask Relay dispose de recherches et agrégations CRM, sources vérifiées, confirmations exactes et outbox privée. OpenAI ou le branchement temporaire Groq est choisi par `AI_PROVIDER` ; voir [les variables web](deploy/web.env.example) et [worker](deploy/worker.env.example). Les variables Vercel ne configurent pas Railway automatiquement.

Gmail, Outlook, calendriers Google/Microsoft, Meet, Teams, Zoom et Zapier nécessitent les autorisations des fournisseurs. Les connecteurs de réunions importent les transcriptions disponibles ; ils ne constituent pas un bot d'enregistrement. Aucun paiement Stripe n'est intégré. Voir [les intégrations](docs/operations/integrations.md) et [les limites actuelles](docs/architecture/repository-audit.md).

## Validation

```sh
npm run check:structure
npm run typecheck
npm run lint
npm test
npm run build
```

La CI vérifie aussi les migrations et scénarios SQL sur PostgreSQL jetable. Les tests de charge et de concurrence sont isolés ; commandes et résultats figurent dans [le dossier performances](docs/performance/README.md). Les intégrations réelles et la capacité globale de production nécessitent une validation distincte.

## Base et déploiement

[supabase/migrations](supabase/migrations) est l'historique canonique. Une migration appliquée est immuable ; un changement de schéma demande une nouvelle migration. Les sept scripts SQL d'origine sont conservés dans [supabase/legacy](supabase/legacy/README.md) pour référence, pas pour rejouer la base.

Le 9 octobre 2026, les 42 migrations versionnées étaient alignées avec Supabase. Les variables, l'ordre d'application, health checks et rollback sont dans [le guide de déploiement](docs/operations/deployment.md). Les lectures utilisateur restent soumises à RLS ; clés privilégiées et tokens OAuth restent côté serveur.
