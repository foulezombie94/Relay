# Fiabilité et performances — 9 octobre 2026

## Changements

Ask Relay conserve ses 37 outils métier. Sept outils courants et `discover_tools` sont envoyés au premier appel. Chaque découverte ajoute au plus six outils et conserve ceux déjà chargés, sans doublons ; le catalogue peut donc atteindre les 37 outils métier plus `discover_tools` si le travail le nécessite (38 définitions au maximum). Il n'y a pas de plafond global de six outils supplémentaires. La découverte consomme un appel du budget existant de 5 ou 15 appels, et les réservations de tokens tiennent compte du catalogue transmis. Elle ne donne aucun droit d'action. Les contrôles de permissions, de sources et de confirmations restent appliqués à chaque opération.

Chaque appel fournisseur possède désormais une réservation atomique et un résultat dans un journal privé. Une exécution réserve initialement 60 000 tokens, ou 180 000 en approfondissement ; la réservation peut croître avant les appels suivants, dans les limites de l'exécution et du workspace. À la fin, le budget inutilisé est libéré, y compris après une erreur. Un refus HTTP 4xx hors 408 ne consomme pas la réservation de cet appel. Une réponse avec usage confirmé conserve les tokens réels ; une coupure réseau ou une réponse sans usage fiable conserve une estimation prudente. Le cron récupère les exécutions expirées après arrêt du serveur. Aucun retry aveugle n'est ajouté.

Les anciennes exécutions sans journal par appel restent en comptabilité conservatrice. Les 1,5 million de tokens réservés par cinq anciens échecs n'ont pas été effacés : l'historique disponible ne prouve pas le coût de tous leurs appels. Les coûts affichés sont des estimations configurables via `AGENT_INPUT_USD_PER_MILLION` et `AGENT_OUTPUT_USD_PER_MILLION` (zéro accepté pour un test gratuit), pas une facture fournisseur.

Les erreurs distinguent la limitation fournisseur 429, son crédit épuisé, les limites quotidienne/mensuelle internes et une analyse déjà active. `Retry-After` est conservé dans le chat. Les événements fournisseur enregistrent durée, modèle, statut HTTP et tokens sans corps des emails, prompts ni secrets. Les paramètres d'utilisation montrent les derniers appels de l'utilisateur et les réservations incertaines.

Les dashboards envoient un seul batch SQL, dédupliquent les requêtes équivalentes et utilisent un cache PostgreSQL de 20 secondes, commun aux réplicas. Une révision par workspace invalide les résultats après mutation. Les agrégats de fiches sont partagés seulement entre membres disposant de la visibilité complète des fiches ; les lecteurs restreints et les sources privées ont un cache par utilisateur avec empreinte de permissions. Le trigger du cache partagé recalcule les valeurs sous RLS et ignore toute valeur ou expiration fournie par un client. Si de nouvelles restrictions par fiche sont ajoutées au produit, la définition de `full_record_workspaces` doit évoluer avec elles.

Rapports et Priorités sont calculés dans PostgreSQL avec les permissions du demandeur. Priorités renvoie 50 résultats par page et borne les identifiants de chaque signal à 20 en signalant leur troncature. Les doublons sont recherchés par clés normalisées en SQL, avec au maximum 250 paires et une seconde vérification TypeScript ; certains domaines IDN/encodés signalent un résultat partiel. Pulse utilise une seule RPC et vérifie les réponses d'email sur le même utilisateur, compte connecté et fil. Les fiches chargent un résumé court, puis leurs sections secondaires à l'ouverture.

Le worker possède deux capacités indépendantes et bornées : deux jobs interactifs et un job d'import/synchronisation par réplica, configurables de 1 à 4 chacune. Le polling à vide est de 1–2 s et 2–5 s avec aléa ; surveiller le coût RPC associé avant d'augmenter la concurrence. Les leases, `SKIP LOCKED`, outbox et états incertains sont conservés. Les échecs SQL déjà validés sont signalés comme `job_dead`, sans être journalisés à tort comme des succès. Les politiques SELECT utilisent les permissions actuelles en sous-plans et les index ciblent les listes, interactions, historique et clés de doublons. Aucun index existant n'a été supprimé.

