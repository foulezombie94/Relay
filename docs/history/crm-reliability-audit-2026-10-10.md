# Audit ciblé de fiabilité CRM — 10 octobre 2026

Ce rapport décrit les corrections locales et les vérifications réalisées à cette date. Il ne constitue pas une validation d’un déploiement en production. Le périmètre suit la mission fournie : cinq problèmes de fiabilité, sans refonte du design ni ajout de fonctionnalité métier.

## Problème 1 — TEST / PROD

**Cause :** configuration locale pointant vers la production, absence de lien explicite entre environnement/référence/URL et lanceurs SQL sans restriction de destination.

**Correction :** configuration commune obligatoire, refus des mélanges et des credentials privilégiés publics, validation au build/démarrage et bases SQL de test limitées à loopback `relay_test*` sans paramètres de connexion alternatifs.

**Fichiers modifiés :** `src/lib/supabase/{config,client,server,admin}.ts`, `src/proxy.ts`, `src/instrumentation.ts`, `next.config.ts`, `.env.example`, `deploy/*.env.example`, `scripts/tests/database-target.ts` et les sept lanceurs SQL ; documentation de déploiement.

**Test effectué :** matrices de configuration, rejection de destinations distantes, build avec une configuration TEST locale ; MCP production en lecture seule.

**Résultat :** garde-fous testés. Isolation entre deux projets **à investiguer** : l’utilisateur confirme que TEST n’existe pas encore. Aucun test d’écriture n’a touché la production APP TQT (`duhnmyxpxizxbxlhbtzs`).

## Problème 2 — FORMULAIRE / UNDEFINED

**Cause :** parsing sans validation complète de FormData et de l’enveloppe PATCH ; emails, champs obligatoires et données custom insuffisamment contrôlés.

**Correction :** validation frontend et backend, chaînes trimées, emails/téléphones/UUID/dates/JSON contrôlés, refus des valeurs absentes ou invalides et messages utilisateur. L’email d’une fiche CRM reste facultatif quand le modèle métier le prévoit ; un email obligatoire dans Auth ou un attribut configuré obligatoire est refusé s’il manque.

**Fichiers modifiés :** `src/components/ui.tsx`, `src/components/ui/editor-values.ts`, éditeurs de fiches, `src/lib/domain/{resource-schemas,attributes}.ts`, routes ressources/espaces et formulaires login/reset-password.

**Test effectué :** noms vides/espaces, email invalide ou undefined/null, téléphone, date impossible, JSON malformé, ID/version invalide et payload PATCH vide.

**Résultat :** contrôles testés ; aucune exception JS non gérée dans les pages vérifiées au navigateur.

## Problème 3 — RÉSEAU / ECONNRESET

**Cause :** helper sans timeout et erreurs réseau brutes ; certains formulaires pouvaient rester bloqués après rejet d’un appel Auth.

**Correction :** délai API de 30 s (60 s pour l’import), fetch Supabase de 25 s, erreurs réseau/timeout distinctes, loading réinitialisé, boutons et fermeture protégés pendant l’écriture. Pas de reprise automatique des écritures incertaines.

**Fichiers modifiés :** `src/lib/api/request.ts`, `src/lib/supabase/fetch.ts`, clients Supabase, provider, import, login/reset-password et helper Auth.

**Test effectué :** coupure avant/pendant réponse, expiration pendant lecture JSON, réponse invalide, Auth interrompue au navigateur, conservation des champs et possibilité de réessayer.

**Résultat :** scénarios testés ; messages techniques internes masqués.

## Problème 4 — SERVEUR 500

**Cause :** erreurs SQL trop souvent classées 400, JSON invalide non distingué, lectures dépendantes non vérifiées et contexte de diagnostic insuffisant.

**Correction :** statuts cohérents, toutes les lectures dépendantes du chemin de sauvegarde contrôlées, réponse 5xx générique avec request ID et logs privés. Validation avant accès aux propriétés.

**Fichiers modifiés :** `src/lib/api/context.ts`, `src/app/api/[workspace]/[resource]/route.ts`, routes workspaces/imports et instrumentation.

**Test effectué :** 400/401/403/409/500/503, SQL refusé, lecture préalable indisponible, vérification de l’absence de détails SQL sensibles dans les réponses. Le navigateur contrôle aussi les API 400/401/403.

**Résultat :** scénarios testés ; les filtres Sentry existants sont conservés.

## Problème 5 — DONNÉES PERDUES / 0 LIGNE

**Cause :** succès frontend sans vérification de la ligne, absence de brouillon et risque de création en double après perte de la réponse.

**Correction :** succès uniquement après retour de la bonne ligne, zéro ligne refusée, clé de création stable à la reprise, contrôle des valeurs rejouées, verrou synchrone contre doubles clics et brouillons par environnement/utilisateur/espace/fiche. Un rechargement pendant l’envoi conserve le brouillon complet capturé avant désactivation des champs. Les sélections du calendrier sont également sauvegardées avant soumission et son popover est bloqué pendant l’écriture.

**Fichiers modifiés :** provider, `src/lib/api/{request,save-attempt}.ts`, route ressources, `src/components/ui.tsx`, `src/components/ui/editor-draft.tsx`, `src/components/ui/date-picker.tsx`, import et `src/lib/domain/import-result.ts` ; tests React/API et `supabase/tests/crm-save-reliability.sql`.

