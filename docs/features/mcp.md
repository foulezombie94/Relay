# MCP distant Zyliad — 12 octobre 2026

Le serveur `/api/mcp` permet à Claude Code, Codex et aux clients compatibles d'accéder au workspace choisi par un utilisateur authentifié. Il utilise les packages officiels TypeScript **SDK v2 2.3.1**, `createMcpHandler` et Streamable HTTP. Le protocole moderne **2026-07-28** est pris en charge ; les clients négociant une version datée antérieure utilisent la compatibilité stateless du SDK v2. Aucun SDK v1 n'est installé.

## Installation et expérience utilisateur

La landing et `/mcp` présentent les commandes Claude Code et Codex, avec les marques officielles Claude/OpenAI, sans recoloration. La méthode recommandée est distante :

```sh
claude mcp add --scope user --transport http zyliad "https://VOTRE-DOMAINE/api/mcp"
# Puis /mcp dans Claude Code pour s'authentifier.
codex mcp add zyliad --url "https://VOTRE-DOMAINE/api/mcp"

```

OAuth ouvre une page Zyliad : connexion normale, choix d'un workspace dont l'utilisateur est membre, permissions cochées explicitement, consentement puis retour au client enregistré. Par défaut, seules les fiches, tâches et définitions CRM sont cochées. Notes, communications, documents et propositions d'écriture sont optionnels. Les emails accessibles sont les emails déjà importés du compte de cet utilisateur, pas toute une mailbox distante.

La landing utilise `APP_URL` canonique, jamais le domaine de preview ou l’alias du navigateur, pour conserver la même identité de serveur et le même stockage OAuth. Claude est installé au niveau utilisateur (`--scope user`), disponible dans tous les projets. Les versions actuelles de Codex ouvrent OAuth pendant `mcp add` : une seconde commande `mcp login` n’est plus lancée automatiquement, car elle crée un nouveau consentement inutile. Utiliser `codex mcp login zyliad` uniquement pour une autorisation manquante, expirée ou révoquée.

Les modes npx/npm sont maintenant des **installateurs de la connexion native**, pas des ponts stdio à lancer à chaque session :

```sh
npx --yes "https://VOTRE-DOMAINE/mcp/zyliad-mcp-1.1.1.tgz" install --client claude "https://VOTRE-DOMAINE/api/mcp"
npx --yes "https://VOTRE-DOMAINE/mcp/zyliad-mcp-1.1.1.tgz" install --client codex "https://VOTRE-DOMAINE/api/mcp"
```

Node 20+ et le CLI du client sont requis. L’installateur réutilise une configuration HTTP identique sans relancer OAuth ; il remplace uniquement notre ancien pont au même endpoint et refuse un autre serveur/issuer. Le client conserve les credentials dans son propre stockage ; Zyliad n’ajoute aucun fichier de secrets local. `cross-spawn` 7.0.6 gère les shims des CLI Windows et les arguments, sans construire une commande shell à partir de l’URL. L’archive est réellement livrée dans `public/mcp`, générée par `npm run pack:mcp`. La version 1.0.0 est conservée pour les installations existantes ; le correctif exige une migration locale **une seule fois**, car le serveur ne peut pas réécrire la configuration de Claude Code/Codex sur le poste de l’utilisateur.

Le pont avancé `zyliad-mcp https://VOTRE-DOMAINE/api/mcp` reste limité à une session et garde les tokens en mémoire. Les utilisateurs normaux doivent utiliser HTTP natif ou `install`. Ne pas présenter ce mode avancé comme une connexion persistante.

## Contrats disponibles

La version serveur **1.1.0** expose 30 outils fortement typés définis dans `src/lib/mcp/contracts.ts` :

- contexte du workspace, objets et champs ;
- recherche paginée de fiches (contacts, entreprises, deals et objets personnalisés), tâches, notes, réunions, emails, calendriers, documents, engagements, conflits, listes, pipelines et workflows ;
- lecture d'une source autorisée par ID et morceaux bornés ;
- agrégats CRM soumis aux permissions ;
- propositions de création/modification de fiches, tâches et notes, puis suivi de leur statut.

Les nouvelles lectures comprennent : identité et permissions actuelles (`zyliad_connection`), fiche précise (`zyliad_get_record`), jusqu’à 10 fiches par IDs (`zyliad_get_records`), contexte ciblé (`zyliad_record_context`), relations paginées (`zyliad_record_relations`), fiches d’une liste (`zyliad_list_records`), responsables (`zyliad_search_members`) et fils d’emails importés (`zyliad_email_thread`). Le contexte et les lots utilisent un seul RPC métier ; chaque opération conserve sa vérification OAuth et les requêtes SQL internes restent soumises aux RLS. Les nouvelles lectures ne nécessitent aucun nouveau scope. La liste des membres appartient au consentement configuration, dont le libellé le précise.

