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
