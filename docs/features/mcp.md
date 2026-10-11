# MCP distant Zyliad — 11 octobre 2026

Le serveur `/api/mcp` permet à Claude Code, Codex et aux clients compatibles d'accéder au workspace choisi par un utilisateur authentifié. Il utilise les packages officiels TypeScript **SDK v2 2.3.1**, `createMcpHandler` et Streamable HTTP. Le protocole moderne **2026-07-28** est pris en charge ; les clients négociant une version datée antérieure utilisent la compatibilité stateless du SDK v2. Aucun SDK v1 n'est installé.

## Installation et expérience utilisateur

La landing et `/mcp` présentent les commandes Claude Code et Codex, avec les marques officielles Claude/OpenAI, sans recoloration. La méthode recommandée est distante :

```sh
claude mcp add --transport http zyliad "https://VOTRE-DOMAINE/api/mcp"
# Puis /mcp dans Claude Code pour s'authentifier.
codex mcp add zyliad --url "https://VOTRE-DOMAINE/api/mcp"
codex mcp login zyliad
```

OAuth ouvre une page Zyliad : connexion normale, choix d'un workspace dont l'utilisateur est membre, permissions cochées explicitement, consentement puis retour au client enregistré. Par défaut, seules les fiches, tâches et définitions CRM sont cochées. Notes, communications, documents et propositions d'écriture sont optionnels. Les emails accessibles sont les emails déjà importés du compte de cet utilisateur, pas toute une mailbox distante.

La landing propose aussi `npx --yes "https://VOTRE-DOMAINE/mcp/zyliad-mcp-1.0.0.tgz" "https://VOTRE-DOMAINE/api/mcp"` et l'installation globale npm du même archive. Cette archive est effectivement livrée dans `public/mcp` : aucune publication sur le registre npm ni package inexistant n'est présupposé. `npm run pack:mcp` la génère depuis `packages/zyliad-mcp`. Son nom doit changer lors d'une prochaine version. Le pont utilise également le SDK v2, garde les tokens en mémoire et demande une nouvelle connexion à chaque démarrage. Il écrit le protocole sur stdout, les informations de connexion sur stderr. Node 20+ est nécessaire. Pour un premier consentement lent, ajuster le timeout de démarrage du client ; privilégier la connexion distante native.

## Contrats disponibles

22 outils fortement typés sont définis dans `src/lib/mcp/contracts.ts` :

- contexte du workspace, objets et champs ;
- recherche paginée de fiches (contacts, entreprises, deals et objets personnalisés), tâches, notes, réunions, emails, calendriers, documents, engagements, conflits, listes, pipelines et workflows ;
- lecture d'une source autorisée par ID et morceaux bornés ;
- agrégats CRM soumis aux permissions ;
- propositions de création/modification de fiches, tâches et notes, puis suivi de leur statut.

Les recherches réutilisent les RPC métier existantes, leurs curseurs, limites et indicateurs `partial/coverage`. Les agrégats multi-devise ne prétendent pas convertir des montants. Aucune fonction SQL, shell, URL arbitraire, téléchargement, envoi d'email, suppression, modification financière ou changement de permissions n'est exposée. Les intégrations OAuth externes en attente d'app review ne sont pas activées implicitement.

Les outils visibles correspondent aux scopes de la connexion. `zyliad_read_source` et `zyliad_aggregate` vérifient aussi le scope propre à la ressource à chaque appel. Le resource `zyliad://usage` et le prompt `prepare_meeting` explicitent les frontières de confiance.

## OAuth et stockage

L'origine canonique est **APP_URL**, sans path/query/userinfo, HTTPS obligatoire en production. Le client MCP doit utiliser ce domaine canonique, y compris si le site possède plusieurs aliases. Métadonnées RFC8414 à `/.well-known/oauth-authorization-server`, RFC9728 à `/.well-known/oauth-protected-resource/api/mcp` (également à la racine). Enregistrement dynamique des clients publics RFC7591 ; seul Authorization Code + PKCE S256 est accepté. Les redirections correspondent exactement à un URI enregistré HTTPS ou HTTP loopback avec port explicite ; aucun fetch de métadonnées utilisateur n'est effectué. Une application peut choisir son propre nom non vérifié : le consentement l'indique.

Le state opaque fourni par le client est conservé et renvoyé avec `iss`. Un défaut connu de certaines versions Codex supprime `iss` avant sa validation et empêche ensuite l'échange du code ; le serveur ne déclare donc pas ce paramètre comme requis dans la découverte OAuth, mais continue de le renvoyer. Le pont inclus vérifie state avec une comparaison constante, utilise un callback loopback à usage unique et contrôle strictement l'issuer et l'audience. PKCE S256, state, URI de retour exacte et audience restent vérifiés côté serveur. Une seconde capacité aléatoire de 256 bits lie le navigateur au flow via un cookie HttpOnly, SameSite=Lax, Secure en production. Son hash seul est stocké, 10 minutes, usage unique. Le consentement POST exige Origin canonique, une session vérifiée et le membership courant. Le code d'autorisation expire après 60 secondes et ne peut servir qu'une fois ; client, redirection, PKCE et resource sont revérifiés lors de l'échange.

