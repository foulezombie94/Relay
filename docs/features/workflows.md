# Canvas et exécutions des workflows Zyliad

Mise à jour : 12 octobre 2026.

## Interface

La liste présente les workflows, leurs fiches cibles, leur état et les actions existantes : éditer, tester, dupliquer, pause/reprise et historique. Les modèles et les connexions restent accessibles.

L’éditeur dispose d’un canvas horizontal, de blocs à en-tête coloré, de ports et de flèches, de branches Oui/Non et d’un panneau droit pour les paramètres. La bibliothèque regroupe et recherche les 14 types d’actions réellement supportés. Le bouton à droite d’un bloc insère l’action immédiatement après celui-ci, y compris dans sa branche.

Navigation : molette/trackpad pour déplacer, Ctrl/⌘ + molette pour zoomer, H pour le mode déplacement, V pour la sélection, B pour ajouter et Ctrl/⌘ + 0 pour 100 %. Les boutons permettent aussi zoom, cadrage et rangement automatique. Déplacer un bloc change sa position visuelle pour la session ; son ordre d’exécution se modifie avec les commandes Monter/Descendre du panneau. Les positions ne sont pas des paramètres métier et ne sont pas stockées sur le serveur.

Les modifications restent des brouillons. Annuler/rétablir, enregistrement, validation Zod et revue explicite avant publication sont conservés. Tester enregistre le brouillon puis ouvre l’aperçu existant ; le lancement réel exige toujours sa confirmation.

## Vue des exécutions

La vue utilise la définition enregistrée pour la version exécutée. Le panneau affiche les 25 dernières exécutions du workflow avec un accès à l’historique paginé complet, ou le détail du bloc sélectionné. La configuration affichée est celle de la version exécutée ; elle ne prétend pas contenir les valeurs runtime des entrées quand elles ne sont pas disponibles.

Les états et les sorties proviennent des lectures authentifiées existantes. Les flèches vertes indiquent le parcours confirmé, les branches non parcourues restent atténuées, les actions en cours sont animées et les échecs sont distingués. Une branche ne devient verte que si sa décision enregistrée le permet. Une annulation ne marque pas la fin comme réussie.

« Revoir le parcours » anime uniquement les blocs réussis enregistrés, dans l’ordre des dates de fin. Cette relecture ne déclenche aucune requête ni action externe. Elle s’arrête à la fermeture et respecte la préférence de réduction des animations. Retry, arrêt et résolution d’un envoi incertain conservent leurs permissions, confirmations et comportements serveur.

## Références et périmètre

Références officielles consultées le 12 octobre 2026 : [éditeur Attio](https://attio.com/help/reference/automations/workflows/create-a-workflow), [vue des runs Attio](https://attio.com/help/reference/automations/workflows/troubleshooting-workflows) et captures associées. Le canvas, le panneau de configuration et le chemin d’exécution reprennent cette organisation dans les composants et les couleurs Zyliad.

Ce changement concerne l’interface ; aucune migration ou modification de RLS, de worker, de lease ou d’idempotence n’est nécessaire. Il n’ajoute pas les fonctions Attio absentes du moteur Zyliad, comme les graphes arbitraires à multiples déclencheurs ou la génération de workflow par un nouveau service IA.

## Vérification

Les tests du modèle contrôlent les clés exactes du worker, les jonctions, les branches vides, les cibles d’insertion, le parcours confirmé et la duplication des IDs. Les tests des composants vérifient navigation, insertion, annuler/rétablir, sauvegarde, revue avant publication, passage vers le test existant, relecture sans réseau, réduction des animations et échappement des sorties.

Les vérifications de navigateur utilisent des données fictives et des réponses API locales. Elles ne créent ni exécution ni donnée en production. Les contrôles du dépôt incluent les tests existants, lint, typecheck, structure, build, secrets et Prettier avant publication.

## Correction de l’enregistrement avec idempotence

Le 12 octobre, un 403 réel a révélé une incompatibilité préexistante : le POST fournit `id` avec `Idempotency-Key`, tandis que les droits par colonne de `workflows` permettaient uniquement workspace, nom, définition et description. La migration `20261012203648_workflow_idempotent_creation.sql` autorise seulement `INSERT(id)` pour `authenticated`. Elle conserve RLS, l’immuabilité de l’identité, le propriétaire calculé par le serveur et la publication explicite.

Le test SQL `supabase/tests/workflow-creation.sql`, exécuté par `test:agent:db`, reproduit le refus 42501 avant migration puis vérifie création propriétaire/membre, déduplication, mise à jour du brouillon, refus d’activation directe, d’usurpation, de modification de l’identifiant, des autres tenants et des lecteurs. Les fixtures sont locales et entièrement annulées. Les tests UI précédents utilisaient des réponses de sauvegarde simulées et ne couvraient pas ce droit de colonne.

## Canvas et bibliothèque — 13 octobre 2026

La bibliothèque propose les 14 types d’actions du moteur et six préréglages : attribution de fiche, changement d’étape, probabilité, relance à trois jours, attente de réponse email et attente d’une date. Les catégories et la recherche insensible aux accents permettent de les retrouver. Les préréglages sont des configurations des actions existantes, pas six nouveaux types d’exécution. Une attribution exige de choisir le membre ; une attente de date exige de renseigner la date. Les attentes ont une limite de sept jours avec arrêt à expiration, modifiable dans l’inspecteur.

Les cartes affichent les paramètres utiles et le nom de sortie. Le plan cliquable et la mini-carte recentrent un bloc à 100 %, y compris dans l’historique en lecture seule. Le zoom d’ensemble accepte les longs workflows ; les branches conservent leurs clés d’exécution et les déplacements restent attachés aux identifiants des actions. La mini-carte est masquée sur mobile, où le plan reste disponible. La lecture animée utilise toujours les résultats enregistrés, sans relancer d’action.

Références de conception consultées : [navigation et construction Attio](https://attio.com/help/reference/automations/workflows/create-a-workflow), [bibliothèque officielle Attio](https://attio.com/help/reference/automations/workflows/workflows-block-library). Cette livraison adapte ces principes au moteur Zyliad ; elle n’ajoute pas de boucles, de SQL arbitraire ou de déclencheurs multiples. Aucun changement de schéma ou de droits n’est requis, donc aucune migration supplémentaire.

Validation : tests des préréglages contre le schéma partagé, insertion/enregistrement depuis la bibliothèque, navigation clavier et plan, zoom des longs workflows, régressions de déplacement et lecture animée sans appel réseau.

Le canvas utilise désormais des cartes de 304 × 176 px : icône par catégorie, numérotation, titre sur deux lignes au maximum, résumé des paramètres et pied de carte réservé au type ou au statut de l’exécution. Les connexions Oui/Non ont des badges distincts, les contrôles gardent un focus clavier visible et le quadrillage suit le déplacement/zoom. Les couleurs s’appuient sur les variables du thème ; les animations restent désactivées avec `prefers-reduced-motion`. Les recherches [Attio](https://attio.com/help/reference/automations/workflows/create-a-workflow) et [Linear](https://linear.app/now/behind-the-latest-design-refresh) ont guidé la hiérarchie visuelle et l’allègement des séparateurs. Cette refonte est uniquement visuelle et ne change pas les permissions, les étapes sauvegardées ou l’exécution serveur.