## Diagnostic des 14 workflows en échec

Le diagnostic en lecture seule sur Supabase a identifié 13 `ai_not_configured` : le worker utilisait seulement OpenAI alors que le web pouvait utiliser Groq. Le handler utilise maintenant la même sélection `AI_PROVIDER` et le modèle configuré. **La clé correspondant à ce fournisseur doit aussi être présente dans Railway** ; les variables Vercel ne sont pas transmises au worker. Voir [les variables du worker](../../deploy/worker.env.example).

Le dernier `invalid_action` provenait d'un aperçu avec version 1 alors que la fiche avait atteint la version 2 avant traitement. Le contrôle de version est conservé ; les prochains cas affichent `record_changed` et demandent un nouvel aperçu. Les 14 anciens échecs n'ont été ni supprimés ni rejoués, pour éviter de reproduire des effets métier sans nouvelle validation.

## Vérification et reproduction

Les tests utilisent uniquement une base jetable locale, sans données ni appels fournisseurs de production. Installer toutes les migrations dans une base vierge avec `scripts/tests/migrate-local.mts`, puis :

```sh
export RELAY_TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:PORT/TEST_DATABASE
npm run test:performance:db
npm run test:agent:concurrency
npm run test:agent:tokens
npm run test:performance:load
RELAY_LOAD_RECORDS=100000 npm run test:performance:load
RELAY_LOAD_DASHBOARD=sales npm run test:performance:load
```

Les runners de charge et de régression PostgreSQL refusent une destination distante. Le bootstrap local émule le schéma Auth ; un stand-in vide de `cron.job` permet le test historique du cron désactivé. L'activation réelle du nouveau cron est vérifiée séparément dans Supabase. Chaque suite SQL fait un rollback ; les tests de concurrence/charge suppriment leurs fixtures dans `finally`.

Validation : 283 tests Vitest, 16 suites SQL, typecheck et lint des fichiers modifiés. Les tests de découverte couvrent désormais le cumul des 37 outils, les doublons, l'isolation entre exécutions et une découverte invalide sans modification d'état. Les scénarios couvrent aussi l'isolation des workspaces, les sources privées, les permissions révoquées, les confirmations exactes/refusées/expirées, les valeurs de cache forgées, la déduplication, les crashs et les quotas. Le test de concurrence lance 32 demandes à la fois : une seule analyse admise, une seule réservation email quand il reste une place sur 200, et un seul job/outbox après 32 confirmations identiques. Aucun email n'est envoyé.

## Mesures locales

Les artefacts JSON contiennent les résultats et un plan `EXPLAIN (ANALYZE, BUFFERS)` de la liste. PostgreSQL 16 local ; Supabase utilise PostgreSQL 17. Chaque utilisateur simulé dispose de son propre compte et de ses permissions réelles en base. Un pool limité à 12 connexions inclut l'attente d'acquisition dans les latences. Chaque niveau lance simultanément une liste de 20 fiches, un résumé de fiche et un dashboard par utilisateur.

Pour le dashboard d'un indicateur, le test à 100 000 fiches / 100 utilisateurs a donné :

| Opération                | p95 cache vide | p95 répétition immédiate |
| ------------------------ | -------------: | -----------------------: |
| Liste                    |       1 103 ms |                   352 ms |
| Résumé de fiche          |       1 106 ms |                   359 ms |
| Dashboard, un indicateur |       1 139 ms |                   393 ms |

Zéro erreur aux niveaux 10, 25, 50 et 100, soit 1 110 lectures par volume testé et deux agrégations de référence. À 100 000 fiches, les références rapport/Priorités étaient respectivement 716 et 285 ms, chacune avec un seul utilisateur. À 10 000 fiches, le p95 dashboard à 100 utilisateurs était de 1 371 ms à cache vide et 652 ms en répétition. Les différences de chauffe de PostgreSQL empêchent une comparaison linéaire de ces deux volumes.

