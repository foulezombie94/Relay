> État de l’audit au moment de sa rédaction. Les corrections ultérieures de pagination, formulaires, rappels, synchronisation et séquences sont décrites dans [daily-crm-operations.md](../features/crm/daily-crm-operations.md). Les limites qui restent y sont indiquées.

# Relay : audit de complétude fonctionnelle

Date : 6 octobre 2026. Révision examinée : 7fbeee7.

## Verdict

Relay possède un socle CRM implémenté et plusieurs modules complémentaires. Ce n’est pas encore un CRM complet au niveau des éditeurs étudiés, ni une version dont tous les parcours de production sont validés. Il peut servir de base à un pilote avec une petite équipe, en annonçant clairement ses limites.

Cette analyse compare le code disponible aux catalogues officiels des éditeurs. Elle ne remplace pas une recette des parcours utilisateur, une mesure de charge ou une validation de chaque connexion fournisseur. Aucune page n’a été vérifiée dans le navigateur pendant cet audit, conformément à la préférence exprimée.

## Les concurrents les plus proches

Aucun produit ne correspond exactement à Relay ; le rapprochement repose sur contacts/entreprises/ventes, personnalisation, contexte relationnel et cible B2B.

| Produit   | Proximité avec Relay                                                               | Écart important à travailler                                                                    | Source officielle                                 |
| --------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Attio     | CRM relationnel configurable, objets et données personnalisés, contexte commercial | Synchronisation, enrichissement, automatisations, rapports configurables, permissions avancées  | [Catalogue par offre](https://attio.com/pricing)  |
| folk      | Relations, contacts, entreprises et pipelines pour petites équipes                 | Capture navigateur, enrichissement, messages et séquences                                       | [Produit](https://www.folk.app/)                  |
| Copper    | Relations et ventes des entreprises de services, continuité vers la livraison      | Intégration Google Workspace, rappels et actions automatiques, gestion de projets plus intégrée | [Produit](https://www.copper.com/)                |
| Pipedrive | Opportunités, pipeline, activités et suivi commercial                              | Automatisation, capture de prospects, intégrations et gestion de projets                        | [Produits](https://www.pipedrive.com/en/products) |
| Close     | Contacts, ventes et communications pour équipes commerciales                       | Téléphonie, SMS et automatisation des communications, absents de Relay                          | [Produit](https://close.com/)                     |

Les fonctionnalités des éditeurs dépendent des offres, options et intégrations. Leur présence au catalogue ne démontre pas qu’elles sont toutes nécessaires à la cible de Relay. Salesforce et HubSpot ne sont pas les références principales retenues ici : leur périmètre est plus large que le produit actuel.

## Ce qui existe dans Relay

- Connexion, inscription, récupération de compte, espaces et quatre rôles.
- Personnes, entreprises, opportunités, relations, attributs et objets personnalisés.
- Tableaux, vues sauvegardées, filtres simples, listes et pipeline visuel.
- Plusieurs pipelines, probabilités par étape ou vente, raisons de perte.
- Forecast ouvert, gagné/perdu séparés par devise, résultats mensuels et comparaison indicative aux taux historiques observés.
- Import CSV/XLSX avec association des colonnes, aperçu, validation, journal et reprise atomique/idempotente ; export filtré.
- Notes, tâches, activités, documents et recherche textuelle dans plusieurs ressources.
- Connexions Gmail/Google Calendar/Outlook/Outlook Calendar, import manuel et envoi email confirmé ; clés et opérations Zapier limitées.
- Modèles email, comparaison des doublons, fusion et annulation sous contrôle.
- Engagements avec preuves, contradictions à examiner, réalisation, portail client.
- Assistant IA conditionné à son activation et transcriptions ajoutées manuellement.
- Guide utilisateur public avec 25 articles et lien depuis la landing page.

« Présent dans le code » ne signifie pas « intégralement validé avec des utilisateurs et les fournisseurs ». Les tests ciblés et compilations réalisés auparavant ne couvrent pas tous les parcours.

## Parcours incomplets et limites concrètes

| Constat                                                                                 | Conséquence utilisateur                                                                                                       | Preuve dans le dépôt                                                                            |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Import mail/calendrier manuel, 25 éléments ; calendriers en lecture                     | L’historique client ne s’alimente pas complètement en arrière-plan                                                            | `src/components/pages/communications.tsx`, adaptateurs d’intégration                            |
| Séquences sauvegardées sans moteur d’envoi programmé                                    | Préparer une séquence ne relance pas les prospects                                                                            | `src/components/pages/resource-page.tsx`, documentation et absence de worker de séquences livré |
| Workflows après simulation et confirmation, limités à 100 fiches                        | Ce ne sont pas des automatismes déclenchés en continu                                                                         | `src/components/pages/workflows.tsx`, `src/app/api/[workspace]/simulate/route.ts`               |
| Modules génériques chargés avec `size: 100`, sans navigation de pages dans ce composant | Au-delà de 100 éléments, une recherche locale ne voit pas les éléments non chargés ; certains choix de fiches sont incomplets | `src/components/pages/resource-page.tsx`, `src/components/pages/lists.tsx`                      |
| Sources de contradictions, jalons, séquences et définitions de workflows saisis en JSON | Un utilisateur métier doit encore manipuler une structure de données                                                          | `resource-page.tsx`, `workflows.tsx`, `settings.tsx`                                            |
| Filtres simples et six états de vente stables                                           | Impossible de composer tous les segments complexes ou un nombre libre d’étapes                                                | `src/lib/domain/views.ts`, `src/lib/domain/pipelines.ts`                                        |
| Rôles d’espace et confidentialité ciblée                                                | Pas de permissions configurables par équipe, objet ou champ, ni de SSO/SCIM livré                                             | Couverture et implémentation des rôles existants                                                |
| Réunions ajoutées manuellement, IA sur un contexte récent limité                        | Pas de capture automatique d’appel ni d’analyse exhaustive de l’historique                                                    | `resource-page.tsx`, `src/app/api/[workspace]/assistant/route.ts`                               |
| Invitation enregistrée, lien partagé manuellement                                       | L’arrivée d’un utilisateur nécessite un échange hors application                                                              | `src/components/pages/settings.tsx`                                                             |
| Rapports prédéfinis et historique disponible, sans constructeur de dashboards           | Pas de tableaux de bord libres, objectifs et funnels avancés                                                                  | `src/components/pages/reports.tsx`, `sales-history.ts`                                          |

La pagination et les sélecteurs incomplets sont des problèmes de parcours à traiter, pas seulement des fonctionnalités concurrentielles facultatives. Leur présence est constatée dans le code ; leur impact n’a pas été reproduit dans un navigateur avec un jeu de plus de 100 fiches pendant cet audit.

## Ordre de priorité recommandé pour une V1

1. Finir l’accès à toutes les données : pagination, recherche serveur et sélecteurs qui retrouvent toutes les fiches autorisées.
2. Remplacer les formulaires JSON destinés aux utilisateurs par des champs et listes éditables.
3. Assurer le suivi quotidien : échéances, notifications et rappels avec une livraison traçable.
4. Développer une synchronisation incrémentale fiable avec reprise et erreurs compréhensibles.
5. Si la prospection est centrale, livrer les séquences : planification, arrêt, réponses, exclusions et contrôle des doubles envois.
6. Valider des parcours complets avec une petite équipe : import → contact → vente → engagement → réalisation → portail, ainsi que invitations et récupération de compte.

En parallèle, préparer l’exploitation publique : hébergement, suivi des erreurs, sauvegarde et restauration démontrées, gestion des demandes sur les données. L’absence de Stripe reste un choix demandé, pas un bug. Les capacités SSO, téléphonie et applications natives peuvent rester hors V1 si les clients pilotes ne les demandent pas.

## Positionnement

« Du CRM commercial à la réalisation des engagements client » reste un angle cohérent pour des entreprises de services. Il faut le démontrer par un parcours simple et fiable.

Copper et Pipedrive proposent déjà la continuité vente/projet : le simple dossier après une vente gagnée ne suffit pas à différencier Relay. Le couple engagements sourcés/preuves, examen des contradictions et partage client mérite d’être testé auprès des utilisateurs ; cette analyse ne démontre pas une exclusivité de marché.

Aucun pourcentage global de complétude n’est donné : une fonction indispensable peut peser davantage que dix modules secondaires, et le catalogue concurrentiel évolue.
