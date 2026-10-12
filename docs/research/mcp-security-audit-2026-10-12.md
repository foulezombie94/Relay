# Audit manuel de sécurité MCP — 12 octobre 2026

## Résultat

Une faille de substitution de demande OAuth a été reproduite puis corrigée. Aucun autre contournement confirmé des contrôles MCP n’a été trouvé dans le périmètre examiné. Ce constat ne garantit pas l’absence de toute vulnérabilité ou une protection absolue contre les attaques.

L’endpoint concerné est `https://relay-eight-topaz.vercel.app/api/mcp`. L’audit porte sur le code du dépôt, les tests locaux et les permissions SQL effectivement déployées ; aucune attaque, charge ou création de token n’a été effectuée contre cet endpoint de production. Le lanceur de scan Codex Security de l’app n’était pas disponible : ce document est un audit manuel, pas un rapport généré par ce service. Les instructions de correction ont été appliquées avec une investigation indépendante avant modification et une revue indépendante après modification. Les références auxiliaires du plugin non accessibles n’ont pas été remplacées par un scan ou des résultats fictifs.

## Faille confirmée : la page affichée pouvait autoriser une autre demande

**Impact : élevé, avec interaction utilisateur et une seconde navigation OAuth.** Une page de consentement affichait le client A. L’ouverture d’une autre demande OAuth remplaçait le cookie partagé `zyliad_mcp_flow` par celui du client B. Le formulaire de A envoyait seulement workspace, scopes et choix de l’utilisateur. Le serveur prenait donc le cookie B, et pouvait créer une autorisation pour B sans avoir montré B sur la page approuvée.

Un attaquant devait enregistrer un client public avec son propre callback HTTPS, connaître son propre vérificateur PKCE, provoquer une nouvelle navigation d’autorisation dans le navigateur de la victime alors que la page A restait ouverte, puis obtenir une approbation sur A. Les données exposables restaient limitées au workspace de la victime et aux scopes sélectionnés. PKCE protégeait le code de B mais ne liait pas l’approbation au client affiché. Origin, HttpOnly et SameSite ne suffisaient pas à lier ces deux états.

Le test HTTP avant correction recevait **200** au lieu d’un refus pour une approbation sans liaison au contexte affiché. Les mocks établissent la rupture au contrôle HTTP ; ils ne constituent pas une exploitation observée dans un navigateur réel de production.

### Correction

- Le rendu serveur calcule un `consent_context` à partir du cookie du flow réellement utilisé pour afficher le nom et les scopes.
- Ce contexte utilise SHA-256 avec séparation de domaine : il n’expose ni le cookie brut, ni son `flow_hash` utilisé par la RPC SQL.
- Le formulaire poste ce contexte pour **Autoriser et Refuser**.
- Le backend exige 64 caractères hexadécimaux et compare en temps constant au contexte du cookie actuel **avant** la vérification du workspace et l’appel de consentement SQL.
- Une page périmée reçoit un refus sans consommer ni supprimer la nouvelle demande.
- Le nom fourni par un client public est explicitement présenté comme non vérifié.

Les pages ouvertes avant la publication ou remplacées par une autre demande doivent être relancées. Registration, PKCE, échange de code, renouvellement, révocation, tokens déjà accordés et clients natifs restent inchangés. Aucune migration SQL n’est nécessaire.

## Périmètre et contrôles vérifiés

