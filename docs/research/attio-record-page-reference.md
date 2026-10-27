# Référence visuelle : Records → Record pages → Overview

Source : [Create and view records, Attio](https://attio.com/help/reference/managing-your-data/records/create-and-view-records), consultée le 27 octobre 2026. Les captures ci-dessous proviennent de cet article et restent attribuées à Attio ; elles servent de référence de conception.

![Company Mailchimp, Overview](assets/attio-record-overview.png)

![Actions de la fiche Company](assets/attio-record-actions.png)

## Transposition dans le CRM

La fiche utilise deux panneaux : identité, actions, propriétés et listes à gauche ; onglets, Highlights et flux compacts à droite. Les bordures légères, cartes en grille, boutons compacts et lignes d’activité suivent la capture. Les champs configurés, onglets personnalisés, thème sombre et accès en lecture seule restent applicables. Sur mobile, les panneaux s’empilent.

Les valeurs proviennent de la fiche et de son contexte autorisé. Les revenus et financements ne sont montrés que si les attributs correspondants sont renseignés ; aucune métrique de Mailchimp n’est injectée dans les données du CRM. Les images des captures sont des références documentaires, pas des boutons ou formulaires de remplacement. Les logos des fiches sont chargés par le composant existant depuis le domaine de l’entreprise.

Les actions notes/tâches/relations ouvrent leurs sections. L’ajout à une liste passe par le formulaire et le contrat existant `list_entries`, soumis aux droits du workspace. Les emails présentés correspondent aux activités email déjà consignées dans le contexte, pas à une nouvelle synchronisation de messagerie.

La consultation visuelle du site dans le navigateur connecté était indisponible ; les PNG originaux de l’article ont été récupérés et examinés directement. Une comparaison pixel par pixel de l’implémentation affichée reste à réaliser dans un navigateur.

## Vérification de cette version

Le build de production et TypeScript passent. Les 773 tests existants et quatre régressions ciblées passent : absence de métriques inventées, navigation des cartes, ajout à une liste uniquement sur confirmation et blocage du mode lecture seule. Le lint ne présente aucune erreur et conserve les 11 avertissements antérieurs. La comparaison visuelle finale dans le navigateur reste non effectuée ; cette version ne revendique donc pas une identité au pixel près.
