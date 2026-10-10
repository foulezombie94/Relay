# Portails clients Zyliad

État au 10 octobre 2026. Références de design dans [l’analyse comparative](../research/portal-competitive-analysis.md).

## Parcours

- `/portal` : tous les portails accessibles à l’utilisateur connecté. Les cartes distinguent espaces de l’équipe et invitations externes. Recherche, filtre actif/en pause, vues cartes/liste, progression, échéance, activité et copie du lien. Le total correspond au filtre ; les autres indicateurs portent explicitement sur les portails de la page.
- `/app/portals` : gestion du workspace courant, création liée à une fiche CRM, renommage, activation/désactivation et suppression confirmée. Le panneau de partage sépare contenu, accès et échanges. Un administrateur autorise les adresses, commentaires, expirations et révocations. Un lecteur ne peut pas modifier les partages.
- `/portal/[id]` : vue d’ensemble, actualités, étapes, documents, décisions et échanges. Le client voit seulement le contenu explicitement partagé. Les décisions sont consultables ; leur modification reste dans le CRM. Les messages n’affichent pas les adresses ou identifiants des autres participants.

Les pages vides expliquent comment obtenir un accès ou créer le premier espace selon les permissions réelles. Aucun contenu de démonstration, indicateur inventé ou invitation automatiquement envoyée. La création d’une autorisation email exige de partager le lien avec le client ; la session de celui-ci doit correspondre à son adresse autorisée.

## Architecture et sécurité

UI sous `src/components/portal/`, projections/validation sous `src/lib/domain/portals.ts`, données et contrôles serveur sous `src/lib/api/portals.ts`. Les routes Next délèguent à ces fonctions.

`portal_directory` et `portal_summaries`, ajoutées par `20261010225203_portal_workspace_experience.sql`, sont SECURITY INVOKER avec search_path vide. Elles exigent un utilisateur authentifié, respectent les RLS existantes et sont interdites à anon/PUBLIC. Aucun changement des politiques d’accès ni usage de service_role pour lire les portails. Les résumés du CRM vérifient également le workspace serveur et tous les identifiants sélectionnés.

Les accès externes sont liés aux invitations valides, au portail actif et aux règles de visibilité existantes. Les fonctions SQL lisent des memberships à jour ; les métadonnées envoyées par le navigateur ne décident jamais des permissions. Les échecs de revalidation retirent les données chargées dans l’espace client. Les interfaces CRM masquent le contenu quand leurs requêtes échouent pour absence d’accès.

Les réponses privées utilisent Cache-Control private/no-store et Vary Cookie. Les textes externes sont affichés comme texte React, jamais HTML exécutable. Le POST de commentaire vérifie l’origine, l’utilisateur, le portail, le droit de commenter et la RLS de l’insert. Limites : 5 000 caractères après trim, 32 768 octets avant parsing JSON. Les champs workspace/author du client sont refusés. Un UUID d’idempotence reste stable lors d’un envoi incertain ; la confirmation exige l’identifiant exact. Un conflit de contenu n’est pas accepté comme réussite.

Un téléchargement exige un élément visible qui partage explicitement le document, un document du même workspace et les règles Storage. Le lien signé expire après 60 secondes. Une URL déjà émise peut fonctionner jusqu’à cette expiration même si le partage est retiré entre-temps.

## Pagination et charge

Répertoire : 24 portails par page ; sélection résumée limitée à 50 UUID en SQL et 24 pour la route CRM. Détail : 50 éléments et 25 messages par page. Gestion : 25 éléments/accès par page. Recherche limitée à 200 caractères et traitée littéralement. Tri stable par date puis UUID ; compte exact sous RLS. Les requêtes SQL sont limitées à cinq secondes et les index couvrent le tri paginé des éléments/messages. La vue d’ensemble montre un aperçu des éléments récents, avec un accès aux rubriques paginées pour la suite.

La suppression retire portail, partages, autorisations et échanges associés par les cascades existantes ; fiches CRM et documents d’origine sont conservés. Les règles de conservation du workspace continuent de s’appliquer.

## Validation

Tests ciblés : 28 tests domaine, serveur et UI. Ils couvrent authentification, projection limitée, frontières workspace, fichiers explicitement partagés, body borné, permission de commenter, idempotence, confirmation exacte, texte non exécutable et retrait des données après 403.

`supabase/tests/portals.sql` utilise uniquement la base locale jetable et une transaction rollback : deux workspaces, client/équipe, lecteur restreint, expiration, révocation, portail désactivé, usurpation d’auteur, droits anon/invoker, recherche littérale et pagination. Il fait partie de la suite SQL complète via `npm run test:performance:db`.

Contrôles navigateur avec fixtures interceptées, sans données de production : recherche/filtres, rubriques, lien documentaire, message confirmé, création et partage, autorisation d’un client, accès révoqué, état vide, bureau/mobile et thème sombre. Ces contrôles de rendu ne remplacent pas une connexion réelle avec un compte client en production. Le build, lint, typecheck, Prettier et les scanners de secrets complètent les vérifications ; aucun contrôle ne garantit l’absence absolue de vulnérabilités.

Résultats de cette livraison : 556 tests Vitest passent ; 19 suites SQL passent ainsi que le scénario d’onboarding concurrent. Lint : zéro erreur et 14 avertissements préexistants hors de cette fonctionnalité. Build de production, typecheck après build, vérification de structure, Prettier sur tout le dépôt, secretlint et contrôle de 106 artefacts passent. Le parcours navigateur complet est validé avec des fixtures locales.

La migration a été appliquée en production APP TQT (`duhnmyxpxizxbxlhbtzs`) avant publication du web. Le MCP a attribué la version `20261010231510` ; seule cette entrée nouvelle de l’historique a été réconciliée avec la version canonique CLI `20261010225203`, sans rejouer le SQL ni modifier un ancien fichier appliqué. Contrôles live : deux fonctions invoker, search_path vide, timeout 5 s, anon sans EXECUTE, authenticated avec EXECUTE, index présents et RLS maintenue sur les quatre tables du portail.

L’advisor Supabase ne signale pas les nouvelles fonctions du portail. Il conserve des avis globaux existants : tables privées fermées sans policies, fonctions SECURITY DEFINER authentifiées d’autres modules et [protection contre les mots de passe compromis désactivée](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Cette configuration Auth nécessite une intervention dans le dashboard Supabase ; les outils MCP disponibles ici ne permettent pas de la changer. Le contrôle ciblé des portails ne constitue pas un audit exhaustif de tout le CRM.
