# Architecture et limites

Le serveur Next expose des routes liées au workspace. La session Supabase authentifie l’utilisateur ; les routes contrôlent le rôle et la base applique RLS. Les clés publiques servent uniquement aux sessions publiques et ne remplacent pas les autorisations. La clé privilégiée reste dans un module serveur.

Le modèle comporte un ID de workspace sur chaque ressource. Les relations entre ressources utilisent des clés étrangères composites pour refuser les références interentreprises. Les requêtes sont paginées et les filtres d’accès sont indexés.
Les snapshots de simulation sont produits exclusivement côté serveur puis conservés. L’exécution Postgres est transactionnelle, liée à l’auteur, bornée et invalide les snapshots périmés ou dont les versions ont changé.

Les notes utilisent le versionnement optimiste, pas un éditeur collaboratif CRDT. Les notes privées restent réservées à leur auteur dans les lectures et dans les traces d’audit, même lors d’un changement de visibilité.
Les communications synchronisées sont réservées à l’utilisateur du compte. Aucun partage implicite via une fiche n’est appliqué.

OAuth utilise state, PKCE et cookies HttpOnly temporaires. Le contexte workspace/utilisateur est contrôlé au retour. Les jetons sont chiffrés AES-GCM avec une clé serveur conservée séparément.
Les appels externes ont un timeout. La déconnexion locale n’est pas une révocation fournisseur.

Le portail expose uniquement ses éléments et documents explicitement partagés. L’appartenance est rattachée par email confirmé en base, et non par une adresse déclarée dans une requête. Les URL signées de fichiers expirent après 60 secondes ; leur révocation n’invalide pas rétroactivement une URL déjà émise avant son expiration.

Le code dispose d’index et d’une séparation des modules ; aucune mesure de charge n’a été faite. Ne pas présenter la montée en charge comme démontrée. Les rapports parcourent les lignes par lots et les exports construisent un CSV en mémoire : déplacer ces traitements dans une queue pour les grands volumes.

Le catalogue Enterprise, les fonctions avancées et les clients natifs du prompt restent visibles dans feature-coverage.md. Aucune capacité restante n’est réputée livrée par son schéma seul.

Production : configurer HTTPS et APP_URL, les redirections Supabase et OAuth, SMTP transactionnel, sauvegardes et restauration, rétention, suivi des erreurs, limitation distribuée des requêtes, contrôle de charge et vérification des droits. Les checks n’ont pas été lancés à la demande du propriétaire.
