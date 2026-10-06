# Doublons, fusion et restauration

La V1 détecte des signaux simples (email, domaine ou nom normalisé) au sein du même objet. Aucun modèle IA ne décide de l’identité des personnes.

## Parcours

- Comparer : deux fiches côte à côte, choix de la fiche conservée et des valeurs. Un membre peut modifier une fiche ; après enregistrement, la comparaison est rechargée depuis le serveur. L’ancienne confirmation ne permet plus de fusionner.
- Fusionner : administrateur ou propriétaire uniquement, aperçu des valeurs et confirmation explicite. Montant et devise sont sélectionnés ensemble.
- Garder séparés : décision persistante sur cette paire, sans bloquer les autres paires du groupe.
- Ignorer : reporter cette paire de sept jours. Réexaminer supprime la décision.
- Annuler la fusion : aperçu de restauration puis confirmation dans le journal. Disponible pour les nouvelles fusions enregistrées avec une sauvegarde complète.

## Garanties en base

Chaque fusion ou restauration est une transaction Postgres. Les RPC contrôlent auth.uid(), le workspace et le rôle. Les fiches sont verrouillées dans un ordre stable ; les versions client doivent correspondre à celles en base. Un conflit ne laisse pas de fusion partielle. Les modifications des enfants acquièrent également un verrou sur les parents.

Le journal public conserve les fiches, choix, auteur, date et état d’annulation ; des triggers alimentent audit_events. Les notes privées et données de listes privées restent dans une sauvegarde du schéma relay_private, inaccessible aux utilisateurs ordinaires et jamais renvoyée au navigateur. La restauration préserve auteurs et confidentialité.

La restauration compare tout l’état courant des deux fiches et de leur contexte au résultat de la fusion. Un changement ultérieur bloque l’annulation pour préserver ce travail. Aucune restauration forcée. Les versions augmentent lors de l’annulation ; celle-ci reste dans le journal. Le rejeu d’une annulation est idempotent.

Les anciennes fusions sans sauvegarde complète sont consultables mais non annulables. Les collisions de dossiers de réalisation ou d’inscriptions à une même séquence doivent être résolues avant fusion.

## APIs

- GET /api/:workspace/duplicates : paires proposées et décisions prises en compte ; limites annoncées.
- GET /api/:workspace/duplicates/compare?a=…&b=… : fiches, versions, critères actualisés et décision.
- POST /api/:workspace/duplicates : versions source/cible et choix des champs.
- GET/POST /api/:workspace/duplicates/decisions : liste paginée ; separate, deferred ou reopen.
- GET /api/:workspace/merges?id=… : disponibilité de restauration, sans sauvegarde privée.
- POST /api/:workspace/merges : identifiant de fusion et versions source/cible pour annuler.

## Validation effectuée

Six tests unitaires vérifient les paires, leur déduplication, la séparation ciblée, l’expiration du report, le recalcul après modification et les limites. Dix contrôles SQL passent sur des fixtures avec ROLLBACK : échec en milieu de fusion atomique, contrôle des versions, journal, transfert du contexte, restauration des collisions/relations/alias/portail, rejeu, décisions, rôle viewer, refus après édition et confidentialité des sauvegardes. La fusion et l’annulation réussies sont également exécutées sous le rôle authenticated avec un véritable contexte Auth.

Compilation de production et TypeScript passent. Ces contrôles ne valident pas toutes les intégrations ni tous les écrans du CRM.