Le dashboard commercial complet (huit indicateurs, avec historique d’audit) passe également sans erreur aux quatre niveaux. À 100 utilisateurs / 100 000 fiches, son p95 est de **5 841 ms à cache vide et 644 ms en répétition immédiate** ; les petites lectures partageant le pool attendent aussi ce premier calcul (p95 liste 5 775 ms, fiche 5 780 ms). À 10 000 fiches, le p95 du même dashboard est de 2 862 ms à cache vide et 636 ms ensuite. L’objectif de 2–3 s n’est donc pas atteint pour le dashboard historique complet à 100 000 fiches. Ces artefacts sont distincts du benchmark d’un seul indicateur.

Ces résultats ne mesurent pas Next.js, Supabase Auth, le réseau mobile, les intégrations externes, les modèles IA, l'attente des workers ni plusieurs workspaces actifs. Les rafales à cache vide dépassent l'objectif de 500 ms pour les listes. Ils ne garantissent donc pas 100 utilisateurs réels sans ralentissement. Un benchmark complet sur préproduction représentative reste nécessaire pour dimensionner l'offre et vérifier les objectifs p95.

## Exploitation

Surveiller les erreurs `agent_provider_call`, les tokens incertains, les `job_dead`, les leases perdus, le plus ancien job et les métriques de capacité du worker. Les alertes sont émises par le code ; les moniteurs Sentry/Better Stack doivent être configurés dans les services. Augmenter les slots seulement après mesure des quotas fournisseurs et des ressources PostgreSQL.

Les migrations sont compatibles avec le web précédent et s'appliquent avant le push de la nouvelle version. Un retour au code précédent n'exige pas d'effacer les nouvelles tables. Conserver le journal de coûts et l'outbox ; ne pas supprimer les données de migration pour revenir en arrière. Les réservations des anciennes versions restent conservatrices.

Les avis Supabase d'index de clés étrangères sont des pistes supplémentaires à mesurer, pas une justification pour créer aveuglément tous les index : [index FK](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys). Les tables privées sans politique RLS sont volontairement fermées aux clients. Les RPC privilégiées existantes et les réglages Auth doivent faire l'objet de contrôles séparés : [RPC SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protection des mots de passe compromis](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Les sept migrations de ce lot sont appliquées dans Supabase et correspondent aux fichiers versionnés (42 migrations au total, aucune locale en attente). Le cron `relay-crm-runtime-maintenance` est actif chaque minute. Le contrôle des RPC confirme `SECURITY INVOKER` et aucun accès anonyme pour les nouvelles lectures ; la maintenance reste privée. Après les optimisations, les avertissements RLS initplan passent de 9 à 0 et ceux de politiques permissives multiples de 8 à 0. Dix index de clés étrangères ciblés réduisent les avis FK à 20 ; les autres restent à profiler. Les trois nouvelles tables privées sans politique sont fermées aux clients, avec privilèges SELECT révoqués.

Le service PostgreSQL de la CI et l'image Node du worker utilisent le miroir officiel Docker Library sur ECR Public, épinglé par digest. Cela évite le quota anonyme Docker Hub qui a bloqué la création du service SQL avant ses tests. Actualiser régulièrement ces digests pour recevoir les correctifs des images de base. Les fichiers du worker restent détenus par root et lisibles par son utilisateur `node`, sans droits d'écriture sur le code ; les répertoires sont traversables indépendamment des permissions du checkout.

L'image worker corrigée a été construite et démarrée localement sous son utilisateur non privilégié, avec une API Supabase factice sur localhost : health check, métriques authentifiées, trois slots bornés et arrêt SIGTERM réussis. Ce contrôle ne valide pas les secrets ni les intégrations du worker Railway. Le certificat du proxy de l'environnement de validation est monté temporairement pendant le build ; il n'est pas inclus dans l'image et la vérification TLS reste activée.
