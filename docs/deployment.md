# Déployer et exploiter Relay

## Architecture

Vercel sert Next.js, les API interactives et les callbacks OAuth. Supabase conserve Postgres, Auth, RLS et Storage. Le worker Railway consomme directement la file Postgres ; aucun traitement de fond ne dépend d’une longue requête Vercel. Stripe reste hors du périmètre.

Les handlers `email_sync`, `calendar_sync`, `sequence_send`, `workflow_run`, `notifications` et `imports` sont séparés dans `src/lib/jobs/handlers`. Les imports, workflows et rappels partagent un adaptateur SQL transactionnel. Les notifications d’attribution restent immédiates, dans la transaction métier.

Jobs, payloads, événements et heartbeats sont dans `relay_private`, sans accès aux clients. L’utilisateur peut seulement demander son import, confirmer son aperçu de workflow ou synchroniser son propre compte connecté. Le statut masque payloads, secrets et verrous. Le worker revérifie les autorisations actuelles avant les effets métier.

## Garanties et limites

La prise est atomique avec `FOR UPDATE SKIP LOCKED`. Un token UUID protège chaque résultat ; le verrou est renouvelé toutes les 45 secondes et expire après trois minutes. Chaque réplica dispose de deux capacités distinctes : les jobs interactifs (`workflow_run`, `sequence_send`, `notifications`, deux slots par défaut) et les imports/synchronisations (un slot par défaut). Chaque slot traite un seul job à la fois. `WORKER_SHORT_CONCURRENCY` et `WORKER_LONG_CONCURRENCY` acceptent chacun 1 à 4 ; plusieurs réplicas partagent la queue. Le scheduler tourne indépendamment des jobs, toutes les 60 secondes. Postgres sérialise les schedulers et limite chaque ensemble de types à un passage par minute. Les types de connecteurs sont filtrés avant la limite de lot.

À vide, le polling recule de 1 à 2 secondes par slot interactif, et de 2 à 5 secondes par slot d'import/synchronisation, avec un aléa de ±10 %. Après un job, la prise suivante reste immédiate. Cette fréquence réduit l'attente des petites tâches mais augmente les RPC à vide : observer la consommation Supabase avant d'augmenter les slots ou réplicas. Le délai p95 inférieur à cinq secondes reste un objectif à mesurer sur le worker déployé. Les RPC serveur ont un timeout réseau de 30 secondes ; il ne remplace pas les limites SQL.

Les erreurs temporaires ont jusqu’à cinq tentatives avec délai exponentiel et aléa. Le plafond du délai est d'environ une heure ; avec cinq tentatives par défaut, les délais effectifs restent de l'ordre des minutes. Les erreurs permanentes terminent dans `dead`. Un arrêt brutal entraîne la reprise après expiration du verrou. Les heures non ouvrées reportent un envoi sans consommer les tentatives. Une séquence en pause ou désactivée met son job en `paused`, sans boucle de claims ; le scheduler reprend le même job quand sa source redevient éligible.

Les effets d’un import/workflow et la validation de son job sont dans la même transaction. La synchronisation réutilise les upserts et le curseur durable. Les séquences conservent une clé unique `(enrollment_id,step)` et marquent `sending` avant l’appel fournisseur. Un envoi incertain n’est jamais renvoyé automatiquement : vérifier la boîte d’envoi. Il n’y a pas de garantie de livraison ni d’exactement un envoi chez le fournisseur.

Les imports restent limités à 5 Mo / 1 000 lignes. Excel est contrôlé avant parsing : 256 entrées ZIP maximum, 8 Mo par entrée et 20 Mo décompressés au total, avec vérification des tailles réelles. Le RPC d'import valide aussi les limites JSON (4 Mo au total, mapping 64 Ko, erreurs 1 Mo) et 30 nouvelles exécutions par minute/utilisateur/espace. L'historique d'import est écrit uniquement par la transaction d'import, jamais directement par le client.

La file accepte au plus 200 jobs `queued`, `running` ou `paused` par espace, y compris ceux du scheduler. Les admissions interactives conservent le plafond de 30/minute/utilisateur. Un compte au plafond est sauté par le scheduler sans annuler les jobs des autres espaces. Les rappels ne sont programmés que si une notification manque ; le cron historique `relay-due-reminders` est désactivé pour éviter un deuxième producteur.

