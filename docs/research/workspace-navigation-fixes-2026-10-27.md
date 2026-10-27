# Contexte d’espace et liens directs — 27 octobre 2026

L’audit connecté a reproduit deux défauts : un espace choisi revenait au premier espace après rechargement ; le lien direct d’une fiche omettait son espace et ne retrouvait pas la fiche lors d’une navigation complète. Une recherche sans résultat utilisait aussi le message d’un espace vide.

## Comportement corrigé

- La sélection ajoute `workspace` à l’URL, en conservant le fragment de section. Une navigation interne sans ce paramètre reprend le contexte courant du même onglet et qualifie sa nouvelle URL. Une URL explicite prend le dessus, y compris lors de Précédent/Suivant.
- Le workspace est toujours recherché dans les memberships retournés par la session. Une URL désignant un espace inaccessible affiche un état dédié et propose les espaces autorisés ; elle ne reprend pas silencieusement le premier espace et ne charge pas ses données à la place de l’espace demandé.
- Un changement explicite d’espace retire les sélecteurs de fiche, pipeline, conversation et autres paramètres de l’ancien espace. Les écrans dépendant d’une liste ou d’un objet spécifique reviennent au dashboard via le routeur. Les composants de l’espace sont remontés pour fermer les anciennes fiches et réinitialiser leur état ; les brouillons gardent leur cloisonnement utilisateur/espace.
- Les liens de fiches, relations, listes, recherche, historiques de fusion, widgets et redirections de fusion portent leur workspace. Les liens de notifications, pipelines, modèles email et historiques de workflows le transmettent également.
- Une recherche filtrée vide propose de retirer les filtres. Un espace sans fiches conserve le message et l’action de création habituels.

Le paramètre `workspace` est un contexte d’interface, jamais une autorisation. Les contrôles serveur, RLS et contrats de sauvegarde restent applicables ; aucune migration n’est requise.

## Validation

Les tests couvrent la restauration après remontage, les changements d’URL, la navigation sans paramètre, le refus de fallback pour une URL inaccessible, les anciens identifiants retirés lors d’un changement d’espace et la construction des liens profonds. Les liens de relations et le retrait des filtres ont leurs régressions d’interface.

- Suite complète : 773 tests réussis sur 107 fichiers.
- TypeScript, build de production, format et structure : réussis. Lint : aucune erreur, 11 avertissements préexistants.
- Contrôles de secrets et des bundles : réussis (139 artefacts analysés).
- Neuf vérifications navigateur sur le build local : sélection après deux refresh, Précédent/Suivant, navigation interne sans paramètre, deux ouvertures complètes de liens directs, retrait d’un filtre sans résultat, refus d’un espace inaccessible sans requête de données de substitution, et changement depuis une liste spécifique vers le dashboard. Aucun événement `pageerror` dans ces scénarios.

Le navigateur local utilise une identité et des réponses API fictives pour isoler les parcours de navigation ; ces essais ne constituent pas une nouvelle qualification des permissions Supabase en production. La suite CI reconstruit l’état exact du commit publié.

## Exploitation

Aucun secret ni preuve contenant les données du compte d’audit n’est ajouté au dépôt. Après déploiement, vérifier le commit déployé puis la sélection d’un espace après refresh, un lien de fiche ouvert dans un nouvel onglet et l’état d’un espace inaccessible. Rollback : revert du commit, sans changement de schéma.
