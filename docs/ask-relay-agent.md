# Ask Relay: agent CRM sécurisé

## Fonctionnement

Ask Relay utilise un registre Zod strict de recherches, agrégations et actions. Chaque appel utilise le client Supabase de l’utilisateur, son workspace de session et les politiques RLS. Aucun SQL libre, clé service ou token OAuth ne figure dans les paramètres du modèle. La boucle est séquentielle, limitée à 5 outils (15 avec « Approfondir »), 70 secondes et une réservation atomique des tokens en base. Les étapes publiques et le résultat vérifié passent par NDJSON ; aucun raisonnement interne n’est affiché.

Les recherches utilisent PostgreSQL Full Text Search, un curseur UUID et 20 résultats maximum. `total` est calculé indépendamment de la page. `get_source` lit 6 000 caractères à un offset explicite. Les agrégations se font en SQL sur tous les résultats autorisés et séparent les devises. Les emails couvrent uniquement la synchronisation importée ; les analyses signalent les pages manquantes, aperçus et textes tronqués. Les transcriptions importées sont recherchées avec les réunions. Les TXT/CSV/PDF textuels sont indexés à l’upload (200 000 caractères maximum, PDF 300 pages et durée bornée). Les images et les PDF scannés sans texte nécessitent encore un OCR ; les documents existants nécessitent une réindexation.

Les fiches, relations, emails, calendriers, notes, réunions, tâches, engagements, contradictions, documents, listes, pipelines et workflows disposent de recherches contrôlées. Les comptes expéditeurs restent propres à l’utilisateur. Les écritures CRM, les brouillons de workflows et les rendez-vous produisent des aperçus à confirmer. Publier un workflow n’est jamais un outil de l’agent.

## Emails et actions durables

`draft_email` conserve un brouillon privé. `send_email` ne reçoit que son identifiant. Le serveur accepte une commande directe actuelle et déterministe, avec une adresse ou un nom exact résolu vers une seule fiche, un compte détenu par l’utilisateur et un contenu sans signal sensible. Les autres situations nécessitent une confirmation dans l’aperçu. Les rappels, horaires et rendez-vous exigent une confirmation de leur date et du fuseau dans l’aperçu. Les sources privées appartenant à une autre relation exigent aussi cet aperçu. Les formulations complexes ou ambiguës passent également par cet aperçu.

L’envoi direct reste désactivé par défaut (`FEATURE_AGENT_DIRECT_SEND=false`) jusqu’à la validation fournisseurs ci-dessous. L’envoi confirmé manuellement utilise déjà la même file privée. Ne pas activer ce drapeau sur une instance sans ses migrations, son worker et les tests fournisseurs.

Le worker réutilise `relay_private.workflow_outbox`, les jobs `workflow_run` et le compteur quotidien `workflow_io_usage`. Les limites sont communes aux workflows et à l’agent : 200 tentatives d’email et 100 actions calendrier par workspace et jour UTC. La réservation et le marqueur `sending` précèdent le réseau. Un marqueur survivant à un crash devient `uncertain` ; aucune répétition automatique. Un Gmail n’est `sent` qu’après retour d’un ID. Pour Outlook, un draft immuable est envoyé une fois et `sentDateTime` est vérifié : un 202 seul ne vaut pas un envoi confirmé.

Les nouvelles tentatives depuis l’interface réutilisent l’identifiant de demande, empêchant une seconde action logique ; une variation de contenu avec la même clé est refusée. Les statuts viennent de la base, pas du modèle. L’interface réactualise les actions en cours. Les statuts incertains doivent être vérifiés manuellement dans la boîte fournisseur ; aucune fonction ne les remet automatiquement en file.

Les actions calendrier créent, modifient ou annulent un événement du compte connecté, avec droits d’écriture OAuth revérifiés. Elles ne garantissent pas encore une résolution des conflits de modifications simultanées chez le fournisseur.

## Confidentialité et rétention

Les emails demeurent privés. Les engagements et contradictions acceptés depuis des sources privées restent privés, ainsi que leurs événements d’audit. Les citations structurées de la réponse sont vérifiées sur le contenu autorisé actuel, même après plusieurs lectures par offsets. Les notes et engagements issus d’un contexte privé restent privés ; une tâche ou un workflow partagé affiche un avertissement avant confirmation. Les sources sont revérifiées avant la réponse ; les réponses antérieures sont masquées si une dépendance disparaît ou si l’empreinte des accès change. Les anciens textes du modèle ne sont jamais réutilisés comme preuves ou autorisations.

Chaque action différée revérifie le rôle, les sources, la fiche, le compte et la suppression du destinataire. Il reste nécessaire de tester les courses de révocation avec les fournisseurs réels : un effet déjà transmis ne peut pas être rappelé. Les URLs des fournisseurs sont fixes, les réponses sont bornées et les redirections refusées. Les protections HTTPS/DNS/IP des webhooks de workflows existants sont conservées.

Les journaux d’outils conservent les noms, identifiants de ressources, durées et états, sans contenu de source ni paramètres sensibles. Les tokens d’entrée/sortie et l’estimation du coût sont enregistrés par utilisateur/workspace. Les prix `AGENT_INPUT_USD_PER_MILLION` et `AGENT_OUTPUT_USD_PER_MILLION` doivent correspondre au modèle choisi. Ce sont des estimations, à rapprocher de la facturation fournisseur.

Un secret de tour généré au serveur protège les opérations de comptabilisation ; seul son hash est conservé en base et il ne passe jamais au modèle ou au navigateur. Les opérations internes de finalisation d’action ne sont pas exposées par le RPC public.

