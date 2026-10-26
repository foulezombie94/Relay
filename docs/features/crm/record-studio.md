# Fiches personnalisables

Les répertoires Personnes et Entreprises proposent **Personnaliser les fiches** et un menu de modèles sous **Nouveau**. La personnalisation est réservée aux propriétaires et administrateurs ; la disposition enregistrée s’applique à toutes les fiches du type concerné. L’interface suit les principes des [dispositions Notion](https://www.notion.com/help/layouts), adaptés aux données du CRM.

## Interface

- Fiche centrale avec propriétés épinglées, groupes de propriétés, panneau de détails masquable et sections ordonnées. L’éditeur inclut un aperçu et applique explicitement la disposition à toutes les fiches.
- Relations configurables, liens réciproques et limites indépendantes à une ou plusieurs fiches. Les relations entre fiches du même type distinguent les deux sens. Les liens standard contact–entreprise restent séparés.
- Calculs sur une relation : nombre de fiches, somme des montants séparée par devise et première échéance des tâches ouvertes liées.
- Boutons associés à un workflow de l’objet. Ils utilisent les routes de simulation et de confirmation existantes ; l’aperçu et ses contrôles de version sont conservés.
- Modèles avec propriétés prédéfinies, contenu, checklist et récurrence quotidienne, hebdomadaire ou mensuelle. Le contenu et la checklist sont enregistrés dans une note de la nouvelle fiche.
- Sections liées pour les notes, tâches, engagements, activités, documents, contacts et opportunités. Les données restent filtrées par la fiche et les droits du lecteur.
- Éditeur de formulaires, aperçu, publication et copie du lien public `/forms/[key]`. Les questions sont connectées aux propriétés du CRM ; une condition peut utiliser une réponse précédente. Les formulaires sont initialement en brouillon.

## Données et exécution

`src/components/records/studio/` regroupe l’interface. `/api/[workspace]/record-studio` valide les configurations avec Zod et les permissions du workspace. La validation SQL applique également les schémas JSON et les contrôles de références, y compris pour les écritures directes. Les valeurs des modèles sont revalidées à chaque création, après fusion des valeurs prédéfinies et des valeurs saisies.

`record_studio_tick()` est réservé au service et lancé chaque minute par le job PostgreSQL `relay-record-studio-tick`. Il traite jusqu’à 200 échéances, les plus anciennes d’abord, avec `FOR UPDATE SKIP LOCKED`. Une occurrence crée une fiche complète ; la fiche, sa note et l’avancement de l’échéance sont atomiques. Le calendrier respecte le fuseau enregistré et saute les occurrences manquées plutôt que de créer tout un historique en retard.

Chaque modèle est isolé dans une sous-transaction. Un échec ne supprime pas les créations des autres modèles. Les reprises attendent 1, 2, 4 puis 8 minutes ; au cinquième échec, le modèle est en pause. Le panneau des modèles expose l’état et le code SQLSTATE, sans contenu CRM dans les erreurs persistées. Enregistrer une configuration corrigée réactive son échéancier.

Les tables exposées ont RLS et des grants explicites. Les reçus de formulaires et les écritures d’échéancier restent réservés au service. Un formulaire publié ne renvoie ni les identifiants internes du workspace ni les fiches créées. Les soumissions ont un reçu idempotent, un champ anti-robot et des plafonds par formulaire (10/minute et 500/jour).

La migration de compatibilité conserve les définitions de relations pendant les fusions et leur annulation, sans modifier les choix, versions ni points de restauration existants. Une fusion qui violerait une limite de relation échoue entièrement plutôt que de perdre des liens.

## Portée et livraison

La liste de configurations est limitée à 200 par objet et l’affichage d’une fiche à 200 liens ; les calculs incluent tous les liens autorisés. L’interface de configuration charge jusqu’à 100 propriétés, membres et workflows. L’interface personnalisable concerne Personnes et Entreprises ; les autres objets peuvent être des cibles de relation et gardent leur présentation existante.

Migrations : `20261026171620_record_studio.sql` et `20261026175738_record_studio_merge_compatibility.sql`. Appliquées au projet APP TQT le 26 octobre 2026 ; les versions de l’historique distant sont alignées sur les fichiers créés par la CLI. Les fichiers appliqués ne doivent pas être modifiés.

Vérifications de livraison : TypeScript, ESLint, contrôle de structure et build Next.js réussis. Aucune suite de tests ni création de données de vérification en production, à la demande de l’utilisateur. La fidélité visuelle exacte à Notion n’a pas été vérifiée à l’écran.
