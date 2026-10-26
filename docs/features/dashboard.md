# Dashboard Zyliad

Livraison du 10 octobre 2026. Le dashboard reprend la composition par blocs de [Notion](https://www.notion.com/fr/help/dashboards) et les rapports CRM de [Attio](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/dashboards), avec le shell, les couleurs et les permissions Zyliad. Il ne connecte pas ces deux produits et ne reproduit pas leurs fonctions propriétaires.

## Composition

La vue d’ensemble présente quatre grands widgets sur deux colonnes : pipeline commercial (montant, nombre de fiches et répartition par étape), galerie des dernières opportunités, tâches à suivre et chronologie des échanges. Les modèles Commercial et Activité et les configurations déjà enregistrées restent disponibles. Une page peut aussi démarrer avec un bloc de notes puis être composée librement.

L’en-tête compact contient une recherche de widgets, insensible aux accents et à la casse. Cette recherche masque uniquement les blocs affichés ; elle ne change ni les filtres des sources ni la configuration enregistrée. Ajouter un widget et Personnaliser ouvrent l’édition existante, avec sauvegarde explicite. Les options de partage et de présentation sont regroupées ; les tableaux enregistrés et les exports restent accessibles dans « Tableaux enregistrés et options ». Les cartes suivent le thème clair ou sombre de l’espace. La galerie utilise des monogrammes, sans inventer d’images CRM. `/demo/dashboard` permet une vérification sur données fictives.

La bibliothèque propose **25 présentations et 32 modèles**, avec recherche et catégories :

- Indicateurs : chiffre, objectif, jauge, cartes de répartition.
- Graphiques : barres, colonnes, courbe, aire, anneau, camembert, pipeline/parcours, classement, radar, carte proportionnelle, carte de chaleur, graphique combiné.
- Vues : tableau de valeurs, liste de fiches, board, calendrier, chronologie et galerie.
- Contenu : note, titre de section et raccourcis internes.

Un dashboard contient de 1 à 24 widgets. Personnaliser ouvre le mode édition, identifié par un badge dans l’en-tête, un bandeau de modifications non enregistrées et des contours autour des widgets. Ce mode permet ajout, configuration, duplication, suppression, déplacement à la souris ou au clavier, quatre largeurs (quart, tiers, moitié, ligne entière) et trois hauteurs. Enregistrer persiste explicitement les changements ; Annuler conserve la configuration précédente. Les couvertures optionnelles se choisissent dans Nom et partage. Un menu par widget ouvre sa configuration ou une vue agrandie.

Sur le dashboard, Ctrl+K sous Windows/Linux ou ⌘K sur Mac place le focus dans la recherche de widgets en haut. Le raccourci reste disponible pour la recherche générale sur les autres pages ; il ne vole pas le focus d’une fenêtre modale du dashboard.

Les blocs de texte sont du texte simple, sans HTML, iframe ni script. Les destinations des raccourcis appartiennent à une liste fermée de pages CRM. Les illustrations de la bibliothèque sont identifiées comme telles ; les données du dashboard viennent des lectures CRM autorisées.

## Données et sécurité

Les mesures existantes restent calculées en base, avec devises séparées, filtres croisés, historique incomplet signalé et au maximum 200 groupes. Les présentations proportionnelles refusent les valeurs négatives et ne dessinent pas une répartition lorsque toutes les valeurs sont nulles. Les valeurs exactes restent consultables en tableau.

Les nouvelles vues de fiches utilisent la RPC existante `dashboard_details`, en SECURITY INVOKER, avec le client de session et le workspace validé côté serveur. Au maximum trois lectures de sources sont lancées simultanément, avec un budget global et une page de 50 fiches maximum. La projection serveur élimine tout champ supplémentaire et n’expose aucun corps d’email, token ou credential.

Le calendrier charge uniquement le mois affiché, en UTC. Changer de mois conserve l’intersection des restrictions propres au widget et des filtres globaux. Les fiches sans date ne sont pas placées arbitrairement dans le calendrier. Elles restent consultables en Liste. Pagination, recherche et tri sont explicitement limités à la page affichée ; le nombre total et le caractère partiel restent visibles. Le board présente les états actuels, sans déplacement de fiches ni mutation implicite.

L’aperçu d’une source ouvre ses métadonnées ; une vue liée à un objet CRM peut ouvrir sa vraie fiche. Les calendriers et chronologies ne proposent pas de modification de dates ni d’événements. La carte de chaleur affiche les jours présents dans le résultat, et n’invente pas des zéros pour les jours absents.

Les dashboards privés/partagés et préférences existants conservent leur RLS. Le lien interne contient les identifiants de workspace et dashboard, sans autoriser leur lecture. Les règles actuelles du destinataire s’appliquent. Les vues et modales ne maintiennent pas des fiches précédemment chargées après un rejet d’autorisation.

Les blocs de contenu ne déclenchent aucun calcul de source. La sauvegarde impose un budget de 35 000 octets sur la configuration compacte, inférieur à la limite SQL. Les nouveaux champs sont optionnels et les configurations historiques restent compatibles.

**Aucune migration SQL n’est nécessaire** : `report_dashboards.config` et `settings` sont déjà en JSONB, et la RPC existante renvoie déjà `occurred_at`. Aucun fichier de migration appliqué n’a été modifié.

## Exports et limites

Le CSV conserve les règles de protection contre les formules. Les notes sont exportées comme contenu ; les vues de fiches exportent leur première page, avec l’indication de couverture partielle. Ce bouton n’est pas un export complet de toutes les fiches CRM. Les CSV des mesures conservent leurs nombres, devises et informations d’historique.

La configuration partagée ne donne aucun droit supplémentaire sur les sources. Il n’y a ni lien public, ni nouvelle ACL d’équipe, ni modification de données CRM depuis les widgets. Les états du board sont une vue paginée, pas un décompte de chaque colonne sur l’ensemble du CRM. Les illustrations et fixtures de validation n’entrent pas dans les données de production.

## Vérification

- Contrats de tous les modèles, changement de présentation, compatibilité historique, tailles, liens interdits, dates UTC et export.
- Lectures bornées, isolation par workspace, suppression des champs privés, filtres de mois croisés et rejet des données après révocation.
- Tests DOM : pagination, recherche, calendrier, chronologie sur plusieurs années, chaînes non fiables et ouverture explicite.
- Suite SQL `supabase/tests/dashboards.sql` : RLS, sources privées, rôles viewer, révocation, dates d’échéance, intersection vide et sauvegarde des nouveaux blocs.
- Parcours navigateur sur fixtures locales : bureau/mobile/sombre, les 25 présentations, ajout, configuration, aperçu, redimensionnement, sauvegarde/rechargement, navigation mensuelle, pagination et accès révoqué.
- Contrôles de structure, tests du projet, lint, typecheck, Prettier, build et scan des bundles navigateur.

La comparaison historique du 8 octobre est conservée dans [la recherche](../research/dashboard-competitive-analysis.md). La présente page décrit la livraison actuelle.

## Présentation et composants — 25 octobre 2026

Le bouton Présenter affiche les widgets autorisés dans un diaporama local, avec compteur, précédent/suivant, navigation clavier et fermeture par Échap. Le menu Agrandir ouvre le même lecteur sur le widget choisi. Les vues de détail quittent la présentation ; un refus de lecture ne conserve pas les données dans le lecteur. Le sélecteur de type utilise une grille compacte des 25 présentations existantes. La palette, les menus, les infobulles et les légendes sont harmonisés avec le reste de l’espace. Voir [les composants de l’espace](workspace-components.md) et `/demo/components`.
