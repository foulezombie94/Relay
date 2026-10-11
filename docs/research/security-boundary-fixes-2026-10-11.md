# Corrections ciblées de sécurité — 11 octobre 2026

Revue manuelle de `796f2a5`, puis corrections limitées aux scénarios reproduits.
Le serveur de scan automatisé Codex Security n'était pas disponible ; ce document
ne constitue pas un rapport de scan généré par ce service.

## Credentials OAuth anciens

Les RPC `integration_get`, `integration_oauth_begin`, `integration_oauth_consume`,
`integration_save` et `integration_refresh_*` étaient exécutables par un navigateur
authentifié. Un utilisateur pouvait récupérer son ciphertext, créer/consommer un
état OAuth fictif et réinstaller ce ciphertext dans un autre workspace dont il
était membre, avec des métadonnées de compte fabriquées. Le test local a reproduit
ce chemin. Aucune lecture de token en clair ni accès au compte d'un autre utilisateur
n'a été démontré.

La nouvelle migration retire les droits dans les deux schémas. `integration_server`
est réservé à `service_role`, vérifie l'appartenance et le rôle actuels et réutilise
les contrôles OAuth, révision et lease. Le serveur reconstruit l'utilisateur avec
`auth.getUser()`. Le worker conserve son adaptateur existant et ses contrôles.
Les connexions chiffrées existantes restent compatibles ; aucune clé ne change.

## Quotas OAuth MCP

Les requêtes invalides consommaient un compteur OAuth commun avant validation.
120 refresh invalides bloquaient un refresh légitime dans le test PostgreSQL local.
Les compteurs publics sont désormais isolés par source réseau vérifiée par le
serveur, puis par connexion après validation du grant. Un refus de quota ne
consomme pas le code/token. La détection de réutilisation d'un refresh et la
révocation de sa famille restent prioritaires sur le quota de connexion.

Le déploiement web documenté est Vercel. Le serveur utilise uniquement
`x-vercel-forwarded-for` lorsque `VERCEL=1` et stocke un HMAC de l'adresse avec la
clé serveur Supabase ; aucun IP brut n'est envoyé en base ou journalisé. Les
headers ordinaires `X-Forwarded-For` et les clés du navigateur sont ignorés.
L'inscription des clients OAuth est limitée à 20/min/source ; autorisation,
échange et refresh à 240/min/source, échanges/refresh valides à 60/min/connexion.
Un NAT partage son quota de source. Les quotas métier par workspace restent actifs.
La configuration production refuse les opérations publiques OAuth si la source
Vercel vérifiée manque. Un autre hébergeur nécessite un adaptateur de proxy de
confiance explicite avant activation ; ne pas accepter un header client en fallback.
Cette protection ne remplace pas une défense anti-DDoS à la périphérie.

## Portails : hypothèse non reproduite

Le projet utilise l'auto-confirmation email. Toutefois, le trigger d'audit existant
rejette la tentative de claim d'un utilisateur extérieur au workspace. Le test
local confirme l'absence d'accès et de mutation de la liaison après ce rejet.
Aucune modification de l'inscription, des bindings clients ou de ce garde-fou
n'est nécessaire pour ce scénario. Le test est conservé pour empêcher sa régression.

## Validation

Les reproductions utilisent exclusivement des utilisateurs synthétiques et des
transactions annulées sur PostgreSQL local. Aucun signup, appel de fournisseur,
envoi externe ou test d'attaque n'est exécuté sur la production. Les tests ajoutés
couvrent le refus des RPC depuis les deux schémas, l'identité reconstruite côté
serveur, l'accès du worker, le changement de rôle, l'isolation des quotas et la
révocation de refresh réutilisé. Les connexions OAuth réelles nécessitent encore
des applications et comptes de test fournisseurs.

Contrôles réalisés sur la correction :

| Contrôle                                                         | Résultat                                  |
| ---------------------------------------------------------------- | ----------------------------------------- |
| `npm test`                                                       | 637 tests, 84 fichiers, réussis           |
| `npm run typecheck`                                              | Réussi                                    |
| `npm run lint`                                                   | 0 erreur ; 15 avertissements préexistants |
| `npm run check:structure`                                        | Réussi                                    |
| `npm run format:check`                                           | Tout le projet conforme à Prettier        |
| `npm run check:secrets`                                          | Réussi                                    |
| `npm run build`                                                  | Réussi avec configuration locale isolée   |
| `npm run check:secrets:bundles`                                  | 124 artefacts du build analysés, réussi   |
| Scanner des logs tests/SQL/build                                 | 3 artefacts analysés, réussi              |
| `test:performance:db`, `test:integrations:db`, `test:mcp:db`     | Réussis sur PostgreSQL local              |
| Migrations, préparation et enforcement sur une seconde base vide | Réussis, régressions SQL et MCP réussies  |
| Revue indépendante de contournements/régressions                 | Aucun problème concret identifié          |

Ces résultats valident les deux corrections et les contrôles existants couverts
par les tests. Ils ne certifient pas l'absence de toute autre faille dans l'app.
Les sessions réelles Claude Code/Codex et les callbacks des fournisseurs ne sont
pas validés par ces tests locaux.

Préparer d'abord le gateway serveur, déployer les nouvelles routes puis appliquer
la migration d'enforcement après confirmation du déploiement web. L'ancien
code ne doit pas conserver un chemin de lecture de credentials avec le rôle
utilisateur. Le rollback applicatif seul vers l'ancien code casserait ce chemin ;
ne pas rétablir les droits du navigateur pour contourner cette erreur.

## Activation en production

Le gateway a été préparé dans APP TQT (`duhnmyxpxizxbxlhbtzs`) avec la migration
`20261011204859_prepare_server_credential_gateway`. Vercel et Railway ont confirmé
le succès du déploiement applicatif `1721689` avant application de
`20261011205143_server_credentials_and_isolated_oauth_limits`.

La vérification de catalogue après application confirme : 12 routines de
credentials contrôlées, aucun droit EXECUTE pour `anon`/`authenticated`, gateway
autorisé uniquement au service, nouveaux quotas source/connexion présents et
anciens compteurs globaux retirés. Toutes les tables publiques conservent RLS.
Ces contrôles de production sont des lectures de configuration et de catalogue,
pas des attaques ni des transactions métier réelles.
