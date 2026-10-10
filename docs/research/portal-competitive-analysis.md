# Portails clients : références et décisions

Recherche du 10 octobre 2026, sur les sources officielles suivantes :

- [Attio — Configure record pages](https://attio.com/help/reference/managing-your-data/records/configure-record-pages) : informations essentielles en tête, rubriques et onglets, sections pertinentes pour la fiche, actions explicites.
- [Assembly — Consulting client portal](https://assembly.com/solutions/consulting-client-portal) : espace client dédié rassemblant messages, fichiers et suivi de projet.
- [HubSpot — Set up a customer portal](https://knowledge.hubspot.com/inbox/set-up-a-support-portal) : accès authentifié et ressources associées au client, permissions explicites.
- [Supabase — Database Functions](https://supabase.com/docs/guides/database/functions) : fonctions invoker, privilèges d’exécution et contrôle du contexte SQL.

Zyliad reprend la sobriété des pages Attio : titre clair, petites métadonnées, séparateurs fins, états lisibles, cartes de synthèse et navigation par rubriques. Les portails Assembly et HubSpot apportent les références fonctionnelles de collaboration et d’accès restreint. Cette recherche ne prétend pas qu’Attio propose exactement le même produit de portail client.

## Application

`/portal` devient un répertoire des espaces accessibles : recherche serveur, filtres actifs/en pause, vue cartes/liste, progression et activité réelles. Un membre CRM voit aussi les portails de son équipe déjà accessibles sous RLS ; un client externe voit seulement ses invitations valides. Aucun projet de démonstration n’est injecté dans une page vide.

`/portal/[id]` propose Vue d’ensemble, Actualités, Étapes, Documents, Décisions et Échanges. La vue d’ensemble présente les étapes et échéances effectivement partagées. Les décisions sont consultables : aucune approbation client fictive n’est annoncée.

`/app/portals` conserve la gestion dans le CRM : création liée à une fiche, contenu explicitement partagé, accès administrés, expiration/révocation, discussions et désactivation. L’ajout d’un accès autorise une adresse et n’envoie pas automatiquement un email.

La présentation utilise les composants et couleurs Zyliad, sans copier des logos, contenus propriétaires ou captures de concurrents. Les fonctions non présentes dans Zyliad, telles que facturation intégrée au portail, signature ou messagerie email automatique, ne sont pas présentées comme disponibles.