`zyliad_connection` renvoie le rôle courant, les scopes accordés et effectifs (écriture retirée des capacités en cas de rôle viewer), le catalogue des outils et les limites. Il reste disponible pour toute connexion valide. Les champs personnalisés ne sont lus que sur sélection explicite de leurs clés : `attributes_partial` signale une sélection incomplète, qui ne doit jamais remplacer un objet `attributes` entier. Les IDs absents et inaccessibles sont indistinguables. Les pages nouvelles utilisent une ligne supplémentaire pour déterminer `has_more` et `next_cursor` sans compter tout le jeu de données ; leurs curseurs sont des UUID et ne garantissent aucun ordre chronologique.

Les recherches réutilisent les RPC métier existantes, leurs curseurs, limites et indicateurs `partial/coverage`. Les agrégats multi-devise ne prétendent pas convertir des montants. Aucune fonction SQL, shell, URL arbitraire, téléchargement, envoi d'email, suppression, modification financière ou changement de permissions n'est exposée. Les intégrations OAuth externes en attente d'app review ne sont pas activées implicitement.

Les outils visibles correspondent aux scopes de la connexion. `zyliad_read_source` et `zyliad_aggregate` vérifient aussi le scope propre à la ressource à chaque appel. Le contexte vérifie chaque section côté TypeScript et SQL avant lecture. Les entrées de liste exigent les scopes configuration et fiches. Les RLS existantes continuent de protéger notes, listes, communications et fiches des lecteurs limités. Les helpers privés sont réservés au rôle MCP, `SECURITY INVOKER`, et ne créent aucun droit supplémentaire sur les tables.

Les instructions, descriptions, paramètres, messages d’erreur et couverture générés par le serveur sont en français ; le modèle est invité à répondre en français par défaut, avec respect de la langue explicitement demandée. Les données d’origine et citations ne sont pas traduites. Le resource `zyliad://usage` et les cinq prompts `prepare_meeting`, `account_review`, `follow_up`, `pipeline_review`, `daily_brief` guident les recherches bornées, les citations, les incertitudes et les confirmations. Les noms d’outils et marqueurs de protocole restent compatibles.

## OAuth et stockage

L'origine canonique est **APP_URL**, sans path/query/userinfo, HTTPS obligatoire en production. Le client MCP doit utiliser ce domaine canonique, y compris si le site possède plusieurs aliases. Métadonnées RFC8414 à `/.well-known/oauth-authorization-server`, RFC9728 à `/.well-known/oauth-protected-resource/api/mcp` (également à la racine). Enregistrement dynamique des clients publics RFC7591 ; seul Authorization Code + PKCE S256 est accepté. Les redirections correspondent exactement à un URI enregistré HTTPS ou HTTP loopback avec port explicite ; aucun fetch de métadonnées utilisateur n'est effectué. Une application peut choisir son propre nom non vérifié : le consentement l'indique.

Le state opaque fourni par le client est conservé et renvoyé avec `iss`. Un défaut connu de certaines versions Codex supprime `iss` avant sa validation et empêche ensuite l'échange du code ; le serveur ne déclare donc pas ce paramètre comme requis dans la découverte OAuth, mais continue de le renvoyer. Le pont inclus vérifie state avec une comparaison constante, utilise un callback loopback à usage unique et contrôle strictement l'issuer et l'audience. PKCE S256, state, URI de retour exacte et audience restent vérifiés côté serveur. Une seconde capacité aléatoire de 256 bits lie le navigateur au flow via un cookie HttpOnly, SameSite=Lax, Secure en production. Son hash seul est stocké, 10 minutes, usage unique. Le consentement POST exige Origin canonique, une session vérifiée et le membership courant. Le code d'autorisation expire après 60 secondes et ne peut servir qu'une fois ; client, redirection, PKCE et resource sont revérifiés lors de l'échange.

