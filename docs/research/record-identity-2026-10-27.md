# Fiches CRM : une identité centrée sur la relation

Évolution du 27 octobre 2026. Cette direction remplace la transposition directe d’Attio dans l’interface ; la [référence précédente](attio-record-page-reference.md) reste un document historique.

## Références consultées

- [Folk, Contact profile](https://help.folk.app/en/articles/5007276-contact-profile) : proximité entre informations, interlocuteurs et interactions.
- [Linear, Customer Requests on projects](https://linear.app/changelog/2025-04-30-customer-requests-on-projects) : contexte du client et hiérarchie compacte.
- [Capsule, Contact management](https://capsulecrm.com/features/contact-management-software/) : continuité de l’historique de la relation.

Ces références servent à étudier l’organisation du travail. Leurs illustrations, marques et composants ne sont pas utilisés dans la nouvelle interface.

## Direction retenue

L’identité de l’entreprise occupe un en-tête horizontal, avec son statut et son responsable. Le contenu principal commence par « Le prochain pas » : première tâche ou premier engagement non terminé, selon l’échéance. Un rendez-vous futur apparaît à côté. Sans données, la fiche invite à organiser le suivi ; elle n’invente ni revenu, ni financement, ni activité.

Les repères contacts/opportunités/notes ouvrent les sections correspondantes. Un journal chronologique filtrable distingue emails, notes et rendez-vous. Les cartes interlocuteurs, opportunités et dernière note donnent le contexte. Les propriétés configurées, relations et listes restent accessibles dans le panneau de droite. Les rendez-vous restent visibles sur mobile ; les panneaux s’empilent et les onglets défilent horizontalement.

La couleur d’accent vient du thème existant. La hiérarchie repose sur l’espace, la typographie, un fond légèrement teinté pour le suivi et un ton chaud pour la note. Les autres types de fiches conservent leurs vues métier et partagent le nouvel en-tête.

## Contrats préservés

Les données restent celles du contexte autorisé. Les compteurs reflètent le contexte chargé ; un contexte tronqué est explicitement signalé. Les boutons ouvrent les outils existants et n’envoient aucun message, ne créent aucune tâche et n’écrivent aucune note automatiquement. Les permissions, confirmations, listes et API ne changent pas.

## Validation

Les tests ciblés vérifient l’absence de données inventées, la priorité d’un engagement en retard sur une tâche terminée, la navigation vers la bonne ressource et le filtrage des emails. Les captures de conception utilisent uniquement des fixtures fictives dans un navigateur local ; elles ne représentent pas des clients réels.

Validation exécutée : 779 tests réussis, TypeScript et build de production avec configuration locale isolée réussis, structure vérifiée et lint sans erreur (11 avertissements préexistants). Six parcours navigateur passent sans exception JavaScript : affichage rempli, filtre email, navigation tâche, ouverture/fermeture du choix de liste au clavier, mobile sans débordement horizontal et état vide. Captures examinées en 1600, 1440 et 390 pixels, ainsi qu’en thème sombre.

## Panneau latéral entreprise

La fiche entreprise comporte désormais un panneau de coordonnées inspiré du regroupement montré dans la capture Capsule fournie : logo, nom, étiquettes, réseaux sociaux, téléphone, email, site, adresse et effectif. Il utilise uniquement les valeurs présentes dans la fiche ; les attributs personnalisés doivent être actifs et inclus dans les groupes de propriétés configurés. Les coordonnées absentes ne sont pas inventées. Les propriétés complètes restent accessibles dans un volet dépliable.

Les réseaux sociaux n’acceptent que des URL HTTP(S) des domaines attendus. Les liens externes isolent le nouvel onglet ; téléphone et email sont validés avant de devenir cliquables. Le mode lecture seule retire les commandes de modification. Aucune migration, aucun enrichissement automatique et aucun envoi ne sont ajoutés.

### Comparaison directe avec la page Capsule

Inspection via Chromium et Chrome DevTools Protocol de la [page publique Capsule](https://capsulecrm.com/fr/features/contact-management-software/). À 1440 px de viewport, la fiche GreenTech est un élément `img` de 1260 × 548,7 px, sans marge ni padding propre, dans un `picture`. Son contenu ne contient aucun bouton DOM : les contrôles du produit sont dessinés dans l’image. Les valeurs CSS internes ne sont donc pas accessibles depuis cette page marketing.

Les proportions visuelles ont été normalisées à partir de l’image haute résolution : panneau d’environ 260 px, marge intérieure de 20 px, logo de 48 px, titre de 15 px, icônes sociales de 18 px. Les coordonnées sont alignées sans icône en début de ligne, avec liens violets, libellés courts et rangée d’actions sous l’adresse. Le panneau apparaît à gauche sur desktop. Les deux premiers réseaux sociaux restent visibles ; les liens supplémentaires se déplient au clic. Les commandes ouvrent la carte, l’itinéraire, les documents et les propriétés existantes. Ces mesures reconstituent les proportions de l’illustration ; elles ne prétendent pas être les styles internes de l’application Capsule.