Les payloads réussis sont effacés immédiatement, ceux en échec après sept jours. Le nettoyage horaire traite jusqu'à 500 jobs par passage et efface les jobs terminés de plus de trente jours avec leurs événements. À forte charge, surveiller le retard de nettoyage : ce débit limité ne constitue pas une suppression à heure exacte. Les audits métier et historiques d'import n'ont pas de purge automatique ; fixer leur durée de conservation avant une exploitation prolongée. Les snapshots d'audit excluent les vecteurs de recherche et les mises à jour sans changement métier, mais gardent les champs de forecast. Les audits d'invitations aux portails sont réservés aux admins/propriétaires ; les notes privées restent réservées à leur auteur. Le rôle serveur reste capable de modifier l'audit : ce n'est pas un journal WORM.

## Local

Configurer `.env.local` depuis `.env.example`, puis :

```sh
npm ci
npm run dev
# Autre terminal :
npm run worker
```

Le worker charge `.env.local` uniquement s’il existe. Sur Railway, il lit les variables du service. Il n’a pas besoin de `JOBS_SECRET` ni de `WORKER_URL`. Port par défaut : 3001 (web : 3000). SIGTERM/SIGINT arrêtent la prise de nouveaux jobs et attendent tous les jobs en cours. Le health check indique l’arrêt immédiatement.

Sur ce runtime Windows, les anciens dossiers Next ont des droits insuffisants et le verrou SWC échoue : les nouveaux fichiers utilisent `.next-local` et `.next-build`, avec `experimental.lockDistDir` désactivé uniquement sous Windows. Ne pas lancer plusieurs builds dans le même répertoire. Vercel utilise `.next`, conformément à `vercel.json`. Le verrou natif reste actif sous Linux.

Si un ancien cache Windows refuse son nettoyage (`EPERM`), définir `RELAY_BUILD_DIR=.next-check-NOM` pour construire dans un dossier neuf, ignoré par Git. Ce réglage local ne change pas le dossier `.next` de Vercel.

## Vercel

1. Importer le dépôt Relay ; choisir `relay-crm` si le dépôt contient un dossier parent.
2. Utiliser Node 24, Next.js et `vercel.json` (Paris, `cdg1`).
3. Renseigner `deploy/web.env.example` dans les variables Production. Les secrets ne portent jamais `NEXT_PUBLIC_`.
4. Définir `APP_URL` sur l’origine HTTPS finale. Régler Site URL et redirections Auth dans Supabase, puis les callbacks `/api/oauth/gmail/callback`, `/api/oauth/google-calendar/callback`, `/api/oauth/outlook/callback`, `/api/oauth/outlook-calendar/callback` chez les fournisseurs.
5. Appliquer les migrations avant la nouvelle version web. Vérifier `/api/health`, connexion et import avec un compte de test.

`/api/jobs/run` conserve un POST facultatif protégé par `JOBS_SECRET` : il ajoute les échéances, sans les traiter. Aucun cron Vercel n’est nécessaire.

## Railway

1. Créer un service depuis le même dépôt, avec `railway.json` et `Dockerfile.worker`.
2. Choisir une région européenne proche de Supabase dans les paramètres du service.
3. Renseigner `deploy/worker.env.example`. La clé serveur Supabase et le chiffrement OAuth doivent correspondre au web. Ne pas changer la clé de chiffrement sans migration des tokens existants.
4. Railway fournit `PORT` ; le worker écoute `0.0.0.0`. Le health check `/healthz` répond 200 si le heartbeat Supabase a réussi depuis moins de 90 secondes et si le traitement a progressé depuis moins de 15 minutes et qu’aucun job actif ne dure plus de 15 minutes. Il ne prouve pas l'absence de backlog. `/metrics` nécessite un Bearer `WORKER_METRICS_SECRET` et expose les compteurs, capacités et jobs actifs par catégorie.
5. Commencer avec un réplica et les trois slots par défaut. Pour des services séparés, filtrer `WORKER_JOB_TYPES` (ex. `email_sync,calendar_sync,imports` et `workflow_run,notifications`). Augmenter les slots/réplicas après observation des quotas fournisseurs, de la queue et des ressources. Un workflow peut contenir une étape réseau lente ; les catégories ne constituent pas une garantie de durée.

Le conteneur utilise l’utilisateur non privilégié `node` et ne contient aucun `.env`. Les séquences sont désactivées par défaut : pour les activer, ajouter `sequence_send` aux types du worker et `FEATURE_SEQUENCE_SEND=true` sur web + worker. Il faut toujours HTTPS, confirmation, compte connecté et lien de désinscription.

`FEATURE_BACKGROUND_JOBS=false` désactive la prise de jobs par le worker. Le web conserve alors le chemin synchrone pour petits imports/workflows et synchro manuelle ; les synchros automatiques et inscriptions de séquence sont désactivées. Les traitements déjà lancés peuvent terminer.

## Sentry et Better Stack

