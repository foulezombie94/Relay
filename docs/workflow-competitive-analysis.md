# Analyse des workflows CRM et choix pour Relay

Analyse réalisée le 7 octobre 2026 à partir des guides officiels publiquement accessibles. Les CRM masquent une partie de leur expérience derrière une connexion ; la comparaison porte sur les fonctions décrites dans leur documentation, pas sur une inspection de comptes privés.

## Ce qui revient chez les CRM établis

| Produit | Idée utile observée | Adaptation Relay |
|---|---|---|
| Attio | Éditeur par blocs, déclencheurs sur les fiches et listes, conditions, branches, délais et publication de workflows. | Blocs lisibles et version publiée immuable, avec un aperçu avant lancement manuel. |
| HubSpot | Étapes de révision avant publication, règles d’inscription, branches, tests et historique des exécutions. | Tester les fiches et les conséquences avant confirmation ; version et trace conservées pour chaque exécution. |
| Pipedrive | Automatisations lisibles dans une liste, filtres, délais et inspection de l’activité. | Liste filtrable, pause/reprise et historique avec étapes et erreurs explicites. |
| monday.com | Création visuelle et partage de workflows entre équipes. | Modèles adaptables et éditeur canvas accessible ; Relay garde une grammaire limitée pour rester maintenable. |
| Zoho CRM | Règles déclenchées par événements avec conditions et actions. | Déclencheurs sur la création, la modification et l’étape des fiches, contrôlés par l’espace de travail. |

## Fonctionnement retenu

Un workflow Relay cible une entreprise, une personne ou une opportunité. Il peut démarrer manuellement ou à la création, à la modification ou au changement d’étape. Les conditions utilisent ET/OU et les attributs personnalisés. Les actions couvrent les tâches, engagements proposés, notes partagées, modifications de champs autorisés, listes, délais et branches Oui/Non.

L’éditeur garde les changements en brouillon. Tester ne modifie aucune donnée. La publication crée une version immuable pour les nouveaux événements ; modifier le workflow publié n’altère pas les exécutions déjà en cours. Le moteur conserve les délais dans la file durable du worker, reprend au curseur enregistré, contrôle le bail du worker et évalue les branches avec les valeurs présentes au moment de l’exécution.

Chaque exécution est traçable dans Relay. Les utilisateurs peuvent mettre un workflow en pause, consulter ses étapes, arrêter la suite ou reprendre un échec sans rejouer les actions validées. Les droits et l’appartenance à l’espace sont vérifiés au moment de l’exécution. Des plafonds limitent le nombre de workflows actifs, le volume en attente, les blocs et la durée de conservation de l’historique.

## Limites assumées

Relay n’envoie pas d’email depuis un workflow : les séquences restent responsables des envois. Le moteur ne prétend pas proposer une IA de génération ou des déclencheurs webhook/calendrier. Les étapes nécessitant une validation client restent proposées pour examen humain. Les actions d’aperçu manuel exigent une confirmation explicite.

## Sources officielles

- [Attio — aperçu des workflows](https://attio.com/help/reference/automations/workflows/overview-of-workflows)
- [Attio — bibliothèque de blocs](https://attio.com/help/reference/automations/workflows/workflows-block-library)
- [Attio — créer un workflow](https://attio.com/help/reference/automations/workflows/create-a-workflow)
- [HubSpot — créer un workflow](https://knowledge.hubspot.com/workflows/create-workflows)
- [HubSpot — tester un workflow](https://knowledge.hubspot.com/workflows/test-your-workflow)
- [Pipedrive — liste des automatisations](https://support.pipedrive.com/en/article/automations-list-view)
- [Pipedrive — délais](https://support.pipedrive.com/en/article/workflow-automations-delay-feature)
- [monday.com — workflows IA](https://support.monday.com/hc/en-us/articles/11065311570066-Get-started-with-AI-workflows)
- [Zoho CRM — règles de workflow](https://help.zoho.com/portal/en/kb/crm/automate-business-processes/workflows/articles/configuring-workflow-rules)