Les réservations sont conservatrices : chaque prompt successif et les définitions d’outils sont bornés avant appel. Les erreurs/crashs conservent la réservation entière pour couvrir un coût inconnu. Les réponses terminées ajustent la réservation sur l’usage reçu. Par défaut : 100 réponses par jour/workspace, 3 millions de tokens réservés par mois, une exécution simultanée par utilisateur/workspace. Les paramètres SQL sont dans `relay_private.agent_settings`.

Le scheduler supprime les brouillons après 30 jours, les actions terminées et traces de tours après 90 jours ; il conserve 13 mois d’usage agrégé. Les conversations et données CRM ne sont pas supprimées par ces délais : elles suivent les suppressions de l’utilisateur et du workspace. Vérifier les contrats de sous-traitance, paramètres de rétention IA, consentements, export et suppression avant commercialisation ; ces décisions juridiques et comptes fournisseurs ne peuvent pas être certifiés par des tests locaux.

## Autres modules de cette évolution

- Communications : fils paginés, lecture complète à la demande, réponse contextualisée Gmail/Outlook, téléchargements privés de pièces jointes limités à 20 Mo et servis en téléchargement sans rendu HTML. Aucun pixel de suivi ou HTML reçu n’est exécuté.
- Rapports : dashboards privés ou partagés composés d’indicateurs, dimensions et présentations tableau/barres, sauvegardés ; chaque visite recalcule selon les accès actuels.
- Réunions : connexions OAuth Google Meet et Microsoft Teams, puis Zoom ; imports automatiques via le scheduler existant, privés et idempotents, avec verrous de synchronisation. Relay récupère les transcriptions déjà disponibles, sans lancer d’enregistrement ou de bot. Google Meet : API Meet activée et droits Workspace permettant les transcriptions, au plus 1 000 entrées par transcription et 200 000 caractères. Teams : réunions organisées par le compte connecté, transcription activée et consentement Graph éventuellement administrateur. Zoom : enregistrements cloud et transcriptions activés, OAuth avec scopes de lecture. Les autres permissions de capture restent celles du fournisseur. Les réunions sans transcription ne sont pas inventées ; les participants ne sont pas déduits du texte. Les rattachements CRM se font dans la fiche réunion. Imports initiaux sur 30 jours puis reprises avec chevauchement, pages et limites signalées ; aucun historique fournisseur exhaustif n’est garanti.
- Segments : conditions cumulées enregistrées dans les vues et appliquées en base, y compris aux exports.

## Installation et vérifications

1. Appliquer les migrations `20261008140000` à `20261008153000` dans un environnement de test, puis production après revue. Aucun déploiement production n’est effectué par cette PR.
2. Installer les dépendances, configurer OpenAI, Supabase et OAuth existants, ajouter les URLs de callback `/api/oauth/google-meet/callback`, `/api/oauth/microsoft-teams/callback`, `/api/oauth/zoom/callback` dans les applications fournisseurs, configurer `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` pour Zoom, puis lancer le worker avec `workflow_run` activé. Les anciens comptes calendrier sans écriture doivent être reconnectés.
3. Exécuter `npm run typecheck`, `npm test`, `npm run build`, et les tests SQL ci-dessous.
4. Sur une base jetable : `RELAY_TEST_DATABASE_URL=... npm run test:agent:db` et `npm run test:agent:concurrency`. `scripts/tests/migrate-local.mts` crée une base de test à partir de tous les fichiers de migration ; son bootstrap local simule uniquement les schémas plateforme et omet le cron historique remplacé par le worker. Ne jamais l’utiliser sur une base existante.

## Validation fournisseurs requise avant activation directe

Utiliser deux workspaces, deux membres dans A et un membre dans B, avec des boîtes Gmail/Outlook de test et des calendriers de test. Vérifier : lecture complète d’un fil multi-message et pièces jointes ; réponse rattachée au fil ; envoi unique malgré deux confirmations concurrentes ; réception effective et message visible dans Sent ; révocation d’un compte/rôle avant préparation ; arrêt du worker avant/après `sending` ; perte réseau après acceptation ; erreur 429 ; statut incertain sans répétition ; création/modification/annulation calendrier ; instruction malveillante dans un email n’accordant aucune autorisation ; quota commun à une action de workflow et une action d’agent ; ancien historique devenu inaccessible. Conserver les IDs fournisseurs et les résultats, pas les tokens ni contenus personnels.

Tester également les consentements Meet/Teams/Zoom, la réception effective des transcriptions, les pages suivantes, l’indicateur de contenu incomplet et l’absence d’accès par un collègue. Les limites de rétention/disponibilité chez chaque fournisseur doivent être vérifiées sur les comptes ciblés.

Ces tests externes ne sont pas exécutables ici : aucun compte OAuth, clé OpenAI ou projet Supabase de test n’est configuré dans l’environnement. Les tests locaux ne prouvent pas la livraison réelle.

## Demandes supplémentaires nécessitant une autre intégration

Le second document comprend un catalogue concurrentiel, avec des fonctions explicitement « plus tard ». Cette PR ne revendique pas leur réalisation : bot de capture/enregistrement, participants automatiques et enrichissement depuis un fournisseur tiers, formulaires publics de prospects, objectifs commerciaux, mentions, permissions de champs et sous-équipes, extension Chrome/LinkedIn, catalogue de connecteurs, devis, téléphonie, SMS/WhatsApp, application mobile, SSO/SCIM. Les fournisseurs, consentements et contrats doivent être choisis pour les intégrations ; les permissions fines nécessitent une conception couvrant aussi exports, workflows, portails et migrations. Les rôles et accès lecteur par fiche existants restent appliqués. Aucun écran factice n’est présenté comme une intégration opérationnelle.
