# Store Zyliad et gestion des connexions

Livraison du 11 octobre 2026. Les **19 intégrations demandées** sont accessibles dans Apps et Settings → Intégrations. Microsoft Teams, déjà présent, est conservé comme vingtième fiche. Une fiche ne prouve ni l’existence d’un adapter complet ni la validation OAuth en production.

## Disponibilité réelle

- `Installed` exige une connexion existante ou une clé Zapier active ; aucune variable serveur ne suffit à simuler une installation.
- `Disponible` indique un connecteur utilisable avec sa configuration serveur actuelle. Cela ne certifie pas la Definition of Done du fournisseur.
- `Configuration requise` distingue les connecteurs implémentés dont la configuration manque ou dont le rollout sécurisé est désactivé.
- `En développement` signifie que l’adapter correspondant manque. Le bouton d’installation est désactivé ; ajouter des secrets ne le débloque pas.
- `Needs attention` regroupe les connexions dégradées, révoquées côté fournisseur ou en erreur nécessitant une reconnexion. Une révocation locale en cours n’est pas présentée comme installée.

| App                     | Code disponible                                                           | À terminer / valider                                                                 |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| API & Webhooks Zyliad   | Fiche store                                                               | API v1, clés publiques, webhooks sortants avec protection SSRF                       |
| Google Calendar         | Adapter partagé, actions typées, choix du calendrier et sync sélectionnée | OAuth réel, renouvellement des canaux et polling de secours                          |
| Gmail                   | Adapter partagé, recherche bornée, sync incrémentale, validation Pub/Sub  | Création et renouvellement du watch et de son abonnement Pub/Sub ; OAuth réel        |
| Outlook / Microsoft 365 | Connecteur historique mail conservé                                       | Adapter Graph partagé et validation complète                                         |
| Outlook Calendar        | Connecteur historique calendrier conservé                                 | Adapter Microsoft partagé et validation complète                                     |
| Slack                   | Fiche store                                                               | Adapter officiel, app OAuth, signatures, actions et validation                       |
| Stripe                  | Fiche store                                                               | Adapter officiel read-only, mécanisme de connexion compte, webhooks et validation    |
| Google Drive            | Adapter partagé, recherche des fichiers autorisés, sync sélectionnée      | Sélection initiale des fichiers, renouvellement des canaux et validation réelle      |
| Google Sheets           | Adapter partagé, recherche des spreadsheets, actions de ranges backend    | UI d’import/export, confirmation bulk, validation réelle                             |
| Calendly                | Fiche store                                                               | Adapter OAuth/webhooks et validation                                                 |
| Typeform                | Fiche store                                                               | Adapter OAuth, mapping des réponses, webhooks et validation                          |
| Notion                  | Fiche store                                                               | Adapter conforme à la version actuelle de l’API et validation                        |
| Zapier                  | Clés hashées, API limitée historique et gestion conservées                | Application publique, tous les triggers/actions, tests officiels Zapier              |
| Dropbox                 | Fiche store                                                               | Adapter OAuth, fichiers et webhooks ; validation                                     |
| OneDrive                | Fiche store                                                               | Adapter Graph partagé, sélection des fichiers et validation                          |
| PandaDoc                | Fiche store                                                               | Adapter OAuth, documents, envoi confirmé et webhooks ; validation                    |
| Apollo                  | Fiche store                                                               | Vérification du partenariat/plan, adapter autorisé et validation                     |
| Google Meet             | Meet P0 backend via Calendar ; imports historiques conservés              | UI de création, enregistrement/transcription selon consentement et plan ; validation |
| Zoom                    | Import historique de transcriptions conservé                              | Adapter réunions OAuth, webhooks, permissions et validation complète                 |

Les tools et policies du nouveau framework ne changent pas les permissions de l’assistant ou des workflows historiques. Leur branchement reste explicitement à terminer.

## Gestion Google livrée

Quand la plateforme est activée pour des essais contrôlés, les connexions Google apparaissent dans les mêmes fiches du store. Le consentement présente les scopes de la fonctionnalité choisie avant OAuth et propose les permissions d’écriture supplémentaires. `drive.file` inclut intrinsèquement lecture et écriture des fichiers partagés ; l’interface le précise. Meet P0 requiert Calendar en écriture pour produire un lien de conférence.

