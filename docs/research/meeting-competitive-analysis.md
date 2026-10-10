# Réunions : étude Attio et adaptation Zyliad

Recherche des documents officiels le 10 octobre 2026. L’implémentation est une adaptation au design et aux droits de Zyliad, pas une affirmation de parité intégrale avec le service Attio.

Attio distingue les rendez-vous synchronisés des appels enregistrés. Une fiche réunit calendrier, participants et contexte CRM. Sa bibliothèque permet de retrouver les appels, avec des vues personnelles. Les transcriptions servent de point d’entrée vers les analyses. Les modèles configurables structurent les questions selon le métier.

Sources principales :

- [Rendez-vous et accès depuis les fiches](https://attio.com/help/reference/email-calendar/view-emails-and-meetings)
- [Bibliothèque, transcription et gestion des appels](https://attio.com/help/reference/productivity-collaborating/call-intelligence/view-and-manage-call-recordings)
- [Modèles d’analyse](https://attio.com/help/reference/productivity-collaborating/call-intelligence/create-insight-templates-for-call-recordings)
- [Configuration de l’enregistrement](https://attio.com/help/reference/productivity-collaborating/call-intelligence/enable-call-recording)
- [Enregistrement, admission et consentement](https://attio.com/help/reference/productivity-collaborating/call-intelligence/recording-calls-with-attio)
- [Création manuelle de réunions](https://attio.com/help/reference/managing-your-data/records/add-record-activities)

## Choix pour Zyliad

| Parcours      | Adaptation livrée                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Bibliothèque  | Liste par date, recherche, tri, source, participant, fiche CRM, favoris personnels, pagination serveur            |
| Agenda        | Calendriers personnels et réunions manuelles ; sélection du jour dans le fuseau de l’espace                       |
| Réunion       | Horaires, état, lieu, participants, lien de visioconférence validé, contexte CRM                                  |
| Transcription | Import TXT/VTT/SRT, recherche, noms et horaires présents dans le fichier, copie et téléchargement                 |
| Intervenants  | Sélection de leurs passages ; durées calculées uniquement à partir d’horodatages fournis                          |
| Analyse       | Modèles métier, questions personnalisées, citations vérifiées, historique privé                                   |
| Modèles       | Brouillon, publication, modification, archivage, restauration, suppression confirmée                              |
| Suivi         | Création manuelle d’une tâche, liens vers plusieurs fiches et navigation depuis leur activité                     |
| Vie privée    | Les permissions existantes de Zyliad prévalent ; aucun partage de transcription privée par simple association CRM |

## Fonctions qui demandent un autre service

L’enregistreur d’Attio rejoint effectivement les visioconférences et fournit une vidéo. Zyliad n’a pas de service de capture configuré : aucun bouton ne prétend commencer un enregistrement. Les imports existants récupèrent seulement les transcriptions autorisées par Meet, Teams et Zoom.

La lecture vidéo, la recherche par chapitre, le mode image dans l’image et la focalisation audio demandent un fichier média réel et sa gestion sécurisée. Le partage public, l’envoi de résumés aux participants et les règles d’auto-enregistrement ne sont pas activés par cette modification. Le lien de partage livré reste interne et soumis à l’authentification.

## Contrats des calendriers

Les champs de conférence proviennent des ressources officielles : [Google Calendar Events](https://developers.google.com/workspace/calendar/api/v3/reference/events) (`hangoutLink`, entrée vidéo de `conferenceData`, `location`) et [Microsoft Graph Event](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0) (`onlineMeeting.joinUrl`, `location.displayName`). Aucun nouveau scope ni endpoint n’est introduit. Seuls les liens HTTPS Meet/Teams/Zoom sont proposés à l’utilisateur.
