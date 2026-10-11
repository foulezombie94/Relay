# Plateforme d’intégrations Zyliad

État au 11 octobre 2026 : fondation backend et premier adapter Google, **désactivés par défaut**. Cette livraison ne certifie pas les 19 intégrations en production. Les applications OAuth et comptes de test ne sont pas encore disponibles. La marketplace et les connecteurs historiques continuent de fonctionner ; aucune connexion historique n’est migrée implicitement.

## Composants livrés

- Contrat `IntegrationProvider`, actions Zod explicites, résultats filtrés, erreurs normalisées et transport HTTPS borné sans redirection.
- Vault AES-256-GCM versionné, AAD lié au workspace, à la connexion, au compte externe et à l’usage. Clés exclusivement dans les variables serveur, distinctes des données privées.
- OAuth code + PKCE S256, consentement Google incrémental, état aléatoire hashé, cookie HttpOnly chiffré, expiration dix minutes, consommation atomique et retour limité à deux routes Zyliad.
- Connexion personnelle par famille dans chaque workspace. Vérification de membership et d’ownership dans les routes et RPC ; les tables privées restent inaccessibles aux rôles navigateur, même avec un ID connu.
- Refresh sérialisé et versionné, protection contre le changement de compte, curseurs incrémentaux chiffrés, mapping externe par connexion/ressource/ID et queue existante avec leases, retries bornés et dead letters.
- Commandes chiffrées, permissions administrateur par intégration, confirmation exacte pour les communications de l’agent et toute action critique. Aucun endpoint de confirmation n’est fourni au modèle. Une communication au résultat incertain ne se rejoue pas automatiquement.
- Notifications Calendar/Drive avec token de canal et identité de ressource ; validation Gmail/Pub/Sub JWT Google avec client partagé, audience, issuer, compte de service, email vérifié, payload et fenêtre temporelle.
- Déduplication par connexion/event ID, traitement différé et destruction du payload après traitement. `historyId` Gmail reste une notification, jamais une autorisation de remplacer le curseur sauvegardé.
- Déconnexion immédiate côté Zyliad, annulation des jobs de cette connexion, révocation distante différée puis destruction des credentials. Un membership supprimé ou rétrogradé déclenche aussi la révocation.
- Historique d’audit sans contenu privé, RPC de métriques, tests SQL d’isolation et scan de secrets des sources, logs de tests et bundles navigateur en CI.

Le [store et ses limites](store.md) affichent les 19 fiches avec leur disponibilité réelle. La gestion Google, les permissions et confirmations sont intégrées au store ; les connexions historiques et Zapier limité restent accessibles.

## Périmètre des fournisseurs

| Intégrations                                                               | État                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Calendar, Gmail, Drive, Sheets, Meet P0                             | Actions backend et synchronisation sélectionnée ; tests locaux simulés. UI Manage et permissions livrées ; validation OAuth réelle et branchement IA restent à terminer. |
| Outlook, Outlook Calendar, OneDrive                                        | Catalogue uniquement ; adapter Microsoft à implémenter après consultation officielle.                                                                                    |
| Slack, Stripe, Calendly, Typeform, Notion, Dropbox, PandaDoc, Apollo, Zoom | Catalogue uniquement ; adapters à implémenter après consultation officielle.                                                                                             |
| API/Webhooks Zyliad, Zapier                                                | Catalogue uniquement ; API publique, livraisons sortantes et intégration Zapier à implémenter.                                                                           |

`providerFor()` rejette explicitement les familles non implémentées. La présence d’une carte catalogue n’implique jamais une connexion disponible. Les policies et commandes du framework ne sont pas encore intégrées à la boucle de l’agent historique ; elles ne changent pas ses permissions existantes.

## Activation contrôlée

1. Appliquer la migration `20261010180031_integration_platform_foundation.sql` après les migrations existantes. Ne jamais exécuter les fixtures sur la production.
2. Configurer un `APP_URL` HTTPS fixe, les secrets Google et le nouveau keyring sur **Vercel et Railway**. Ne pas réutiliser la clé historique ni ajouter un préfixe `NEXT_PUBLIC_` aux secrets.
3. Créer les applications OAuth et comptes de test, enregistrer les callbacks exacts, puis effectuer les validations de [Google](google.md).
4. Déployer les deux exécutables, ajouter `integration_sync,integration_webhook,integration_revoke` à `WORKER_JOB_TYPES`, et vérifier leur readiness.
5. Activer `FEATURE_INTEGRATION_PLATFORM=true` sur les deux services uniquement pour les essais autorisés. Conserver `false` pour la mise en ligne générale jusqu’à la validation UX, IA et fournisseurs.

Le nouveau backend est sous `/api/{workspace}/integration-platform`. GET renvoie uniquement des connexions nettoyées, policies, propositions et audit. Les actions sensibles passent par POST ; connexion et mutations vérifient l’origine et la session. Le callback est `/api/integration-oauth/google/{workspace}/callback` ; un webhook utilise un UUID d’abonnement enregistré côté serveur, sans workspace fourni par le fournisseur.

## Limites à lever avant production

L’enregistrement et le renouvellement automatiques de Gmail/Pub/Sub, le polling de secours, le renouvellement des canaux Calendar/Drive, les alertes opérationnelles, la rétention configurable, la gestion opérationnelle des révocations et le branchement des tools agent/automations ne sont pas terminés. Le vérificateur Gmail est testé, mais aucun abonnement Pub/Sub n’est créé par un bouton actuel. Le job `integration_delivery` est réservé et refuse l’exécution tant que les webhooks sortants ne sont pas implémentés.

Une révocation distante qui échoue demeure en dead letter avec un credential chiffré, inutilisable pour les actions Zyliad et conservé pour la reprise opérateur. La console d’exploitation doit permettre cette reprise avant activation générale. Ne pas détruire l’unique refresh token tant qu’une révocation distante reste à réaliser. Détruire les clés d’un ancien keyring seulement après rotation de **tous** les credentials, états, curseurs, subscriptions, commandes et résultats encore retenus.

Validation et limites réelles : [protocole](validation.md). Architecture générale : [carte du dépôt](../architecture/README.md).
