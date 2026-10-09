# Travailler sur Relay

Ce guide s'adresse aux développeurs humains et assistants de programmation. Les conventions supplémentaires de Next.js sont dans [AGENTS.md](AGENTS.md).

## Prise en main

Lire [le README](README.md), [l'architecture](docs/architecture/README.md), [l'analyse du dépôt](docs/architecture/repository-audit.md) et la fiche de la fonctionnalité dans [l'index documentaire](docs/README.md). Installer Node.js 24 avec `npm ci`. Dépendances et lockfile restent versionnés ensemble.

Utiliser un projet Supabase de développement. Les données de démonstration sont fictives ; les fixtures SQL ne sont pas des comptes de production. Ne jamais inscrire une clé réelle dans un exemple, commit, capture ou journal.

## Où créer un fichier

- `src/app/` : conventions Next.js, adaptation HTTP et sélection des écrans. Déplacer un dossier de routes peut changer les URL.
- `src/components/pages/` : composition des grands écrans ; composants spécialisés dans le dossier fonctionnel (`records`, `settings`, `assistant`, etc.).
- `src/components/ui/` : primitives partagées ; `ui.tsx` reste le point d'entrée existant des formulaires/dialogues. La landing utilise `ui/display.tsx`.
- `src/components/providers/` : contexte React, cache et préférences ; `layout/` : shell, sidebar et notifications.
- `src/lib/domain/` : types et calculs métier sans effet de bord ; ne pas y ajouter un accès SQL, réseau ou une clé serveur.
- `src/lib/api/` : contexte authentifié, validation et lectures métier des routes.
- `src/lib/agent/` : orchestration, outils, contrats, sécurité et fournisseur IA.
- `src/lib/integrations/` : adaptateurs externes ; `src/lib/jobs/` : queue et handlers différés ; `src/lib/observability/` : logs et monitoring.
- `supabase/migrations/` : changements SQL ; `supabase/tests/` : assertions SQL ; `scripts/tests/` : lanceurs de validation ; `scripts/maintenance/` : outils du dépôt.
- `docs/features/` : fonctionnalités ; `docs/architecture/` : conception actuelle ; `docs/operations/` : exploitation ; `docs/research/` : recherches datées ; `docs/history/` : archives ; `docs/performance/` : protocole et mesures.

Placer les CSS Modules avec leur fonctionnalité et les tests unitaires avec le module testé. Un dossier représente une responsabilité identifiable. Noms de fichiers en kebab-case ; exports React en PascalCase.

## Modifier une fonctionnalité

Suivre son chemin complet : écran → route → permission/validation → logique métier ou RPC → RLS et éventuel worker. Un nom de composant ou un schéma Zod ne prouve pas à lui seul qu'un comportement est livré.

Limiter chaque changement à un objectif et actualiser la documentation. Pour un déplacement, conserver les exports et corriger imports, re-exports, mocks, lectures de fichiers dans les tests, CSS et liens. `npm run check:structure` vérifie les références ; TypeScript et le build vérifient les contrats et la compilation Next.js.

Découper progressivement les grandes pages sous leur fonctionnalité. Séparer ce travail des modifications de permissions, outbox ou calculs métier pour faciliter revue et rollback. Éviter les reformattages massifs sans lien avec la tâche.

## Contrats à préserver

- Workspace et permissions actuelles viennent de la session, jamais d'une affirmation du modèle ou navigateur.
- `src/lib/supabase/admin.ts` et les modules `server-only` restent hors des dépendances du navigateur. Un Server Component peut les utiliser ; un composant client ne peut pas les embarquer.
- Emails, documents et transcriptions sont des données non fiables. Message utilisateur et résultats d'outils restent distincts ; une source n'autorise jamais une mutation.
- Une confirmation porte sur les paramètres exacts, expire et peut être refusée. L'exécution revérifie droits et quotas ; un refus ne réactive pas l'action.
- Outbox, leases et clés d'idempotence protègent l'unicité des effets. Un envoi incertain ne se rejoue pas à l'aveugle ; « envoyé » exige une confirmation fournisseur.
- Ne pas placer de contenus privés ou secrets dans un cache partagé ou les logs. Ne pas remplacer une lecture RLS par `adminDb()` pour accélérer une page.
- Landing et démonstrations utilisent des données fictives et composants de présentation ; `landing-isolation.test.ts` protège cette frontière.

## Migrations

Une migration appliquée ne se modifie ni ne se renomme. Créer une nouvelle migration avec la CLI, tester compatibilité et droits en développement, puis vérifier liste et dry-run avant application. Vérifier aussi le contrat worker s'il est concerné. Un rangement de fichiers ne demande pas de migration SQL.

Les scripts `supabase/legacy/` sont archivés ; `supabase/migrations/` fait référence. Ne pas relancer une initialisation sur une base existante. Voir [le déploiement](docs/operations/deployment.md) et [les tests SQL locaux](scripts/tests/README.md).

## Vérifier et proposer

Avant publication : `npm run check:structure`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, puis les contrôles SQL/intégrations pertinents si leurs contrats ont changé. Ne pas tester la charge sur la production. Utiliser des comptes dédiés pour les tests fournisseurs pouvant avoir des effets réels.

En équipe, utiliser branches et revue selon les règles GitHub du projet. Le template de PR décrit problème, changement, tests et risques. Un commit a une responsabilité claire ; les renommages représentent un déplacement, pas une seconde implémentation.

Après déploiement, vérifier le commit annoncé par Vercel/Railway et l'état de santé. Un endpoint sain peut encore appartenir à l'ancienne version. Les variables des deux services sont indépendantes.