**Test effectué :** parcours React avec réponse confirmée, résultat null/vide/incohérent, erreur serveur/réseau, double soumission, rechargement pendant sauvegarde, reprise de création et SQL réel insert/update/version périmée/RLS/espace différent.

**Résultat :** correctifs testés sur ces flux. La garantie globale reste **à investiguer** tant que le parcours authentifié complet n’est pas exécuté sur Supabase TEST. Le stockage navigateur bloqué, la fermeture de l’onglet ou l’expiration des brouillons empêchent une garantie de sauvegarde durable. Une création d’espace via son RPC ne bénéficie pas de la clé de reprise des ressources CRM.

## Scénarios A à M

| Cas                     | Vérification                                                                       | Résultat / limite                                                                |
| ----------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Parcours valide         | Formulaire React → helper → réponse confirmée ; insert/update dans PostgreSQL réel | Passe en tests complémentaires ; parcours navigateur authentifié complet restant |
| A. Obligatoire vide     | FormData et schémas API                                                            | Refus propre avant mutation                                                      |
| B. Email invalide       | Formulaire, Auth et schémas backend                                                | Refus propre                                                                     |
| C. Undefined/null       | FormData, enveloppe API et confirmation de résultat                                | Pas d’accès JS non protégé sur les chemins testés                                |
| D. Réseau coupé avant   | Fetch rejeté et Auth interrompue au navigateur                                     | Champs conservés, bouton réactivé                                                |
| E. Coupure pendant      | Rejet de lecture de réponse / réponse perdue                                       | Pas de succès ; reprise de création avec même UUID                               |
| F. Timeout              | Fetch et lecture de réponse sous AbortController                                   | Message explicite et saisie conservée                                            |
| G. Serveur 500          | Request et route simulant erreur DB interne                                        | Message masqué, request ID, aucun succès                                         |
| H. Écriture refusée     | Route avec erreur SQL, SQL réel viewer et autre espace                             | Refus et RLS conservés                                                           |
| I. Zéro ligne           | API/frontend et update SQL périmé                                                  | Échec explicite                                                                  |
| J. Double clic          | Formulaire/provider avec promesse en attente                                       | Une mutation                                                                     |
| K. Rechargement pendant | Beforeunload, remontage et restauration du brouillon                               | Passe avec stockage disponible ; pas encore E2E CRM authentifié                  |
| L. TEST                 | Configuration isolée et DB locale jetable                                          | Passe localement ; projet Supabase TEST absent                                   |
| M. PRODUCTION           | Matrice de configuration et audit MCP en lecture seule                             | Garde-fous testés ; variables déployées et écritures non validées                |

## Vérifications finales

- `npm test` : **390 tests, 54 fichiers**.
- `npm run test:performance:db` : **17 suites SQL**, dont RLS, transactions, queue et nouvelle suite de fiabilité.
- **42 migrations** rejouées sur PostgreSQL local jetable. Aucune migration appliquée n’est modifiée.
- `npm run build` avec configuration TEST locale : build optimisé Next.js réussi ; ce n’est pas le déploiement de production.
- `npm run typecheck`, `npm run lint`, `npm run check:structure`, `npm run format:check` et `git diff --check` : réussite. Le lint conserve **15 avertissements préexistants**, zéro erreur.
- Smoke Chromium : accueil, login, reset-password et démo ; interruption Auth avec champs conservés, API 400/401/403 et zéro exception JS non gérée.
- `npm audit --omit=dev` : zéro vulnérabilité connue après remplacement ciblé de l’UUID transitif d’ExcelJS ; test de classeur réel avec mise en forme conditionnelle.

Les tests SQL utilisent PostgreSQL 18 local, un bootstrap Auth et un substitut minimal de cron ; la production est Supabase PostgreSQL 17. Ces tests ne répliquent pas le service Supabase Auth, les connexions OAuth, les workers déployés ou tous les effets externes. Les pannes et réponses API sont injectées en tests pour vérifier les comportements ; elles ne sont pas présentées comme des écritures effectuées en production.

## Actions restantes avant validation production

1. Créer/configurer un projet Supabase TEST distinct avec ses propres clés, bucket, callbacks Auth/OAuth, webhooks et worker.
2. Renseigner les nouvelles variables de séparation dans chaque environnement puis reconstruire le web ; contrôler aussi les variables du worker. Une configuration incomplète échoue désormais explicitement.
3. Exécuter le parcours navigateur authentifié complet sur TEST, les pannes de sauvegarde, puis vérifier qu’aucune ligne de TEST n’apparaît dans la production et réciproquement.
4. Traiter l’advisor Auth « leaked password protection » dans la configuration Supabase si l’offre le permet. Voir [le rapport de sécurité](../../security_best_practices_report.md).

- **BUILD : OK**
- **TYPECHECK : OK**
- **TESTS : OK**
- **RISQUE DE PERTE DE DONNÉES : À INVESTIGUER** — correctifs vérifiés sur les flux testés, validation authentifiée restante.
- **ISOLATION TEST/PROD : À INVESTIGUER** — garde-fous vérifiés, deuxième projet absent.
- **PRÊT POUR PRODUCTION : NON** — terminer les vérifications externes ci-dessus.