La page Manage affiche compte, état humain, permissions accordées, apps actives, dernière sync, vérification de santé, reconnexion, recherche Gmail/Drive/Sheets paginée, sélection de calendrier et activation explicite de la sync. Aucune ressource n’est sélectionnée implicitement lors de l’ouverture de la page. Les résultats distants sont du texte React, sans HTML interprété.

Les permissions read/create/update/send/delete sont réservées aux administrateurs et vérifiées à nouveau sur le serveur. Les envois et suppressions restent soumis aux confirmations du backend, sans switch permettant de les contourner. Une proposition affiche ses paramètres exacts déchiffrés côté serveur ; le navigateur reçoit cette proposition nettoyée, jamais les tokens. Expiration, refus, génération du compte et autorisations sont revérifiés lors de l’exécution. Un statut `unknown` impose une vérification distante avant tout nouvel envoi.

Déconnecter exige confirmation et explique que toutes les apps du même compte Google sont concernées. L’arrêt local est immédiat, la révocation distante/destruction des credentials passent par le worker existant. Les anciens connecteurs restent distincts, sans transfert de tokens ni changement implicite de clé de chiffrement.

## Contrats et sécurité

- GET `/api/{workspace}/integration-platform` retourne le catalogue et des tableaux vides lorsque le rollout est désactivé, après contrôle du membership. Il ne lit alors aucune table privée.
- Rollout actif : les RPC existantes imposent ownership et workspace ; le snapshot valide et supprime les champs inattendus des policies, commandes et audit avant la réponse HTTP.
- GET `/api/{workspace}/integration-platform/{connection}?resource=...` retourne seulement `enabled` et `last_sync_at`. Le curseur chiffré et la configuration privée restent côté serveur. Une intégration non activée est refusée.
- Les mutations conservent origine, membership actuel, refus du lecteur et validation stricte. Aucun `workspace_id` de formulaire ne fait autorité.
- Le catalogue client n’importe ni le registre serveur ni les variables privées. Les noms de variables manquantes sont les seules informations de configuration montrées aux administrateurs.
- Cette livraison ne change aucun schéma : la migration de fondation déjà appliquée reste immuable.

Les logos proviennent de domaines fournisseurs : Google gstatic, Microsoft SharePoint brand icons, favicons servis par les sites des autres fournisseurs. Pas de recoloration ni de logo redessiné ; si un asset distant échoue, ses initiales sont affichées. Les liens restent statiques, sans URL fournie par le modèle ou l’utilisateur. Les nouveaux assets distants n’ont pas pu être vérifiés depuis le shell (restrictions réseau) ; ce fallback évite une icône cassée.

## Validation et activation

Les tests couvrent les 19 fiches, Teams conservé, filtres/recherche, absence d’installation fictive, metadata sans secrets, refus des autres workspaces, ressources non activées, politiques administrateur, readers, confirmation de déconnexion et aperçu exact des commandes avec contenu HTML traité comme texte. Les six suites SQL du framework passent sur PostgreSQL 17 jetable ; aucune fixture n’est lancée en production.

Le MCP confirme la migration de fondation appliquée et RLS activée sur les tables privées d’intégration, sans SELECT pour `anon`/`authenticated`. Les RPC management et runtime restent respectivement réservées à `authenticated` et `service_role`.

Activer Google nécessite les variables serveur et le rollout sur **Vercel et Railway**, un worker prêt et les validations OAuth réelles décrites dans [google.md](google.md). Les applications et comptes de test n’étant pas disponibles, aucun nouveau fournisseur n’est déclaré conforme à la Definition of Done de production. Garder le rollout général désactivé jusqu’à cette validation.

Documentation officielle consultée pour le consentement : [Google OAuth serveur](https://developers.google.com/identity/protocols/oauth2/web-server). Les exigences restantes Gmail watch/renouvellement et fallback viennent du [guide push Gmail](https://developers.google.com/workspace/gmail/api/guides/push). Aucun endpoint ni scope de fournisseur supplémentaire n’est ajouté par cette livraison.