Access/refresh tokens aléatoires sont renvoyés uniquement au token endpoint OAuth, jamais dans les outils, les pages ou les audits. La base conserve **SHA-256 uniquement** ; il n'existe pas de token récupérable à déchiffrer. Access tokens : 1 heure maximum. Famille : 30 jours maximum. Refresh token à rotation et usage unique ; une réutilisation révoque toute la famille et ses propositions. Les scopes ne peuvent être augmentés au refresh ; une demande de nouveaux scopes nécessite un consentement. Compatibilité du refresh : certains clients natifs omettent `resource` lors du renouvellement. Ce seul champ peut être omis pour le grant `refresh_token` : le backend injecte sa propre audience canonique, puis la base vérifie encore que client et audience correspondent à la famille existante. Une audience explicite différente reste refusée. `resource` reste obligatoire lors de l’autorisation initiale et de l’échange de code. La spécification MCP demande aux clients de fournir `resource` dans les requêtes de tokens ; ce comportement serveur est une tolérance d’interopérabilité, pas une autorisation de changer d’audience ou de workspace.

Révocation RFC7009 et bouton Déconnecter invalident immédiatement la famille et les propositions pendantes, même après un downgrade en viewer.

## Isolation, confirmation et audits

Les sept tables MCP sont dans `relay_private`, non exposé, avec RLS et sans SELECT/UPDATE directs pour navigateur ou service_role. Les fonctions privilégiées gèrent uniquement le contrôle OAuth, l'outbox privée et les audits. `mcp_request` est un point d'entrée SECURITY INVOKER réservé au backend. Après vérification du token, il reconstruit l'identité et le workspace, puis réduit ses privilèges au rôle `zyliad_mcp` **NOLOGIN/NOBYPASSRLS**, héritant d'authenticated. Les lectures CRM passent donc par les politiques existantes, y compris les notes et communications privées. Ni body.workspace_id ni un ID externe n'autorise un changement de tenant. Aucune credential fournisseur n'est consultée.

Les outils d'écriture créent seulement une proposition exacte, UUID d'idempotence stable, digest des valeurs, expiration 15 minutes. L'utilisateur confirme dans **Paramètres → Développeurs**, via sa session normale ; aucun token MCP ne peut confirmer. L'exécution SQL transactionnelle revérifie propriétaire, droits actuels, token non révoqué, expiration, RLS/FK et version optimiste. Un replay identique ne duplique pas l'effet, un replay avec d'autres valeurs est rejeté. Les nouvelles notes sont privées. Payload effacé après exécution/refus/expiration/révocation ; le statut exécuté conserve l'ID de la ligne réellement écrite. La validation des attributs métier s'effectue aussi dans la route authentifiée avant approbation.

Les réponses sont marquées `untrusted_external_data` et les instructions externes ne deviennent jamais une autorisation. Les champs et formats de secrets courants sont masqués en défense complémentaire, sans prétendre détecter toute donnée secrète collée par un utilisateur dans un champ libre. Le modèle ne reçoit jamais de credential du serveur. Audits : action, résultat, connexion et timestamp, sans texte complet ni tokens, résultats d'exécution réels. Nettoyage borné des flows expirés, propositions et tokens à l'activité OAuth ; audits plus anciens que 90 jours purgés par lots. Ce nettoyage opportuniste ne garantit pas une heure exacte de suppression.

## Limites et exploitation

- Limite 120 vérifications/minute/connexion, 600/workspace ; handshake + outil peut consommer plusieurs vérifications. Distribution en PostgreSQL, 429 + Retry-After 60.
- Enregistrement/exchanges OAuth : 120/minute/opération globalement, 10 000 clients maximum ; prévoir une protection WAF si trafic abusif. Pas de fetching d'URLs de DCR.
- 20 connexions actives/user/workspace, 30 propositions pendantes/connexion, requêtes MCP 64 KiB, requêtes OAuth 12 KiB, statements SQL 8 secondes, route Vercel 30 secondes.
- Résultats d’outils bornés à 256 KiB ; requête de base interrompue après 10 secondes. En cas de dépassement, choisir moins de champs ou réduire les filtres/pages plutôt que réessayer le même résultat volumineux.
- Erreurs en français avec code stable, `retryable`, `retry_after_seconds` et `request_id`. 429 conseille 60 secondes ; 503 conseille 5 secondes. Aucun retry serveur de mutation. Conserver le `request_id` de proposition pour une reprise identique et contrôler son statut si l’ID est connu.
- Logs d’action structurés : workspace, connexion, outil, résultat, durée et corrélation ; aucun payload, résultat CRM, secret ou token. `X-Request-ID` identifie aussi la requête HTTP. Le handler est fermé dans un `finally`, même en cas d’échec.
- Aucun état de session CRM partagé entre requêtes ou instances Vercel ; pas de subscriptions/SSE persistant. Les lectures sont bornées ; la réponse de définitions de workspace dépend du catalogue du tenant.
- La passerelle locale n'écrit aucun fichier de tokens. Les clients natifs conservent leurs autorisations selon leur propre stockage sécurisé.
- Aucun client secret Google/Microsoft/Claude/OpenAI n'est nécessaire pour ce serveur first-party. Les variables Vercel Supabase serveur existantes et APP_URL canonique sont requises ; aucune clé service_role publique.

