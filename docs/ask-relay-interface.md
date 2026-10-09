# Interface Ask Relay

Référence observée : [démonstration de l’accueil CRM sur Attio](https://attio.com/), le 9 octobre 2026. La séquence examinée est une démonstration HTML animée : accueil avec saisie sous le titre, transition vers une conversation, indicateur Thinking puis réponse. Les captures de référence et de Relay restent dans les artefacts de travail, sans reprendre les logos, textes commerciaux ou médias d’Attio dans l’application.

Ask Relay affiche désormais une saisie compacte en haut de l’accueil, quatre raccourcis et un historique privé replié par défaut. Au premier message, la conversation s’agrandit et la saisie passe en bas. Le champ grandit avec le texte. Entrée envoie, Maj + Entrée ajoute une ligne et le bouton d’arrêt interrompt la réponse.

Thinking est un indicateur d’attente animé, accompagné de l’étape backend actuelle et d’un compteur de durée. Cliquer affiche ou replie les opérations réellement transmises par le serveur. Aucun raisonnement interne du fournisseur n’est affiché. Les animations respectent la préférence de réduction des mouvements.

Le menu Auto conserve la sélection des recherches par l’agent, affiche le modèle configuré et permet d’activer le budget de recherche étendu existant. Le contexte de fiche, les sources, les citations, les avertissements et les cartes de confirmation exactes sont conservés. Aucune autorisation, API, outbox, quota ou migration Supabase ne change.

Validation : 200 tests existants réussis ; TypeScript et lint ciblé validés. Les contrôles navigateur utilisent des fixtures synthétiques, sans connexion OpenAI ni écriture CRM : accueil, agrandissement, modèle configuré, budget étendu, indicateur et repli des étapes, carte de confirmation, lecture d’un email avec HTML échappé, refus limité à l’action concernée, nouvelle conversation, saisie multiligne, mobile sans débordement, arrêt, historique et réduction des animations.
