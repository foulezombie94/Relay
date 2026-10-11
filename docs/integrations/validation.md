# Validation de la plateforme

Contrôles du 10 octobre 2026 sur un PostgreSQL 17 jetable local et des réponses Google simulées. Aucune fixture ni test d’envoi n’est exécuté sur le projet Supabase de production.

Résultats de ce lot : **473 tests unitaires dans 64 fichiers**, dont 60 tests du framework ; six groupes d’assertions SQL d’intégrations, dix-huit suites SQL de régression et les suites de concurrence agent/tokens passent. Typecheck, structure, Prettier et build passent. ESLint termine sans erreur, avec quinze avertissements préexistants hors de ce framework. Le scan des sources, du log de tests et de **102 artifacts navigateur** passe. Le chargement des handlers sous les conditions Node du worker est également validé.

Migration appliquée sur APP TQT après validation locale : dix nouvelles tables privées protégées par RLS, aucun accès direct `anon/authenticated/service_role` au vault et grants RPC vérifiés. Les définitions du worker/scheduler en production correspondent à celles testées localement. Le MCP attribuant automatiquement une version horaire, la nouvelle entrée d’historique a été alignée sur `20261010180031` après comparaison du hash exact du SQL ; aucun fichier de migration appliqué ni ancienne entrée n’a été modifié. Le framework demeure désactivé par défaut.

## Exécuter les contrôles

`npm run test:integrations` teste le vault, les résultats sans credentials, les règles de confirmation/permissions, OAuth/PKCE, la validation Pub/Sub/Calendar et les actions Google. `npm run test:integrations:db` utilise uniquement `RELAY_TEST_DATABASE_URL` pointant vers un loopback et une base `relay_test_*` initialisée par le runner de migrations.

La suite SQL couvre les mauvais utilisateurs/workspaces/providers, états expirés ou réutilisés, refus d’accès navigateur au vault et RPC serveur, projection des métadonnées, refresh sérialisé, confirmation exacte et permission retirée, single dispatch, cursor et lease périmés, identifiants Calendar contenant un email, déduplication, notifications après un sync déjà terminé, cooldown fournisseur, annulation de la seule connexion visée, changement de compte, membership rétrogradé et présence de RLS sur toutes les nouvelles tables.

Contrôles de publication : `npm run check:structure`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run format:check`, `npm run check:secrets` et `npm run check:secrets:bundles`. La CI capture les logs unitaires et les scanne aussi. Secretlint utilise le preset recommandé ; ses seules exceptions correspondent exactement aux six URLs fictives déjà utilisées par les tests de frontières et le PostgreSQL local CI. Aucune règle globale de secrets n’est désactivée.

## Validation réelle encore nécessaire

Les tests simulés ne prouvent pas que Google a approuvé l’application, que les scopes sont disponibles pour un client donné, ni que ses tokens se renouvellent réellement. Aucune connexion/déconnexion OAuth réelle n’a été validée : les applications et comptes de test ne sont pas encore créés.

Sur des comptes dédiés, vérifier : création d’une connexion Calendar minimale ; consentement Gmail supplémentaire sans perdre Calendar ; identité d’un second compte et destruction des mappings du premier ; refresh expiré/révoqué ; lecture bornée ; création et mise à jour avec ETag ; envoi explicitement confirmé ; Sheets RAW ; fichiers explicitement partagés ; rejet de notifications invalides ; reprise après panne et 429 ; déconnexion distante et destruction locale.

La création/rotation des abonnements Gmail/Pub/Sub, le renouvellement Calendar/Drive, le polling de secours, les tools agent/automations et la reprise opérateur de révocation doivent être terminés avant l’activation générale. Les quatorze autres intégrations doivent suivre leur propre documentation officielle et la même Definition of Done ; leur présence dans le catalogue ne vaut pas implémentation.

## Migration et retour arrière

La migration ajoute dix tables privées avec RLS, des RPC dont les grants sont explicitement restreints et les nouveaux types de jobs. Elle étend le worker existant tout en conservant les dispatchers workflow/agent. Vérifier la liste des migrations, les fonctions attendues et l’absence du nouveau schéma avant application ; vérifier ensuite les tables, grants, RLS et types de queue.

Conserver `FEATURE_INTEGRATION_PLATFORM=false` permet de publier les exécutables sans activer les nouveaux endpoints/jobs. Un rollback applicatif conserve les tables privées et les données chiffrées ; ne pas supprimer des migrations ni détruire les credentials nécessaires à une révocation. Ne pas marquer une connexion ou une intégration « terminée » sur la seule base d’un bouton Connect ou de tests simulés.

## Store et Manage — 11 octobre 2026

596 tests unitaires dans 77 fichiers passent, dont les nouveaux tests du catalogue, des routes et de la gestion Google. Les six groupes SQL du framework passent sur une base locale PostgreSQL 17 initialisée avec toutes les migrations immuables. Le MCP confirme en lecture seule la migration de fondation appliquée et les RLS/grants privés en production. Les parcours OAuth réels demeurent non validés faute d’applications/comptes fournisseurs. Voir [le périmètre détaillé](store.md).