Access/refresh tokens aléatoires sont renvoyés uniquement au token endpoint OAuth, jamais dans les outils, les pages ou les audits. La base conserve **SHA-256 uniquement** ; il n'existe pas de token récupérable à déchiffrer. Access tokens : 1 heure maximum. Famille : 30 jours maximum. Refresh token à rotation et usage unique ; une réutilisation révoque toute la famille et ses propositions. Les scopes ne peuvent être augmentés au refresh ; une demande de nouveaux scopes nécessite un consentement. Révocation RFC7009 et bouton Déconnecter invalident immédiatement la famille et les propositions pendantes, même après un downgrade en viewer.

## Isolation, confirmation et audits

Les sept tables MCP sont dans `relay_private`, non exposé, avec RLS et sans SELECT/UPDATE directs pour navigateur ou service_role. Les fonctions privilégiées gèrent uniquement le contrôle OAuth, l'outbox privée et les audits. `mcp_request` est un point d'entrée SECURITY INVOKER réservé au backend. Après vérification du token, il reconstruit l'identité et le workspace, puis réduit ses privilèges au rôle `zyliad_mcp` **NOLOGIN/NOBYPASSRLS**, héritant d'authenticated. Les lectures CRM passent donc par les politiques existantes, y compris les notes et communications privées. Ni body.workspace_id ni un ID externe n'autorise un changement de tenant. Aucune credential fournisseur n'est consultée.

Les outils d'écriture créent seulement une proposition exacte, UUID d'idempotence stable, digest des valeurs, expiration 15 minutes. L'utilisateur confirme dans **Paramètres → Développeurs**, via sa session normale ; aucun token MCP ne peut confirmer. L'exécution SQL transactionnelle revérifie propriétaire, droits actuels, token non révoqué, expiration, RLS/FK et version optimiste. Un replay identique ne duplique pas l'effet, un replay avec d'autres valeurs est rejeté. Les nouvelles notes sont privées. Payload effacé après exécution/refus/expiration/révocation ; le statut exécuté conserve l'ID de la ligne réellement écrite. La validation des attributs métier s'effectue aussi dans la route authentifiée avant approbation.

Les réponses sont marquées `untrusted_external_data` et les instructions externes ne deviennent jamais une autorisation. Les champs et formats de secrets courants sont masqués en défense complémentaire, sans prétendre détecter toute donnée secrète collée par un utilisateur dans un champ libre. Le modèle ne reçoit jamais de credential du serveur. Audits : action, résultat, connexion et timestamp, sans texte complet ni tokens, résultats d'exécution réels. Nettoyage borné des flows expirés, propositions et tokens à l'activité OAuth ; audits plus anciens que 90 jours purgés par lots. Ce nettoyage opportuniste ne garantit pas une heure exacte de suppression.

## Limites et exploitation

- Limite 120 vérifications/minute/connexion, 600/workspace ; handshake + outil peut consommer plusieurs vérifications. Distribution en PostgreSQL, 429 + Retry-After 60.
- Enregistrement/exchanges OAuth : 120/minute/opération globalement, 10 000 clients maximum ; prévoir une protection WAF si trafic abusif. Pas de fetching d'URLs de DCR.
- 20 connexions actives/user/workspace, 30 propositions pendantes/connexion, requêtes MCP 64 KiB, requêtes OAuth 12 KiB, statements SQL 8 secondes, route Vercel 30 secondes.
- Aucun état de session CRM partagé entre requêtes ou instances Vercel ; pas de subscriptions/SSE persistant. Les lectures sont bornées ; la réponse de définitions de workspace dépend du catalogue du tenant.
- La passerelle locale n'écrit aucun fichier de tokens. Les clients natifs conservent leurs autorisations selon leur propre stockage sécurisé.
- Aucun client secret Google/Microsoft/Claude/OpenAI n'est nécessaire pour ce serveur first-party. Les variables Vercel Supabase serveur existantes et APP_URL canonique sont requises ; aucune clé service_role publique.

La migration additive `secure_zyliad_mcp` crée les tables, rôle et RPC sans modifier les tables CRM existantes ni leurs RLS. Vérifier les grants via les advisors Supabase après déploiement. Pour désactiver, révoquer les connexions dans Zyliad et retirer le serveur des clients. Ne pas supprimer les tables CRM ni réécrire une migration appliquée.

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

Le test SQL utilise exclusivement une base locale jetable, fixtures rollback : PKCE/audience, redirection, state de retour, code/consentement à usage unique, refresh rotation/rejeu, RLS inter-tenant/notes privées, scopes, confirmation exacte, idempotence/version, downgrade, quotas, révocation et audit. Les tests SDK négocient vraiment moderne + compatibilité puis listent/appellent les outils via HTTP. Les tests OAuth HTTP contrôlent CSRF, cookie, découverte et absence de tokens bruts dans les RPC. La CI exécute aussi ces tests SQL avec toutes les migrations depuis zéro.

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
