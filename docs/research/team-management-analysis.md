# Gestion d’équipe : comparaison et adaptations Relay

Date : 7 octobre 2026. Analyse des documentations officielles, pas des comptes clients ni de la configuration interne des concurrents. Certaines fonctions dépendent de leurs offres.

## Ce qui revient chez les CRM comparables

| CRM        | Idée utile pour Relay                                                                     | Source officielle                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attio      | Séparer membres et invitations, renouveler/annuler, protéger les données lors d’un départ | [Gestion des membres et équipes](https://attio.com/help/reference/workspace-settings-billing/manage-members-and-admins)                                                                       |
| folk       | Rôles faciles à comprendre et gestion des collaborateurs cohérente avec les permissions   | [Rôles](https://help.folk.app/en/articles/10063725-workspace-roles-permissions)                                                                                                               |
| Close      | Retirer un utilisateur sans effacer l’activité commerciale historique                     | [Gestion des utilisateurs](https://help.close.com/account-management/plans-and-billing/adding-and-removing-users)                                                                             |
| HubSpot    | Examiner et réattribuer le travail avant la désactivation d’un utilisateur                | [Désactivation et suppression](https://knowledge.hubspot.com/user-management/remove-hubspot-users)                                                                                            |
| Pipedrive  | Distinguer gestion des utilisateurs, permissions d’action et visibilité                   | [Gestion globale des utilisateurs](https://support.pipedrive.com/en/article/global-user-management?category=account-settings)                                                                 |
| Copper     | Distinguer les droits administratifs et la visibilité par équipe                          | [Droits administratifs](https://support.copper.com/en/articles/8823478-enable-disable-admin-access), [Visibilité](https://support.copper.com/en/articles/8823343-team-visibility-permissions) |
| monday CRM | Présenter clairement les types d’utilisateurs et les accès externes                       | [Types d’utilisateurs](https://support.monday.com/hc/en-us/articles/360002144900-User-types-explained)                                                                                        |
| Zoho CRM   | Séparer la hiérarchie des rôles et les profils de permissions                             | [Rôles et profils](https://help.zoho.com/portal/en/kb/crm/faqs/roles-and-profiles/articles/faqs-roles-and-profiles)                                                                           |
| Freshsales | Centraliser l’attribution des rôles et expliquer les droits associés                      | [Rôles et permissions](https://crmsupport.freshworks.com/support/solutions/articles/50000002412-how-to-configure-roles-and-manage-user-permissions-in-freshworks-crm-)                        |
| Salesforce | Donner les permissions nécessaires au travail, avec une administration distincte          | [Sécurité des objets](https://trailhead.salesforce.com/content/learn/modules/data_security/data_security_objects)                                                                             |
| Creatio    | Structurer l’administration des utilisateurs, rôles et droits d’accès                     | [Gestion des accès](https://academy.creatio.com/docs/user/access_management)                                                                                                                  |

## Adaptations réalisées

- Dans **Paramètres → Équipe et accès** : onglets Membres et Invitations, recherche sur validation, filtre de rôle, pagination de 25 lignes. Les droits sont expliqués dans le produit.
- Invitations normalisées par adresse, échéance de 7 jours, renouvellement, annulation et lien partageable. L’accès exige l’adresse réellement confirmée dans Supabase Auth ; aucun rôle ne provient de paramètres d’URL ou d’un email déclaré côté navigateur.
- Propriétaire protégé ; aucun changement de son propre rôle. **Les administrateurs peuvent inviter, promouvoir et gérer d’autres administrateurs**, comme chez Attio. Le propriétaire et son propre accès restent protégés.
- Chaque changement exige la version actuelle de l’appartenance. Un écran ancien reçoit une erreur 409 et doit être actualisé.
- Retrait avec aperçu des quantités et réattribution à un responsable actif du même espace. Fiches, tâches, engagements et réalisations sont réattribués dans la même transaction que le retrait ; notes et historique sont conservés.
- Retrait ou passage à Lecteur : suppression des secrets de connecteurs dans Relay, désactivation des synchronisations, annulation des jobs actifs de cet utilisateur dans cet espace et pause des séquences. Les éventuels accès aux portails de cet espace sont également révoqués lors du retrait. Les autres espaces et le compte Auth global restent disponibles.
- Journal des invitations, acceptations, changements de rôle et retraits ; lecture réservée aux administrateurs et au propriétaire.

## Contrôles et coût

Les règles sont vérifiées dans les fonctions SQL, y compris si le client contourne l’interface et appelle directement les RPC. Les fonctions publiques sont des wrappers `security invoker` ; les fonctions privées privilégiées vérifient l’utilisateur courant et son appartenance. Les écritures directes d’invitations sont révoquées, et les politiques RLS existantes protègent les appartenances et les données.

Un verrou transactionnel par espace sérialise les changements d’accès et l’acceptation des invitations. Les changements sensibles vérifient de nouveau le rôle après acquisition du verrou. Une attente de verrou supérieure à 3 secondes échoue plutôt que de bloquer longtemps. Les erreurs provoquent le rollback de l’opération complète.

Index par espace pour les listes paginées, index d’adresse normalisée pour l’unicité et index limité aux invitations à accepter. Pas de chargement de toute l’équipe dans l’application, pas de recherche réseau à chaque frappe. Au plus 100 invitations actives, 30 changements administratifs par minute et un renouvellement par adresse par minute. Un retrait est limité à 10 000 éléments attribués ; au-delà, réattribuer par lots.

Les tests SQL `supabase/tests/team-access.sql` exercent les vrais RPC et RLS avec des fixtures entièrement annulées : droits insuffisants, ancien RPC, version périmée, réattribution hors espace, invitations non vérifiées/annulées/expirées, journal privé, réattribution, déconnexion et retrait effectif même avec l’ancien JWT. Aucun email n’est envoyé par ces tests.

## Liens d’invitation sans service email

Aucun fournisseur d’envoi d’invitations n’est utilisé. L’administrateur crée ou renouvelle l’invitation puis copie le lien personnel affiché et le transmet à la personne concernée. Seul `APP_URL` en HTTPS est nécessaire en production.

Chaque lien contient 32 octets aléatoires produits par pgcrypto ; seule son empreinte SHA-256 est stockée dans une table privée avec RLS et aucun droit de lecture client. Le secret est rendu une seule fois lors de la génération. Le renouvellement le remplace, l’annulation le supprime et l’acceptation le consomme. Le journal d’audit ne contient aucun jeton.

Le secret voyage dans le fragment du lien, absent des requêtes HTTP initiales et des référents. La page le retire de l’adresse et le conserve via un cookie HttpOnly, Secure en production et SameSite=Lax, limité à l’API d’invitation. Aucun secret n’est placé dans les URL de connexion, de confirmation email, ni dans localStorage. La durée effective reste contrôlée en base (7 jours).

La page exige une session vérifiée, l’adresse invitée exacte et une confirmation explicite. Les anciennes invitations sans jeton doivent être renouvelées ; la simple visite du CRM ne les accepte plus. Le contrôle est également dans les RPC, pas seulement dans l’API Next.js. Le renouvellement, l’annulation et l’acceptation utilisent le même verrou transactionnel par espace. Les tests vérifient aussi le mauvais compte, l’expiration, la rotation et l’impossibilité de réutiliser un lien consommé.

Les emails de vérification de compte restent ceux de Supabase Auth ; ils ne sont pas des emails d’invitation Relay.

## Limites explicites

Cette livraison renforce **les collaborateurs d’un espace**. Elle ajoute une visibilité par fiche pour les lecteurs, mais ne crée pas de départements, hiérarchie d’équipes, permissions automatiques par objet ou par champ, profils personnalisés, SAML/SSO ou SCIM. Ces fonctions nécessitent une conception dédiée des ACL ; les présenter comme actives sans les contrôler sur toutes les lectures et écritures serait trompeur.

Le retrait empêche les prochains accès et invalide les traitements dans Relay. Il ne rappelle pas une action déjà envoyée à Google, Microsoft ou à un autre fournisseur, et ne supprime pas le consentement OAuth dans le compte du fournisseur. Des données déjà téléchargées par un utilisateur ne peuvent pas être retirées de son appareil.

## Résultat des vérifications

TypeScript et ESLint ciblé : aucune erreur. Préflight SQL et tests après migration réussis, sans fixtures conservées ni email envoyé. Le contrôle Supabase de sécurité ne signale aucune erreur et aucune alerte sur les nouvelles fonctions d’équipe. Quatre avertissements existants restent présents : trois RPC d’import/séquence exposées en `security definer` et la protection contre les mots de passe compromis désactivée. Ces observations ne constituent pas une certification générale de sécurité de l’application.

## Visibilité des lecteurs et délégation administrative

Inspirations : [Attio autorise la promotion par un administrateur](https://attio.com/help/reference/workspace-settings-billing/manage-members-and-admins) ; [Pipedrive distingue visibilité et permissions](https://support.pipedrive.com/en/article/visibility-groups).

Dans Membres → Données visibles, un lecteur reçoit tout l’espace ou une sélection explicite (1 000 fiches maximum). Les lecteurs existants gardent leur visibilité actuelle ; les nouveaux lecteurs et les changements vers Lecteur commencent sans aucune fiche. La sélection ne se propage pas automatiquement aux contacts/opportunités associés et ne comprend pas les nouvelles fiches futures.

Une table privée avec RLS, droits révoqués et clés étrangères tenant-bound conserve les autorisations. Des politiques restrictives s’ajoutent aux ACL existantes sur toutes les tables publiques métier concernées : fiches, enfants, relations (les deux extrémités), entrées et listes visibles, audit lié. Les données opérationnelles globales sans rattachement fiable sont fermées pour un lecteur sélectionné. Les recherches, agrégats et exports utilisent déjà le client authentifié et héritent de ces RLS. Les résultats de jobs privilégiés sont aussi bloqués pour ces lecteurs. Les lecteurs gardent les métadonnées nécessaires pour utiliser le CRM : espace, collaborateurs, types, champs et pipelines.

Le contrôle ne s’appuie pas sur des claims de rôle périmés. L’enregistrement vérifie le rôle administrateur courant, le rôle Lecteur de la cible, la version, l’espace de chaque fiche et le plafond ; il est atomique, audité et sérialisé avec les autres changements d’accès. Changer de rôle efface les autorisations précédentes. Les portails des clients externes conservent leurs ACL, mais un lecteur interne sélectionné ne peut pas utiliser un portail pour contourner sa sélection.

Les tests `supabase/tests/reader-visibility.sql` couvrent les données liées, notes privées, listes, audits, rapports, documents et Storage, snapshots, accès inter-espace, écriture interdite, version périmée, révocation avec ancien JWT, changement de rôle et préservation des portails externes. Ils ont aussi révélé une collision existante entre `documents.name` et `storage.objects.name` dans la politique de téléchargement ; la référence est désormais qualifiée explicitement.

Toute nouvelle table métier ou RPC privilégiée doit intégrer cette règle de visibilité ; une fonction `security definer` ne doit jamais renvoyer un dataset CRM global à un lecteur sélectionné. Les champs individuels des fiches choisies ne sont pas masqués et les données déjà téléchargées ne peuvent pas être rappelées.
