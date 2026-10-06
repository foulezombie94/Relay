# Relay CRM

CRM B2B en français : Next.js, React, TypeScript, Supabase Auth, Postgres et Storage. Aucun Stripe.

## Démarrage

Installez Node.js 24 et les dépendances avec `npm ci`. Copiez `.env.example` vers `.env.local`, puis renseignez les clés Supabase. Les secrets et `.env.local` sont exclus de Git.

`npm run dev` ouvre le serveur sur http://127.0.0.1:3000. Créez un compte, confirmez votre email si nécessaire puis créez votre espace. `/demo` est une démonstration fictive en lecture seule.

## Fonctionnalités

- Espaces de travail, connexion, inscription, récupération, invitations et quatre rôles.
- Personnes, entreprises, opportunités, objets personnalisés et attributs typés. Tableaux, Kanban, vues sauvegardées, recherche et archivage.
- Listes privées ou partagées, notes, tâches, activités, transcriptions importées et documents privés (20 Mo maximum).
- Engagements avec preuves, contradictions à examiner, portail client isolé et dossier de réalisation des ventes gagnées.
- Simulation de workflows avec snapshot serveur, versions, expiration et confirmation avant écriture ; guides d’action à adapter.
- Assistant IA avec contexte autorisé et propositions à approuver, nécessitant une clé OpenAI.
- Import CSV / Excel avec association des colonnes, aperçu, validation, historique et écriture atomique/idempotente (5 Mo, 1 000 lignes). Export filtré.
- Pipelines configurables, probabilités par étape et par opportunité, raisons de perte. Rapports par devise : pipeline ouvert, forecast pondéré, gagné/perdu, dates prévues et résultats mensuels issus du journal. Comparaison des hypothèses avec les taux de victoire observés, échantillons faibles signalés.
- Recherche globale textuelle dans fiches, notes, tâches, engagements et réunions avec les droits RLS. Modèles email partagés avec variables et envoi manuel confirmé via le compte connecté.
- Centre d’aide public `/doc` : dix guides avec recherche et limites explicites.
- Gmail, Google Calendar, Outlook et Outlook Calendar : OAuth séparé, import manuel de 25 éléments par service, emails confirmés et calendriers en lecture. Identifiants fournisseur à configurer. Zapier : clé API révocable, lecture des fiches/tâches et création optionnelle, expiration, contrôle des permissions et idempotence.
- Priorités expliquées, contexte chronologique et relations entre fiches.
- Doublons : comparaison côte à côte, modification et recalcul, aperçu et confirmation ; séparation persistante ou report de sept jours. Fusion et annulation administrateur, versions serveur, transaction atomique et journal durable.

La couverture complète du prompt et la parité avec Attio ne sont pas acquises. Voir [couverture](docs/feature-coverage.md), [analyse concurrentielle](docs/competitive-analysis.md) et [fusion/restauration](docs/duplicate-lifecycle.md).

## Configuration externe

`OPENAI_API_KEY` active l’assistant ; `OPENAI_MODEL` vaut gpt-4.1-mini par défaut. Les variables `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID` et `MICROSOFT_CLIENT_SECRET` activent OAuth. `INTEGRATION_ENCRYPTION_KEY` est une clé AES de 32 octets en base64 : ne la changez pas sans migration des jetons.

`APP_URL` doit correspondre à l’origine publique. Les quatre callbacks Gmail, Google Calendar, Outlook et Outlook Calendar sont détaillés dans docs/integrations.md. Configurez applications, permissions et redirections auprès des fournisseurs. Dans Supabase Auth, autorisez les URL `/auth/confirm` et `/auth/confirm?next=/reset-password` de votre origine et réglez Site URL. Les intégrations restent à valider avec une connexion réelle.

Les invitations sont enregistrées ; partagez le lien de connexion manuellement. Aucun email automatique d’invitation. Les adresses doivent être vérifiées pour rattacher un compte invité.

## Base et migrations

`schema.sql`, `operations.sql`, `finishing.sql`, `integrations.sql`, `communications.sql`, `crm-improvements.sql` et `merge-consistency.sql` ont déjà été appliqués au projet duhnmyxpxizxbxlhbtzs via la CLI et l’API de gestion Supabase. Les migrations `20261006095630_duplicate_decisions_and_undo.sql` et `20261006102036_secure_service_connections.sql` sont également appliquées.

Les copies dans `supabase/migrations` permettent d’initialiser une nouvelle base. L’historique du projet existant n’a pas été réconcilié : réconciliez-le avant `db push` et ne rejouez pas les migrations initiales sur cette base.

Les requêtes utilisent la session et les politiques RLS. Les sauvegardes de restauration contenant du contexte privé restent dans `relay_private`, inaccessible aux utilisateurs ordinaires. Les secrets ne sont jamais importés par les composants client.

## Vérifications et publication

Le 6 octobre 2026 : compilation de production et TypeScript réussis, douze tests unitaires (dont six sur les intégrations), dix contrôles SQL de fusion/restauration et les contrôles SQL de connexions réussis. Les fixtures SQL sont annulées avec ROLLBACK. Ces contrôles ne constituent pas une QA complète du CRM ni des fournisseurs externes.

Commandes : `npm run typecheck`, `npm test`, `npm run build`, puis `npm start`. Sur ce poste Windows, le build passe avec Node.js 24.19.0 ; Node.js 24.12.0 rencontre une erreur de fichier de trace.

Tests SQL, avec connexion Supabase propriétaire et au moins un compte Auth existant :

```powershell
npx supabase db query --linked --project-ref duhnmyxpxizxbxlhbtzs --file supabase/tests/duplicate-lifecycle.sql -o json
```

GitHub contient code, migrations et CI (TypeScript, tests, build). La publication du dépôt ne crée pas un hébergement web : configurez les variables, APP_URL et les redirections sur votre hébergeur Next.js.

Les exports sont synchrones. Les workers, files de tâches volumineuses, mesures de charge et capacités Enterprise restent à développer. Un envoi manuel ambigu n’est pas automatiquement relancé. Révoquez aussi le consentement fournisseur lors de la déconnexion.

## Ajouts commerciaux du 6 octobre 2026

Migration `20261006113312_commercial_workflow_foundations.sql` appliquée au projet existant. L’ancien historique de migrations reste à réconcilier avant un `db push`.

Contrôles ciblés : 13 tests de calcul/import/modèles/historique, 10 contrôles SQL transactionnels (RLS, notes privées, import atomique et idempotent, versions et rôles), fixtures annulées avec ROLLBACK. Aucun email de test envoyé. À la demande de l’utilisateur, les pages de cette dernière évolution ne sont pas vérifiées dans le navigateur.

Les taux historiques utilisent le journal disponible, les opportunités non archivées actuellement gagnées/perdues et leurs pipeline/responsable actuels. Les montants mensuels reprennent les valeurs actuelles des fiches ; ils ne constituent pas une comptabilité. Détails : [écarts concurrentiels](docs/competitive-gap-analysis.md).