| Surface                  | Éléments examinés / validations                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/mcp`               | Bearer obligatoire ; cookies CRM, tokens en query et mauvais types rejetés ; Origin et Host vérifiés ; session vérifiée avant exposition des outils                        |
| OAuth                    | DCR public, callback enregistré exactement, PKCE S256, cookie HttpOnly, scopes, code à usage unique/expiration, contexte de consentement, refresh et révocation            |
| Outils MCP               | Schémas stricts, scopes par outil et par section, absence de tool SQL/URL arbitraire, résultats bornés, données externes marquées non fiables                              |
| SQL et tenants           | Vérification du token et reconstruction du workspace ; rôle NOLOGIN/NOBYPASSRLS ; lectures SECURITY INVOKER ; RLS ; FK composites ; sources privées et lecteurs restreints |
| Actions                  | Proposition uniquement depuis le MCP ; confirmation via session humaine ; valeurs exactes, versions, idempotence, révocation et expiration revérifiées                     |
| Secrets et télémétrie    | SHA-256 des tokens en base ; tables privées ; credentials fournisseur non consultés ; sorties nettoyées ; Sentry ne collecte pas headers/cookies/bodies                    |
| Protection du navigateur | React échappe le nom du client ; X-Frame-Options DENY et nosniff existants ; réponses OAuth sans cache                                                                     |

Les recherches et agrégats SQL dynamiques utilisent des tables/dimensions et colonnes issues de listes fixes, avec valeurs dans des paramètres `USING`. Les fonctions source et contexte revérifient les permissions sous RLS. Le client ne choisit jamais l’identité ou le tenant de la connexion via un argument d’outil.

### Vérification Supabase de production, en lecture seule

Projet APP TQT `duhnmyxpxizxbxlhbtzs` :

- Les sept tables `relay_private.mcp_*` ont RLS activé et aucun SELECT pour `authenticated`.
- `public.mcp_oauth` et `public.mcp_request` ne sont exécutables ni par `authenticated`, ni par `anon`.
- `mcp_consent` et `mcp_manage` restent réservés aux utilisateurs authentifiés ; c’est le contrat nécessaire au consentement et à la confirmation, avec contrôles serveur/SQL.
- `zyliad_mcp` n’a ni LOGIN, ni SUPERUSER, ni BYPASSRLS.
- Les migrations MCP et la restriction des credentials/budgets OAuth figurent dans l’historique de production.

Les fixtures et tests de contournement ont exclusivement utilisé une base PostgreSQL locale jetable.

## Validation

- Reproduction avant correction : test de consentement sans contexte refusé **échoue**, réponse 200.
- Après correction : **59 tests MCP** réussis, dont contexte périmé pour allow/deny, contexte valide pour allow/deny, encodages invalides, contenu réellement posté par le composant, cookies/query tokens/type de credential, token inconnu/révoqué et tests du SDK v2.
- `npm run typecheck` : réussi.
- `npm run lint` : zéro erreur, 15 avertissements préexistants hors correctif.
- `npm run test:mcp:db` : suites OAuth/PKCE/rejeu/isolation et contexte CRM réussies sur PostgreSQL réel.
- `supabase/tests/security-boundaries.sql` : réussi, notamment appels RPC interdits au navigateur, budgets isolés, 429 préservant le grant et refresh rejoué révoquant la famille.
- Revue indépendante du correctif : aucun chemin de contournement ou régression concret identifié ; les tests ciblés OAuth/contexte passent.

Les logs de validation temporaires sont hors du dépôt et ne contiennent pas de credential réel. Le build, Prettier et les scans de secrets sont effectués avant publication.

## Points restant à traiter / limites

Supabase signale que la **protection contre les mots de passe divulgués est désactivée**. C’est un risque de sécurité des comptes, pas une preuve de contournement MCP. L’activation dépend de la configuration et de la disponibilité de cette fonction sur le projet : [documentation officielle](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Les INFO « RLS sans policy » des tables privées ne justifient pas l’ajout de droits : l’absence de policy et les grants révoqués constituent ici un refus d’accès au navigateur. Les autres avertissements Supabase sur des fonctions SECURITY DEFINER hors MCP ne sont pas qualifiés de failles sur le seul signal d’un advisor : [guide de vérification](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Les protections anti-DDoS/WAF, les sessions et trousseaux personnels Claude Code/Codex, la compromission du navigateur ou du poste, et la sécurité complète de toutes les autres pages ne sont pas certifiées par cet audit ciblé. Les tests HTTP utilisent des mocks Auth/RPC ; les tests SQL réels et les contrôles de production complètent ces tests sans remplacer un parcours OAuth personnel dans un navigateur réel.

Un utilisateur peut exécuter des requêtes depuis DevTools : la sécurité doit venir des contrôles serveur et des RLS, pas de l’interdiction de la console. Cela ne lui donne pas les droits d’un autre workspace ou un accès aux secrets MCP.
