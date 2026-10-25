# Composants de l’espace Relay — 25 octobre 2026

## Référence observée

Inspection dans Chrome de la sidebar, de la page Budget mensuel et des contrôles de base de données Notion. Les styles ont été relevés avec `getComputedStyle` et les dimensions DOM. La vue de test ajoutée automatiquement pendant l’inspection a été retirée ; l’identifiant et les données de la vue initiale ont été revérifiés.

| Famille               | Mesure observée dans Notion                            | Application dans Relay                        |
| --------------------- | ------------------------------------------------------ | --------------------------------------------- |
| Typographie           | Police système Segoe UI, texte 14 px / 21 px           | Espace authentifié, démonstration et panneaux |
| Bouton principal      | 28 px, padding horizontal 8 px, rayon 6 px, #2783de    | Créer, enregistrer, actions principales       |
| Icône seule           | 28 × 28 px, padding 6 px, rayon 6 px                   | Réglages, menus et actions de widgets         |
| Sélecteur de vue      | Popup 290 px, rayon 10 px, grille de 3 colonnes        | Modes des fiches et 25 types de widgets       |
| Tuile de présentation | Environ 83 × 57 px, gap 8 px, texte 11 px              | VisualPicker, sélection explicite et clavier  |
| Menu                  | Fond blanc, survol gris, lignes compactes, ombre douce | Menus contextuels et bibliothèques            |
| Tableau               | En-tête 36 px, cellules 37 px, bordures fines          | Tableaux CRM et démonstration                 |
| Interrupteur          | Piste 30 × 18 px, poignée 14 px                        | Contrôle partagé et démonstration             |
| Statuts               | Petites étiquettes colorées et angles de 4 px          | Badges et propriétés CRM                      |

Les cartes, galeries, panneaux latéraux, modales, champs, recherches, curseurs, calendriers et infobulles utilisent les mêmes surfaces et tokens. Le thème sombre et la couleur d’accent personnalisée restent disponibles. Les tailles tactiles sont agrandies sur mobile. Les règles du thème ne s’activent qu’en présence de `data-relay-ui` ; la landing conserve sa présentation.

## Adaptation aux onglets existants

`ui/workspace-ui.css` harmonise les primitives existantes dans le shell, y compris les menus rendus en portail. Les pages CRM utilisent le sélecteur Table/Galerie ou Table/Kanban sans modifier les paramètres, filtres, droits ou sauvegardes. Le configurateur de widgets utilise la même grille avec les types déjà pris en charge. La bibliothèque conserve ses catégories et ses modèles.

Les graphiques Relay gardent leurs calculs, filtres et devises séparées. Leur palette et leurs infobulles ont été harmonisées ; les anneaux et camemberts disposent d’une légende cliquable et s’adaptent à la taille du conteneur. Le survol ne dessine plus de fond clair opaque en thème sombre.

Le bouton Présenter du dashboard affiche successivement les widgets autorisés. Les commandes précédent/suivant, Home/End et Échap restent locales à la présentation. Les flèches ne capturent pas la saisie des champs. Le contenu disparaît si les résultats deviennent inaccessibles ou en erreur. Une ouverture de détail quitte la présentation pour rendre le panneau de données accessible.

Le graphisme des graphiques et du diaporama est une adaptation aux widgets Relay ; aucun diaporama Notion n’a été généré ou exporté. Les fonctions Notion sans équivalent CRM ne sont pas ajoutées implicitement.

## Vérification et aperçu

`/demo/components` présente les composants réellement utilisés avec des données fictives : boutons, menus, formulaires, date, interrupteur, curseur, vues de fiches, graphiques, modal, panneau latéral et diaporama. Les actions de cet aperçu n’écrivent aucune fiche CRM.

Validation : TypeScript, contrôle de structure, lint des fichiers modifiés, build Next.js, tests des sélecteurs, navigation des diapositives, retrait des données, widgets de fiches, sidebar et isolation publique. Inspection Chrome du thème clair/sombre, des dimensions de boutons et de la navigation en présentation. Suite complète : 693 tests réussis ; échec préexistant du test d’archive MCP à cause de la différence LF/CRLF sur Windows.
