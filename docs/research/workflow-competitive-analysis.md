# Analyse des workflows CRM et choix pour Relay

Analyse réalisée le 7 octobre 2026 à partir des guides officiels publiquement accessibles. Les CRM masquent une partie de leur expérience derrière une connexion ; la comparaison porte sur les fonctions décrites dans leur documentation, pas sur une inspection de comptes privés.

## Ce qui revient chez les CRM établis

| Produit    | Idée utile observée                                                                                                 | Adaptation Relay                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Attio      | Éditeur par blocs, déclencheurs sur les fiches et listes, conditions, branches, délais et publication de workflows. | Blocs lisibles et version publiée immuable, avec un aperçu avant lancement manuel.                            |
| HubSpot    | Étapes de révision avant publication, règles d’inscription, branches, tests et historique des exécutions.           | Tester les fiches et les conséquences avant confirmation ; version et trace conservées pour chaque exécution. |
| Pipedrive  | Automatisations lisibles dans une liste, filtres, délais et inspection de l’activité.                               | Liste filtrable, pause/reprise et historique avec étapes et erreurs explicites.                               |
| monday.com | Création visuelle et partage de workflows entre équipes.                                                            | Modèles adaptables et éditeur canvas accessible ; Relay garde une grammaire limitée pour rester maintenable.  |
| Zoho CRM   | Règles déclenchées par événements avec conditions et actions.                                                       | Déclencheurs sur la création, la modification et l’étape des fiches, contrôlés par l’espace de travail.       |

## Fonctionnement retenu

Un workflow Relay cible une entreprise, une personne ou une opportunité. Il peut démarrer manuellement ou à la création, à la modification ou au changement d’étape. Les conditions utilisent ET/OU et les attributs personnalisés. Les actions couvrent les tâches, engagements proposés, notes partagées, modifications de champs autorisés, listes, délais et branches Oui/Non.

L’éditeur garde les changements en brouillon. Tester ne modifie aucune donnée. La publication crée une version immuable pour les nouveaux événements ; modifier le workflow publié n’altère pas les exécutions déjà en cours. Le moteur conserve les délais dans la file durable du worker, reprend au curseur enregistré, contrôle le bail du worker et évalue les branches avec les valeurs présentes au moment de l’exécution.

Chaque exécution est traçable dans Relay. Les utilisateurs peuvent mettre un workflow en pause, consulter ses étapes, arrêter la suite ou reprendre un échec sans rejouer les actions validées. Les droits et l’appartenance à l’espace sont vérifiés au moment de l’exécution. Des plafonds limitent le nombre de workflows actifs, le volume en attente, les blocs et la durée de conservation de l’historique.

## Limites assumées

Relay utilise désormais les connexions réelles pour envoyer un email Gmail/Outlook, créer un événement Google/Outlook Calendar, publier via un webhook entrant Slack et appeler une API HTTPS. Le bloc IA analyse un texte et produit une sortie structurée exploitable par les branches. Les engagements restent proposés pour examen humain. La publication ou la confirmation d’un lancement autorise les actions externes configurées.

## Extension : les huit points mis en œuvre

| Besoin           | Comportement Relay                                                                                                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions externes | OAuth individuel pour les emails/calendriers ; destinations Slack/API chiffrées et gérées par les administrateurs. Calendrier : création sans invités automatiques.                                                                                                                   |
| Outbox           | Une entrée unique par exécution et bloc. Le marqueur d’envoi est persisté avant l’appel. Un crash ou une réponse incertaine arrête l’exécution, avec résolution explicite et auditée. Les fournisseurs email ne garantissent pas un « exactement une fois » universel.                |
| Déclencheurs     | Fiche créée/modifiée/étape, email reçu/répondu après publication, tâche terminée, réunion marquée terminée, engagement en retard, date atteinte, formulaire/webhook signé, heure quotidienne ou jours hebdomadaires avec fuseau. Les emails sont détectés lors de la synchronisation. |
| Variables        | Informations de la fiche et de ses relations, événement, sorties nommées des blocs précédents. Une variable indisponible produit une erreur explicite.                                                                                                                                |
| Attente          | Date/heure, condition métier, réponse email du contact après l’entrée dans le bloc ; délai maximal avec arrêt ou poursuite explicite. Vérification périodique sans immobiliser un worker.                                                                                             |
| IA               | Résumé, intention, prochaine action et confiance. Texte source borné et traité comme donnée non fiable. Aucun pouvoir d’envoi implicite donné au modèle.                                                                                                                              |
| Observabilité    | Chaque bloc est persisté séparément. Canvas de la version exécutée, branches non parcourues, états réels, sortie du bloc, date de reprise, erreurs et boutons de reprise/résolution. Actualisation toutes les deux secondes tant que le détail est ouvert et actif.                   |
| Cœur du CRM      | Actions liées à la fiche, tâches, engagements, notes, listes, opportunités, messages/calendriers et notifications ouvrant l’exécution dans À traiter.                                                                                                                                 |

L’idée retenue d’Attio est la lecture des blocs et de leurs résultats. Les délais/conditions de HubSpot et Pipedrive inspirent la séparation entre attente, reprise et échec. Relay ajoute une résolution explicite des envois incertains et une isolation des événements email privés. Cela ne signifie pas une équivalence avec tous les blocs ou toutes les intégrations de ces produits.

Les appels sont bornés par jour UTC et par espace : 200 emails, 100 créations calendrier, 100 analyses IA, 500 appels Slack et 500 webhooks. Chaque tentative est comptée, y compris après une reprise. Les destinations HTTPS ne peuvent pas accéder aux réseaux privés ; l’adresse DNS validée est conservée pour la connexion, et aucune redirection n’est suivie. Les secrets et l’outbox restent hors des tables exposées au navigateur.

### Sources complémentaires consultées

- [Attio — gestion et historique des workflows](https://attio.com/help/reference/automations/workflows/manage-workflows)
- [HubSpot — types de délais](https://knowledge.hubspot.com/workflows/use-delays)
- [Pipedrive — délais et attente de conditions](https://intercom.help/pipedrive/en/articles/12096061-how-do-delay-and-wait-for-condition-steps-work-in-pipedrive-automations-and-how-can-they-be-effectively-used)
- [Google — création d’événements](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Microsoft — création d’événements](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)
- [Slack — webhooks entrants](https://api.slack.com/messaging/webhooks)

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
