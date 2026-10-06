# Déployer et exploiter Relay

## Architecture

Vercel sert Next.js, les API interactives et les callbacks OAuth. Supabase conserve Postgres, Auth, RLS et Storage. Le worker Railway consomme directement la file Postgres ; aucun traitement de fond ne dépend d’une longue requête Vercel. Stripe reste hors du périmètre.

Les handlers `email_sync`, `calendar_sync`, `sequence_send`, `workflow_run`, `notifications` et `imports` sont séparés dans `src/lib/jobs/handlers`. Les imports, workflows et rappels partagent un adaptateur SQL transactionnel. Les notifications d’attribution restent immédiates, dans la transaction métier.

Jobs, payloads, événements et heartbeats sont dans `relay_private`, sans accès aux clients. L’utilisateur peut seulement demander son import, confirmer son aperçu de workflow ou synchroniser son propre compte connecté. Le statut masque payloads, secrets et verrous. Le worker revérifie les autorisations actuelles avant les effets métier.

## Garanties et limites

La prise est atomique avec `FOR UPDATE SKIP LOCKED`. Un token UUID protège chaque résultat ; le verrou est renouvelé toutes les 45 secondes et expire après trois minutes. Un worker traite un job à la fois, plusieurs réplicas peuvent partager la queue. Le scheduler déduplique les échéances toutes les quinze secondes.

Les erreurs temporaires ont jusqu’à cinq tentatives avec délai exponentiel et aléa, plafonné à environ une heure. Les erreurs permanentes terminent dans `dead`. Un arrêt brutal entraîne la reprise après expiration du verrou. Les heures non ouvrées reportent un envoi sans consommer les tentatives.

Les effets d’un import/workflow et la validation de son job sont dans la même transaction. La synchronisation réutilise les upserts et le curseur durable. Les séquences conservent une clé unique `(enrollment_id,step)` et marquent `sending` avant l’appel fournisseur. Un envoi incertain n’est jamais renvoyé automatiquement : vérifier la boîte d’envoi. Il n’y a pas de garantie de livraison ni d’exactement un envoi chez le fournisseur.

Les imports restent limités à 5 Mo / 1 000 lignes. La file interactive accepte au plus 200 jobs en attente par espace et 30 nouveaux jobs par minute/utilisateur. Les payloads réussis sont effacés immédiatement, ceux en échec après sept jours ; les métadonnées sont supprimées après trente jours. Les historiques métier gardent leurs propres règles de rétention.

## Local

Configurer `.env.local` depuis `.env.example`, puis :

```sh
npm ci
npm run dev
# Autre terminal :
npm run worker
```

Le worker charge `.env.local` uniquement s’il existe. Sur Railway, il lit les variables du service. Il n’a pas besoin de `JOBS_SECRET` ni de `WORKER_URL`. Port par défaut : 3001 (web : 3000). SIGTERM/SIGINT arrêtent la prise de nouveaux jobs et attendent le job courant. Le health check indique l’arrêt immédiatement.

Sur ce runtime Windows, les anciens dossiers Next ont des droits insuffisants et le verrou SWC échoue : les nouveaux fichiers utilisent `.next-local` et `.next-build`, avec `experimental.lockDistDir` désactivé uniquement sous Windows. Ne pas lancer plusieurs builds dans le même répertoire. Vercel utilise `.next`, conformément à `vercel.json`. Le verrou natif reste actif sous Linux.

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
4. Railway fournit `PORT` ; le worker écoute `0.0.0.0`. Le health check `/healthz` répond 200 si le heartbeat Supabase a réussi depuis moins de 90 secondes. `/metrics` nécessite un Bearer `WORKER_METRICS_SECRET` et expose uniquement des compteurs.
5. Commencer avec un réplica. Séparer ensuite les traitements en services via `WORKER_JOB_TYPES` (ex. `email_sync,calendar_sync` et `imports,workflow_run,notifications`). Augmenter les réplicas après observation des quotas fournisseurs et de la queue.

Le conteneur utilise l’utilisateur non privilégié `node` et ne contient aucun `.env`. Les séquences sont désactivées par défaut : pour les activer, ajouter `sequence_send` aux types du worker et `FEATURE_SEQUENCE_SEND=true` sur web + worker. Il faut toujours HTTPS, confirmation, compte connecté et lien de désinscription.

`FEATURE_BACKGROUND_JOBS=false` désactive la prise de jobs par le worker. Le web conserve alors le chemin synchrone pour petits imports/workflows et synchro manuelle ; les synchros automatiques et inscriptions de séquence sont désactivées. Les traitements déjà lancés peuvent terminer.

## Sentry et Better Stack

Configurer `SENTRY_DSN` sur web + worker et `NEXT_PUBLIC_SENTRY_DSN` sur le web. Le DSN public ne donne pas de droit de lecture. Les hooks capturent les erreurs de rendu/requête et les jobs échoués. `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` permettent d’envoyer les source maps au build. Aucun replay n’est activé.

La collecte des utilisateurs, cookies, headers, corps HTTP, paramètres d’URL, données SQL/IA et variables locales est désactivée. Un filtre efface également les contextes de requête et les valeurs d’exception. Les logs structurés contiennent des codes d’événements, types/IDs de jobs, durées et tentatives ; aucun contenu CRM, email ou token OAuth.

Créer une source Better Stack et renseigner `BETTER_STACK_SOURCE_TOKEN` et son URL HTTPS `BETTER_STACK_INGEST_URL`. L’ingestion Bearer a un timeout de deux secondes ; une panne de supervision ne bloque pas les jobs. Ajouter un moniteur pour `/api/health` et `/healthz` (si le worker a un domaine public). Alerter sur l’absence de heartbeat, l’âge des jobs et les échecs permanents. Le health check de déploiement Railway ne remplace pas une surveillance continue.

Choisir la région et les modalités de traitement adaptées à l’hébergement européen dans chaque service.

## Migrations et vérifications

Les migrations `scalable_job_runtime`, `job_queue_operational_indexes` et `connector_lease_renewal` sont versionnées dans `supabase/migrations`. Ne pas lancer un `db push` aveugle tant que l’historique initial décrit dans README n’a pas été réconcilié.

```sh
npm run typecheck
npm run test:jobs
# Définir SUPABASE_DB_URL avec TLS vérifié :
npm run test:queue
```

Le test SQL utilise ROLLBACK et ne conserve pas ses fixtures. Il couvre déduplication, prises exclusives, autorisations, transaction, backoff, reprise après arrêt et verrous périmés. Les tests du runner couvrent les délais, le double commit et les envois incertains. Aucun email réel n’est envoyé par ces tests.

Pour l’activation publique, renseigner les identifiants externes et le domaine, configurer SMTP Auth et les sauvegardes/PITR selon l’offre et essayer une restauration. Les fichiers ne créent pas les comptes externes. La capacité à forte charge n’est pas mesurée ; les quotas Gmail/Graph, le plan Supabase, les uploads Vercel et la rétention doivent être dimensionnés.

Références : [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Railway health checks](https://docs.railway.com/deployments/healthchecks), [Vercel](https://vercel.com/docs/project-configuration/vercel-json), [Sentry](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/), [Better Stack](https://betterstack.com/docs/logs/ingesting-data/http/logs/).
