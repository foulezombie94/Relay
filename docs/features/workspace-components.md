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

`ui/workspace-ui.css` harmonise les primitives existantes dans le shell, y compris les menus rendus en portail. Les pages CRM affichent directement les boutons Liste/Galerie ou Liste/Kanban/Calendrier. `ViewButtons` reprend les boutons bordés de la capture fournie : hauteur 28 px, rayon 8 px, écart 8 px, icône 15 px et état actif neutre. L’inspection actuelle de Notion montre également des onglets arrondis de 32 px, padding 6 × 12 px et texte système 14 px ; la forme plus rectangulaire de la capture utilisateur a été conservée. Le configurateur de widgets utilise toujours la grille de présentation avec les types déjà pris en charge.

Le calendrier des opportunités utilise uniquement `close_date` des résultats authentifiés et filtrés de la page courante (50 maximum, limite indiquée à l’écran). Il démarre le lundi, affiche les jours des mois voisins et ouvre la fiche sélectionnée. Les flèches changent le mois, le bouton central permet de choisir un mois et de revenir au mois courant. Les dates absentes ou invalides sont comptées sous la grille sans date inventée. Les résultats sont masqués en erreur. La sauvegarde utilise le type existant `table` et `config.layout = calendar`, sans migration ni modification des droits. Les entreprises et contacts conservent leurs modes Liste/Galerie.

Les journées chargées gardent une hauteur de 212 px avec deux cartes compactes et un bouton `+ N autres`. Celui-ci ouvre la liste complète du jour dans un panneau défilant ; choisir une fiche ferme la liste et ouvre son détail. La liste est recalculée à partir des résultats actuels et disparaît au retrait des données. Les colonnes Kanban ont une hauteur comprise entre 340 et 660 px selon l’écran, avec défilement interne des cartes et en-têtes hors de la zone défilante. Les compteurs et totaux portent toujours sur tous les résultats de la page. Le glisser-déposer et le changement d’étape existants sont conservés. Il s’agit d’une adaptation à Relay pour maîtriser la densité, inspirée des [cartes compactes de Notion](https://www.notion.com/help/boards), pas d’une affirmation d’un comportement Notion identique pour les journées très chargées.

La liste du jour comporte une recherche locale avec les mêmes mesures que celle de la sidebar : hauteur 32 px, rayon 8 px, texte 14 px / 16,8 px et padding horizontal 8/6 px. Elle filtre titres, étapes et montants sans tenir compte des accents et indique le nombre de résultats. Le filtre se réinitialise à la fermeture. Depuis le calendrier et le Kanban, une fiche ouvre un aperçu modal centré de 540 px maximum avec montant, étape et date. Les utilisateurs autorisés peuvent modifier la fiche ; l’ouverture de la fiche complète reste un choix explicite. Les résultats retirés ou en erreur ne restent pas affichés dans l’aperçu.

`/demo/dense-views` reproduit le cas de 47 fiches fictives à la même date et à la même étape avec les vrais composants de présentation. Les tests vérifient l’accès au dernier élément, la recherche et son rétablissement, la disparition des listes après retrait des données, l’aperçu modal et le maintien des droits en lecture seule.

Les graphiques Relay gardent leurs calculs, filtres et devises séparées. Leur palette et leurs infobulles ont été harmonisées ; les anneaux et camemberts disposent d’une légende cliquable et s’adaptent à la taille du conteneur. Le survol ne dessine plus de fond clair opaque en thème sombre.

Le bouton Présenter du dashboard affiche successivement les widgets autorisés. Les commandes précédent/suivant, Home/End et Échap restent locales à la présentation. Les flèches ne capturent pas la saisie des champs. Le contenu disparaît si les résultats deviennent inaccessibles ou en erreur. Une ouverture de détail quitte la présentation pour rendre le panneau de données accessible.

Le graphisme des graphiques et du diaporama est une adaptation aux widgets Relay ; aucun diaporama Notion n’a été généré ou exporté. Les fonctions Notion sans équivalent CRM ne sont pas ajoutées implicitement.

## Vérification et aperçu

La rangée d’accès rapide conserve deux raccourcis avec leur libellé ; les suivants restent accessibles dans le menu `Plus de raccourcis`, sans suppression des préférences utilisateur. Le clic sur la recherche et Ctrl+K / ⌘K ouvrent un dialogue au-dessus de la page actuelle. Ses mesures reprennent la recherche Notion inspectée dans Chrome : 1006 × 652 px maximum, position supérieure 80 px et rayon 20 px ; le bouton de réduction passe réellement à 600 px et masque l’aperçu, puis restaure la largeur et l’aperçu. La saisie, les filtres et la sélection sont conservés pendant ce changement.

Le dialogue interroge l’API de recherche authentifiée existante, après 250 ms et deux caractères, avec un cache séparé par espace, utilisateur, requête et filtre. Les résultats et leur aperçu sont masqués pendant un changement de requête ou une erreur. Les extraits restent du texte ; les ressources et les liens sont construits à partir du catalogue autorisé. Les flèches parcourent les résultats, Entrée ouvre la destination, Échap ferme. L’accueil montre des accès rapides, sans fabriquer d’historique de consultation. `/demo/search` utilise uniquement des exemples fictifs et le même composant de présentation.

`/demo/components` présente les composants réellement utilisés avec des données fictives : boutons, menus, formulaires, date, interrupteur, curseur, vues de fiches, graphiques, modal, panneau latéral et diaporama. Les actions de cet aperçu n’écrivent aucune fiche CRM.

Validation : TypeScript, contrôle de structure, lint des fichiers modifiés, build Next.js, tests des sélecteurs, navigation des diapositives, retrait des données, widgets de fiches, sidebar et isolation publique. Inspection Chrome du thème clair/sombre, des dimensions de boutons et de la navigation en présentation. Suite complète : 693 tests réussis ; échec préexistant du test d’archive MCP à cause de la différence LF/CRLF sur Windows.