Configurer `SENTRY_DSN` sur web + worker et `NEXT_PUBLIC_SENTRY_DSN` sur le web. Le DSN public ne donne pas de droit de lecture. Les hooks capturent les erreurs de rendu/requête et les jobs échoués. `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` permettent d’envoyer les source maps au build. Aucun replay n’est activé.

La collecte des utilisateurs, cookies, headers, corps HTTP, paramètres d’URL, données SQL/IA et variables locales est désactivée. Un filtre efface également les contextes de requête et les valeurs d’exception. Les logs structurés contiennent des codes d’événements, types/IDs de jobs, durées et tentatives ; aucun contenu CRM, email ou token OAuth.

Créer une source Better Stack et renseigner `BETTER_STACK_SOURCE_TOKEN` et son URL HTTPS `BETTER_STACK_INGEST_URL`. L'ingestion Bearer a un timeout de deux secondes. Le worker ne l'attend pas pour traiter un job et limite les requêtes de logs simultanées à huit ; en saturation, des copies distantes sont abandonnées, les logs de la plateforme restent présents. Sur le web, l'ingestion reste attendue dans le traitement différé des erreurs. Ajouter un moniteur pour `/api/health` et `/healthz` (si le worker a un domaine public). Alerter sur l’absence de heartbeat, l’âge des jobs et les échecs permanents. Le health check de déploiement Railway ne remplace pas une surveillance continue.

Choisir la région et les modalités de traitement adaptées à l’hébergement européen dans chaque service.

## Migrations et vérifications

Les migrations sont versionnées dans `supabase/migrations`, avec des versions correspondant à l'historique Supabase. `reconcile_existing_migration_history` a vérifié les objets existants puis enregistré les neuf anciennes migrations appliquées avant le suivi de l'historique, sans rejouer leurs instructions. Vérifier `supabase db push --dry-run` avant une nouvelle migration ; aucune migration initiale ne doit être rejouée sur ce projet.

```sh
npm run typecheck
npm run test:worker
# Définir SUPABASE_DB_URL avec TLS vérifié :
npm run test:queue
```

Le test SQL utilise ROLLBACK et ne conserve pas ses fixtures. Il couvre déduplication, prises exclusives, autorisations, transaction, backoff, reprise après arrêt et verrous périmés. Les tests du runner couvrent les délais, le double commit et les envois incertains. Aucun email réel n’est envoyé par ces tests.

Pour l’activation publique, renseigner les identifiants externes et le domaine, configurer SMTP Auth et les sauvegardes/PITR selon l’offre et essayer une restauration. Les fichiers ne créent pas les comptes externes. La capacité à forte charge n’est pas mesurée ; les quotas Gmail/Graph, le plan Supabase, les uploads Vercel et la rétention doivent être dimensionnés.

Références : [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Railway health checks](https://docs.railway.com/deployments/healthchecks), [Vercel](https://vercel.com/docs/project-configuration/vercel-json), [Sentry](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/), [Better Stack](https://betterstack.com/docs/logs/ingesting-data/http/logs/).

## Actions externes des workflows

Le worker doit inclure `workflow_run` dans `WORKER_JOB_TYPES`. Le bloc IA utilise la même sélection de fournisseur que le web : `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`, ou `AI_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL`. Renseigner la clé correspondante dans les deux services ; une clé présente uniquement dans Vercel ne configure pas Railway. Le web conserve la même clé `INTEGRATION_ENCRYPTION_KEY` que le worker pour les tokens OAuth et destinations chiffrées. Une erreur `record_changed` exige un nouvel aperçu de workflow : ne pas relancer automatiquement un aperçu périmé.

Les comptes calendrier déjà connectés en lecture doivent être reconnectés pour autoriser `calendar.events` chez Google ou `Calendars.ReadWrite` chez Microsoft. Les comptes email utilisés sont ceux de la personne qui publie ou lance l’exécution. Les destinations Slack et webhook se configurent dans Relay, onglet Connexions des automatisations, avec un compte administrateur.

Un formulaire ou webhook entrant utilise `/api/workflow-hooks/{workflow_id}` avec une signature HMAC ; le guide utilisateur détaille le format. Définir `APP_URL` sur le domaine public pour que Relay affiche le bon endpoint. Aucun secret ne doit être embarqué dans un formulaire exécuté côté navigateur.

Les contrôles ciblés sont disponibles via `npm run test:workflows` et `supabase/tests/workflow-blocks.sql` (rollback). Ils couvrent les scopes, variables, filtrage réseau, outbox, reprise, déclencheurs et confidentialité. Ils n’envoient aucun email réel ; une connexion OAuth autorisée reste nécessaire pour valider un envoi réel chez chaque fournisseur.