La migration additive `secure_zyliad_mcp` crée les tables, rôle et RPC sans modifier les tables CRM existantes ni leurs RLS. `mcp_crm_context_and_french` ajoute les lectures : elle conserve l’implémentation précédente en privé et la délègue pour toutes les opérations existantes ; l’endpoint public garde son contrat. Aucun token ou consentement existant n’est modifié. Vérifier les grants via les advisors Supabase après déploiement. Pour désactiver, révoquer les connexions dans Zyliad et retirer le serveur des clients. Ne pas supprimer les tables CRM ni réécrire une migration appliquée.

## Validation reproductible

```sh
npm run test:mcp
RELAY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/relay_test_ci npm run test:mcp:db
npm run typecheck
npm run lint
npm test
npm run build
npm run check:secrets:bundles
npm run format:check
```

Les tests SQL utilisent exclusivement une base locale jetable, fixtures rollback : PKCE/audience, redirection, state de retour, code/consentement à usage unique, refresh rotation/rejeu, RLS inter-tenant/notes privées, scopes, confirmation exacte, idempotence/version, downgrade, quotas, révocation et audit. `mcp-read-context.sql` ajoute les scopes composés, contexte et lots inter-tenant, listes/notes privées, fils limités au compte, lecteurs limités, sélection de champs et pagination sans doublon. Les tests SDK négocient vraiment moderne + compatibilité puis listent/appellent les outils et prompts via HTTP, et vérifient le français. Les tests OAuth HTTP contrôlent CSRF, cookie, découverte et absence de tokens bruts dans les RPC. La CI exécute aussi ces tests SQL avec toutes les migrations depuis zéro.

Les comptes personnels Claude Code/Codex ne sont pas disponibles dans l'environnement de développement : valider une première connexion réelle depuis chacun après publication. Les tests locaux et le build ne remplacent pas cette vérification client en production ni un audit de sécurité indépendant ou une mesure de charge réelle.

## Sources officielles consultées

- [SDK TypeScript v2 : protocole 2026-07-28](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)
- [SDK v2 : handlers Web Standard](https://ts.sdk.modelcontextprotocol.io/v2/serving/web-standard.html)
- [Autorisations MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [Défaut Codex sur le paramètre `iss`](https://github.com/openai/codex/issues/33354)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Notion MCP et OAuth](https://developers.notion.com/guides/mcp/overview)
- [Marque OpenAI](https://openai.com/brand/)
- [Attio MCP — catalogue des outils](https://docs.attio.com/mcp/overview)
- [HubSpot MCP — données et permissions](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server)
- [Salesforce — serveurs et permissions](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/servers-reference.html)

Voir aussi [la comparaison datée et les décisions de portée](../research/mcp-crm-comparison-2026-10-11.md).

## Régression de persistance — 12 octobre 2026

Validation du correctif : les tests MCP passent, ainsi que l’isolation de la landing et la validation du domaine canonique. Typecheck, lint et archive livrée sont vérifiés. Les tests couvrent l’installation native, le remplacement du pont, la réutilisation sans second login, les commandes HTTP au scope utilisateur, le domaine canonique, la nouvelle archive exacte, le refresh avec audience omise, le refus d’une audience étrangère et l’absence de tokens bruts dans les RPC. Les protections existantes de rotation/rejeu et de tenant restent exercées par les suites SQL. Les sessions personnelles Claude Code/Codex ne sont pas accessibles depuis cet environnement ; ne pas confondre ces régressions reproductibles avec une vérification du trousseau de l’utilisateur ou de sa session réelle.

Audit du consentement et des permissions MCP : [résultats et limites du 12 octobre 2026](../research/mcp-security-audit-2026-10-12.md). Le consentement exige maintenant un contexte dérivé de la demande affichée ; une ancienne page ne peut plus autoriser le nouveau flow d’un autre onglet.

## Correctif de dépendance du 26 octobre 2026

L’installateur et le pont optionnel 1.1.1 utilisent Zod 4.6.7. Les archives déjà publiées 1.0.0/1.1.0 restent immuables pour les configurations existantes ; elles conservent leurs dépendances historiques. Utiliser la connexion HTTP native ou relancer la commande d’installation 1.1.1 ci-dessus pour remplacer l’ancien pont. La version du protocole et les autorisations serveur ne changent pas.
