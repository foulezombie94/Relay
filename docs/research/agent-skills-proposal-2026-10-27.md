# Skills Zyliad — analyse Notion et proposition complète

Date : 27 octobre 2026. Dépôt étudié : Relay, commit `cb81fb1`.

**Statut : proposition de produit et d’architecture, pas une fonctionnalité déjà implémentée.** Aucun changement de schéma, de permissions ou de moteur de production n’est appliqué par ce document.

## 1. Proposition retenue

Ajouter une bibliothèque de méthodes métier réutilisables au moteur Ask Zyliad existant. Une méthode, appelée skill, contient un objectif, des entrées, des instructions, des ressources, les outils nécessaires, un format de résultat et des critères de réussite. Elle peut être appelée dans le chat, depuis une fiche ou par un workflow explicitement configuré.

Le système comporte quatre surfaces cohérentes :

1. **Une bibliothèque** pour trouver, activer, organiser, partager et maintenir les skills.
2. **Un créateur dans le chat** pour transformer un besoin, un exemple ou une méthode réussie en brouillon structuré.
3. **Une intégration à la discussion** avec menu `/`, choix depuis `+`, paramètres, progression et résultats cités.
4. **Un moteur versionné** qui utilise les outils, droits, budgets, cartes d’action et jobs déjà présents dans Relay.

Le premier objectif est de rendre reproductibles les méthodes de travail du CRM. Il ne faut pas créer un second agent indépendant ni une seconde logique d’envoi de messages.

## 2. Ce qui a été examiné dans Notion

L’interface authentifiée ouverte dans Chrome a été parcourue : accueil IA, menu `/`, entrée Skills du menu `+`, ajout d’une skill, fiche de skill avec discussion de création, réglages de la fiche, base de skills et onglet Skills de la bibliothèque.

| Observation directe | Conséquence pour Zyliad |
|---|---|
| Le chat propose une recherche de skills et l’accès à leur gestion. | Même catalogue depuis le chat et depuis la bibliothèque. |
| Le créateur associe une page de skill à une discussion dédiée. | Générer un brouillon structuré avec aperçu éditable à côté du chat. |
| La fiche porte un bandeau permettant de l’identifier comme skill et de l’essayer. | Distinguer nettement une méthode réutilisable d’une note ordinaire. |
| La base contient nom, description, fichiers, étiquettes et auteur. | Séparer les instructions des métadonnées utilisées pour la recherche. |
| La bibliothèque distingue activation personnelle et découverte. | Séparer accès partagé et préférence personnelle d’utilisation. |
| La bibliothèque affiche les utilisations et une activation personnelle. | Permettre le suivi de l’usage sans rendre obligatoire l’activation pour toute l’équipe. |
| Une description absente empêche l’utilisation automatique dans le parcours observé. | Exiger une description exploitable avant de proposer le routage automatique. |

La documentation officielle confirme le rôle des descriptions, la distinction entre accès et activation, les ressources jointes et la portabilité par fichier `SKILL.md`. Elle distingue également les skills, les instructions permanentes et les agents déclenchés en arrière-plan. [Documentation Notion](https://www.notion.com/help/create-and-manage-skills).

**Effet du parcours d’inspection :** l’ouverture du créateur via le bouton d’ajout a généré un brouillon vide « Créer un(e) skill » dans Notion. Ce brouillon a été laissé en place; aucune instruction n’y a été rédigée ni aucun message envoyé manuellement. Ce comportement de création immédiate est précisément un point à améliorer dans Zyliad avec un brouillon clairement identifié et une action explicite de publication.

## 3. Preuves REA et limites de l’analyse

Chrome n’exposait pas de port CDP direct utilisable par REA. Les observations de l’interface ont donc été réalisées par computer use. Les bundles JavaScript publics ont été téléchargés sans cookies ni identifiants depuis les URL observées dans la page, puis analysés statiquement avec REA. Les noms et hashes des chunks spécialisés ont été résolus à partir des tables littérales du runtime Webpack; leur code n’a pas été exécuté par REA.

Modules ciblés : `newSkillCreation`, `skillBuilderChatActions`, `librarySkills`, `SkillPageActions`, `createSkillsDatabase` et `new-skill-menu-button`.

| Référence | Portée et résultat |
|---|---|
| `ev_de5c4e8ef1f6f04f753498c1f81e4e5bf5c38ed9ccfdd253979c2b3b9ffdef46` | Premier examen de deux bundles de démarrage. Couverture partielle; aucune conclusion d’absence tirée des traces sans correspondance. |
| `ev_7e4bc3aa1d96b347239f564ca3df3edb9f9f51d86b922bac9bac379da6c81592` | Analyse des six chunks spécialisés : 121 648 octets de texte, six fichiers JavaScript parsés, 31 382 nœuds AST visités et zéro échec de parsing. Graphe applicatif complet pour cet ensemble sélectionné. |
| `ev_6c134861aad029923b67b01d12f36abb3d70214b8b383d834a86def44fe7db9b` | Trace statique sortante du module de création par chat : 32 correspondances de sélection et 146 nœuds dans le graphe retourné. Complète à l’intérieur du graphe source retenu. |

Les références statiques à `openSkillPageWithBuilderChat`, aux créations autonome/en base et aux événements de cycle de vie corroborent l’organisation du client observée. Elles ne démontrent pas l’exécution de chaque branche ni les contrôles du serveur Notion. Le graphe sémantique conserve 7 334 relations ou résolutions inconnues; une analyse de chunks minifiés ne constitue pas une reconstitution du backend.

Les captures, manifestes avec SHA-256 et le bundle d’Evidence REA sont conservés localement dans `work/notion-skills-2026-10-27/`. Les octets analysés et la couverture sont identifiés par leurs hashes. Les mécanismes internes de classement, les modèles utilisés, le stockage serveur et les règles de publication propres à Notion restent inconnus.

## 4. Ce qui existe déjà dans Relay

| Élément actuel | Réutilisation prévue |
|---|---|
| `src/lib/agent/discovery.ts` | Découverte progressive : sept outils initiaux et chargements supplémentaires de six outils maximum par appel. |
| `src/lib/agent/contracts.ts` | Schémas validés des recherches et des actions CRM. |
| `src/lib/agent/runner.ts` | Boucle de décision, budgets, réponses structurées, étapes, citations et revalidation des sources. |
| `src/lib/agent/tools.ts` | Contrôles de rôle, validation des propositions, application des actions et délégation autonome. |
| `src/lib/domain/assistant.ts` | Messages, événements, étapes, sources et état de conversation. |
| `src/components/assistant/composer-view.tsx` | Barre de message, menus, fiche de contexte et choix du mode d’autorisation. |
| `src/components/pages/assistant.tsx` | Historique privé, envoi, arrêt et restauration d’une conversation. |
| `src/lib/jobs/runner.ts` et handlers | Leases, reprise, backoff et exécution durable. |
| `src/lib/jobs/handlers/agent.ts` | Effets externes, statuts d’envoi, contrôles du compte et statuts incertains. |
| `src/lib/agent/evaluation.ts` | Infrastructure d’évaluation à compléter pour les versions de skills. |

Recherche bornée dans `src` et `docs/features` : aucun registre générique de skills versionnés ni créateur de skills n’a été trouvé. Les suggestions actuelles sont des prompts fixes.

La route assistant impose actuellement cinq ou quinze appels d’outils selon le budget choisi, un signal d’expiration à 70 secondes et une durée maximale de route de 90 secondes. Un skill long ne doit pas contourner ces limites : il doit devenir un job durable.

## 5. Distinguer les quatre notions

| Notion | Exemple | Responsabilité |
|---|---|---|
| Outil | Rechercher un contact, créer une tâche. | Primitive serveur validée. |
| Skill | Préparer un rendez-vous client selon une méthode commune. | Compose des outils et des instructions pour produire un résultat cohérent. |
| Workflow | À chaque nouvelle opportunité, créer un suivi. | Déclenchement persistant, conditions et enchaînement déterministe. |
| Intégration | Gmail ou calendrier connecté. | Moyen d’accès à un service, dans les droits du compte connecté. |

Les instructions personnelles permanentes restent une cinquième couche distincte : langue, style et préférences de restitution. Un skill ne doit pas répéter toutes ces préférences ni les remplacer sans raison explicite.

## 6. Bibliothèque de skills

Entrée « Skills » depuis Ask Zyliad et accès direct depuis le menu `+`. Trois onglets principaux : **Mes skills**, **Équipe**, **Découvrir**. Les brouillons, favoris, catégories et archives sont des filtres, afin d’éviter une multiplication d’onglets.

La vue liste montre nom et icône, description, propriétaire, catégorie, version publiée, effets possibles, activation personnelle, utilisation automatique et dernière utilisation. Les actions d’une ligne permettent d’ouvrir, essayer, dupliquer, épingler, désactiver pour soi, consulter l’historique ou archiver selon les droits.

La recherche porte sur nom, description, tags et exemples de demande. Les résultats affichent les intégrations manquantes et les raisons d’indisponibilité. Une skill inaccessible n’est pas exposée par son titre ou sa description.

Pour une nouvelle équipe, commencer avec une bibliothèque partagée et des brouillons privés. Plusieurs collections deviennent utiles lorsque les droits, les propriétaires ou les processus diffèrent réellement.

## 7. Intégration dans la barre de message

- `/` ouvre les skills accessibles; la saisie filtre les résultats, les flèches déplacent le focus, Entrée sélectionne et Échap ferme.
- `+` propose « Utiliser un skill », « Créer un skill » et l’accès à la bibliothèque.
- Une sélection ajoute une puce au-dessus du texte : nom, version, bouton de paramètres et retrait.
- Choisir un skill ne lance aucun outil. L’utilisateur complète son message ou les paramètres avant l’envoi.
- La fiche CRM ouverte préremplit les références utiles, tout en laissant le contexte visible et modifiable.
- Les paramètres manquants sont demandés dans un petit formulaire intégré au chat, sans redirection vers une page de configuration.
- Une seule fenêtre de menu reste ouverte à la fois.

Le menu de sélection affiche les récents et favoris avant les autres résultats. La commande « Créer à partir de cette discussion » apparaît dans les actions d’un échange réussi. Dans une conversation existante, un changement de skill vaut pour le prochain message et ne réécrit pas les anciens résultats.

## 8. Créateur de skills dans le chat

Le créateur est lui-même une méthode système versionnée. Il est capable de préparer et modifier des brouillons de skills, de proposer des exemples et de lancer des simulations. Ses outils de création sont distincts de l’exécution métier : demander de créer un skill de relance ne doit pas envoyer une relance pendant sa conception.

Parcours conseillé :

1. L’utilisateur décrit le résultat souhaité ou fournit un exemple.
2. Le créateur reformule l’objectif et identifie les informations indispensables manquantes.
3. Il produit une première fiche structurée et des exemples d’entrées/sorties.
4. L’utilisateur ajuste la méthode en langage naturel ou directement dans l’éditeur.
5. Chaque modification présente un diff des instructions, outils, ressources et effets.
6. Le créateur propose quelques essais représentatifs.
7. L’utilisateur teste sur données fictives ou en simulation.
8. Une publication explicite crée une version immuable utilisable dans le chat.

L’interface utilise deux panneaux sur desktop : conversation de conception à gauche et aperçu du skill à droite. Sur mobile, deux onglets conservent le même brouillon. L’en-tête affiche nom, état et commandes « Essayer » / « Publier » selon les droits.

Sections de l’éditeur : résultat attendu; quand utiliser/éviter; informations demandées; sources; étapes; outils et effets; format de sortie; exemples; essais; accès et publication. Les champs techniques sont repliés par défaut. Un utilisateur métier doit pouvoir créer une méthode sans écrire de JSON.

## 9. Créer depuis une conversation ou un document

« Transformer en skill » extrait la démarche, les questions utiles et le format de sortie. Les coordonnées, montants, secrets ou échanges privés de l’exemple ne sont pas incorporés par défaut dans une méthode partagée. Ils deviennent des paramètres ou des références consultées à l’exécution.

Le créateur montre ce qu’il a retenu, ce qu’il a remplacé par des variables et les ressources proposées. L’utilisateur choisit la portée personnelle ou d’équipe. Une pièce jointe accessible au créateur ne devient jamais automatiquement accessible à tous les futurs utilisateurs du skill.

## 10. Contrat de skill

Le manifeste est validé côté serveur. Il contient :

- identité stable, nom, description, catégorie, tags, langue et propriétaire;
- conditions d’utilisation et cas à éviter;
- schéma des entrées et valeurs par défaut;
- instructions et ressources référencées;
- outils autorisés et intégrations nécessaires;
- périmètre des objets et sources CRM;
- effets possibles et niveau maximal d’exécution;
- schéma du résultat et critères de réussite;
- budgets d’outils, de durée et de tokens;
- dépendances sur des versions de sous-skills;
- version, hash, compatibilité et cas d’essai.

Exemple **de contrat proposé**, à adapter aux schémas définitifs :

```json
{
  "key": "brief-client",
  "name": "Préparer un rendez-vous client",
  "description": "Produire un brief sourcé avant un échange avec un contact ou une entreprise.",
  "version": "1.0.0",
  "inputs": {
    "record_id": { "type": "record_reference", "required": true },
    "horizon_days": { "type": "integer", "default": 30, "maximum": 90 },
    "meeting_goal": { "type": "string", "required": false }
  },
  "tools": ["get_record", "search_emails", "search_meetings", "get_source", "search_commitments"],
  "effects": ["read"],
  "output": "client_brief",
  "budget": { "max_tool_calls": 5, "max_output_tokens": 2500 },
  "success": ["Chaque fait est sourcé", "Les informations manquantes sont visibles"]
}
```

Les références sont résolues en identifiants côté serveur. Un modèle ne peut pas déclarer une URL de webhook arbitraire comme nouvel outil privilégié. Les noms de champs CRM sont contrôlés par rapport au schéma de l’espace.

## 11. Découverte et activation automatique

Le choix explicite de l’utilisateur prime. Pour une demande naturelle, le routeur examine seulement les métadonnées des skills publiés, accessibles, activés et compatibles. Il peut choisir un skill, en suggérer un ou répondre qu’aucun ne convient.

Le corps complet des instructions et les références longues sont chargés après sélection. Un catalogue volumineux ne doit pas être injecté dans chaque prompt. La recherche peut commencer par les catégories et les objets concernés, puis classer une courte liste. Les règles exactes et seuils devront être évalués sur des demandes réelles anonymisées, pas inventés à partir du comportement interne de Notion.

L’utilisation automatique est une préférence distincte : désactivée pour un brouillon et contrôlable par utilisateur sur les versions publiées. Une compétence de lecture ne doit pas être remplacée silencieusement par une version qui ajoute un envoi externe. Le chat affiche toujours le skill réellement chargé et sa version.

## 12. Architecture du moteur

```mermaid
flowchart LR
  U[Chat ou fiche CRM] --> R[Résoudre un skill accessible]
  R --> V[Charger une version figée]
  V --> P[Valider entrées et permissions]
  P --> A[Moteur Ask Zyliad existant]
  A --> T[Outils CRM existants]
  T --> O[Cartes d’action et outbox]
  A --> C[Résultat structuré et citations]
  A --> J[Job durable si nécessaire]
  J --> T
```

Le contexte d’exécution transporte `skill_id`, `skill_version_id`, `skill_run_id`, paramètres validés, acteur, workspace, mode choisi, ressources autorisées et budget restant. Les outils utiles sont chargés progressivement dans la boucle actuelle. Les appels non déclarés sont refusés par le serveur, même si le modèle les demande.

Une version publiée pendant un run ne remplace jamais les instructions déjà chargées. Les résultats d’outils et les documents consultés restent des données non fiables, distinctes des instructions de la version approuvée.

## 13. Permissions et trois modes du chat

La permission effective est l’intersection des droits du compte, des droits d’utilisation du skill, de ses outils déclarés, du périmètre des données, du mode choisi dans le chat et des limites des intégrations.

| Mode | Effet pour un skill |
|---|---|
| Toujours me consulter | Lecture et préparation; chaque modification/envoi attend la validation prévue. |
| Vérifier pour moi | Tâches internes simples autorisées selon la politique du serveur; actions externes ou non admissibles présentées à l’utilisateur. |
| Avancer en autonomie | Après activation confirmée par l’utilisateur, exécution des actions disponibles déclarées par le skill sans validation intermédiaire, dans les droits du compte et le périmètre de la demande. |

Un skill ne peut pas sélectionner lui-même le mode autonome, s’attribuer un rôle administrateur ou ouvrir une intégration absente. Une modification qui élargit les outils ou les données accessibles est visible lors de l’adoption de la nouvelle version. Ce contrôle d’adoption ne doit pas devenir une demande de confirmation répétée à chaque étape du mode autonome.

Les droits « utiliser », « éditer », « publier », « partager » et « administrer » sont distincts. Un lecteur du CRM peut utiliser une méthode de lecture si ses accès le permettent. Un éditeur de skill ne publie pas nécessairement pour toute l’équipe. La révocation d’un accès doit être appliquée avant chaque nouvelle lecture ou effet, y compris après une reprise.

## 14. Exécution, progression et résultats dans le chat

Un run passe par les états : en attente, validation, chargement, exécution, information requise, approbation requise, interruption, terminé, partiel ou échoué. Les transitions sont persistées et les événements sont numérotés pour que le navigateur puisse reprendre le flux sans dupliquer les cartes.

La carte de run affiche nom/version, objectif, paramètres, étapes réellement exécutées, sources et effets réalisés. Elle ne dévoile pas le raisonnement interne du modèle. Les actions « Arrêter », « Reprendre », « Relancer avec d’autres paramètres » et « Voir les détails » sont disponibles selon l’état.

Le résultat peut être un brief, une synthèse, un tableau de comparaison, une checklist, un brouillon de message, un rapport ou un ensemble de propositions de mise à jour. Les faits, incertitudes et recommandations sont distingués. Un statut « envoyé » dépend de la confirmation du fournisseur, pas d’une phrase produite par l’IA.

## 15. Exécution longue, interruptions et doublons

Les petits runs utilisent la route de chat actuelle. Les runs qui dépassent son budget deviennent des jobs de la file existante avec actor, version et entrées figés. Ils possèdent des checkpoints, une échéance, un budget global et une politique de reprise bornée.

La clé d’idempotence doit identifier run, étape logique, cible et version des paramètres. Un arrêt empêche les nouvelles étapes et les nouveaux effets; il ne prétend pas annuler un message déjà envoyé. Un lease expiré ou un worker remplacé ne doit plus pouvoir appliquer d’effet.

Un envoi incertain n’est jamais rejoué aveuglément. La reprise consulte l’outbox et le fournisseur. Les erreurs permanentes ne bouclent pas; les erreurs transitoires ont un nombre de tentatives et un délai maximal. Les accès et le budget sont revérifiés à chaque reprise.

## 16. Modèle de données conceptuel

| Entité proposée | Rôle |
|---|---|
| `agent_skills` | Identité, espace, propriétaire, visibilité, état et version publiée. |
| `agent_skill_versions` | Instructions, manifeste, schémas et hash immuables après publication. |
| `agent_skill_preferences` | Activation, favoris et utilisation automatique par utilisateur. |
| `agent_skill_grants` | Utilisation, édition, publication et administration. |
| `agent_skill_resources` | Références vers les fichiers, exemples et modèles accessibles. |
| `agent_skill_runs` | Version figée, acteur, conversation, paramètres, budget et état. |
| `agent_skill_run_steps` | Événements, checkpoints et références des résultats/effets. |
| `agent_skill_evaluations` | Jeux d’essai, assertions, résultats et décision de validation. |

Toutes les entités métier sont rattachées explicitement au workspace et les préférences à l’utilisateur. Les références de versions, ressources et actions doivent conserver cette cohérence. Les index devront suivre les lectures effectives : catalogue par espace/état, préférences par utilisateur, versions par skill et événements par run/séquence.

La RLS, les règles de partage et les politiques de stockage sont à concevoir et tester dans de nouvelles migrations. Aucune migration appliquée existante ne doit être réécrite. Aucun secret OAuth ou fournisseur ne réside dans un manifeste de skill.

## 17. API et outils d’agent à ajouter

Routes proposées sous `/api/[workspace]/skills` : catalogue et filtres, création de brouillon, lecture/mise à jour avec contrôle de révision, versions, publication, préférences, duplication, archivage, essais et runs.

Les outils d’agent sont séparés : `search_skills`, `load_skill`, puis outils de conception tels que `create_skill_draft`, `update_skill_draft` et `evaluate_skill_draft`. La publication partagée doit avoir un point d’entrée contrôlé par les droits de publication; elle n’est pas un effet implicite du créateur.

Les API valident taille, champs, schémas d’entrée et de sortie, ressources, outils et compatibilité. Les mises à jour utilisent une version attendue pour détecter deux éditeurs concurrents. La diffusion des événements est privée, sans cache partagé de résultats CRM.

Un futur appel MCP peut référencer un skill publié et sa version. Il conserve le contexte de l’utilisateur connecté, les contrôles existants et les limites de ses outils. Il n’introduit pas de jeton maître contenu dans le skill.

## 18. Versionnement, publication et retour arrière

Cycle proposé : **brouillon → essais → revue éventuelle → publication → dépréciation → archive**. Chaque publication crée une version immuable. Un brouillon reste modifiable sans changer les runs en cours.

Le diff montre les instructions, entrées, formats, ressources, outils et effets nouveaux. Les versions purement éditoriales peuvent suivre une adoption automatique autorisée; un élargissement d’accès exige une adoption explicite adaptée au rôle. Les workflows et intégrations externes pincent une version ou une politique de mise à jour définie.

Le rollback remet une ancienne version comme version active sans effacer les runs, les évaluations ni les effets déjà produits. Une version archivée n’est plus sélectionnée automatiquement; les consultations historiques continuent de montrer la version exacte utilisée.

## 19. Essais et critères de qualité

Le bouton « Essayer » lance par défaut une simulation sur données fictives avec effets externes neutralisés. Une simulation ne doit jamais afficher un faux statut réel d’envoi. Un essai sur données réelles doit montrer son périmètre et respecter le mode de la conversation.

Chaque version importante possède des exemples nominaux et limites : donnée manquante, contact ambigu, accès refusé, source malveillante, intégration indisponible, résultat partiel, dépassement de budget, interruption et reprise, effet déjà exécuté.

Les critères vérifiables portent sur la validité des références, les citations, le format de sortie, les outils autorisés, l’absence d’effet inattendu et l’unicité des écritures. Les évaluations par modèle peuvent aider sur la lisibilité, mais ne remplacent pas ces assertions. La comparaison d’une version mesure réussite, qualité, durée et coût sur le même jeu de cas.

## 20. Import, export et ressources

Prévoir un export portable `SKILL.md` accompagné d’un manifeste et des seules ressources autorisées à sortir de l’espace. L’export ne garantit pas qu’un autre agent produira exactement le même résultat : ses outils et politiques peuvent différer. Une correspondance explicite d’outils est nécessaire à l’import.

Un import crée un brouillon désactivé, jamais un run automatique. Il valide les noms de fichiers, les chemins, les tailles, les types, les dépendances et les instructions. Les archives ne doivent pas contenir de traversée de répertoire ou de liens symboliques permettant de sortir du dossier d’import. Un hash assure l’intégrité des octets, pas la fiabilité de l’auteur.

La première version du produit ne lance pas de scripts arbitraires joints aux skills. Si cette capacité est ajoutée ensuite, elle nécessite un environnement d’exécution isolé, des restrictions réseau et des ressources bornées; un simple bouton d’import ne suffit pas.

## 21. Sous-skills et workflows

Un skill peut appeler une méthode spécialisée publiée, avec versions explicites, profondeur maximale et budget partagé. Valeurs de départ proposées : profondeur de trois et cinq sous-skills maximum, à ajuster sur des évaluations. Détecter les cycles et afficher la composition à l’auteur.

Une dépendance ne reçoit jamais plus de droits que son parent. Les appels parallèles sont réservés aux lectures indépendantes; des écritures sur la même cible doivent respecter l’ordre et les versions attendues.

Un workflow peut démarrer un skill uniquement avec un déclencheur et un acteur explicitement configurés. Le bouton d’utilisation automatique dans le chat ne crée pas à lui seul un agent exécuté en arrière-plan. Les jobs programmés doivent avoir un propriétaire, un budget et des accès révocables.

## 22. Mesure, coûts et exploitation

Par skill et version : utilisations, réussite/échec/partiel, abandons, durée médiane et p95, appels d’outils, tokens, coût estimé puis réel lorsqu’il est disponible, et retours des utilisateurs. Ne pas mélanger une annulation volontaire avec une défaillance technique.

Les journaux techniques conservent identifiants, versions, transitions, durées et codes d’erreur, sans copier par défaut le contenu privé des emails ou documents. Définir rétention, purge et export des runs. Les statistiques d’équipe doivent respecter les droits et éviter d’exposer les données privées par de petits agrégats.

Prévoir des limites par espace, utilisateur et run; un plafond d’essais de conception; un arrêt des nouveaux runs d’une version défectueuse; et une possibilité d’inspecter les effets déjà produits avant reprise.

## 23. Catalogue CRM initial

| Skill | Entrée principale | Résultat et effets possibles |
|---|---|---|
| Brief rendez-vous | Contact/entreprise et objectif. | Contexte cité, questions, engagements; lecture. |
| Bilan client | Entreprise et période. | Synthèse des échanges, opportunités et points ouverts. |
| Synthèse de réunion | Réunion sélectionnée. | Décisions et actions proposées avec preuves. |
| Engagements à vérifier | Fiche et période. | Promesses documentées, incertitudes et échéances. |
| Clarifier une contradiction | Deux sources comparables. | Comparaison sourcée et points à clarifier. |
| Qualifier un prospect | Fiche et critères métier. | Informations connues/manquantes, proposition de mise à jour. |
| Préparer une relance | Contact, motif, canal. | Brouillon de message et plan de suivi. |
| Effectuer une relance demandée | Destinataire vérifié et contenu demandé. | Envoi dans le mode et les droits choisis, statut fournisseur. |
| Analyse de pipeline | Pipeline, devise et période. | Agrégats contrôlés, risques et prochaines étapes. |
| Revue mensuelle de compte | Entreprise et mois. | Rapport, évolutions, tâches de suivi facultatives. |
| Hygiène des données | Liste et critères explicites. | Incohérences et corrections proposées, sans fusion aveugle. |
| Résumer une liste de comptes | Liste CRM et objectif. | Tableau comparable avec sources et limites. |
| Préparer un renouvellement | Compte et échéance connue. | Brief des engagements, échanges et actions disponibles. |
| Plan d’accueil d’un client | Compte et processus choisi. | Checklist et création de tâches dans le périmètre choisi. |
| Standardiser une note | Texte ou note sélectionnée. | Mise en forme conforme à la méthode de l’équipe. |
| Créer ou améliorer un skill | Besoin, exemples ou discussion. | Brouillon, diff, cas d’essai et publication explicite. |

Les premières méthodes doivent rester courtes, compréhensibles et immédiatement utiles. Un grand catalogue sans propriétaire, critères de réussite ni usage mesuré deviendrait difficile à maintenir.

## 24. Direction UI proposée

La bibliothèque Notion observée utilise un titre large, des onglets compacts, une barre de recherche/filtre et des lignes de table d’environ 36 px. Zyliad peut reprendre cette densité avec ses variables de thème, ses icônes et ses composants existants.

Pour le chat : conserver la largeur centrale actuelle de 712 px; ajouter une puce de sélection de 28 px; garder le menu de skills autour de 360 px, borné au viewport; déplacer automatiquement les menus au-dessus de la saisie lorsque celle-ci est en bas. Les formulaires de paramètres apparaissent dans la conversation. Les états vides expliquent comment créer ou activer une méthode et proposent une action réelle.

Pour le créateur : aperçu de fiche et conversation côte à côte, séparation redimensionnable, état de sauvegarde visible, diff avant publication et commande d’essai accessible. Sur mobile : panneaux en onglets, titres qui reviennent à la ligne, boutons utilisables au clavier et pas de défilement horizontal de toute la page.

## 25. Ordre de livraison conseillé

| Lot | Contenu | Condition de sortie |
|---|---|---|
| 1 — Fondations | Registre, versions, droits, préférences, bibliothèque et six skills de lecture. | Une version accessible est sélectionnable, chargée et tracée sans fuite inter-espace. |
| 2 — Chat | `/`, menu `+`, puce, paramètres, résultats et restauration de conversation. | Le parcours fonctionne au clavier et sur mobile, avec les trois modes existants. |
| 3 — Créateur | Conception assistée, brouillons, diff, simulations, publication et duplication. | Le créateur produit une méthode réutilisable sans effets métier pendant sa conception. |
| 4 — Exécution durable | Jobs longs, checkpoints, reprise, arrêt et métriques. | Une interruption ne double pas un effet externe. |
| 5 — Équipe et extension | Partage, adoption de versions, workflows, sous-skills bornés, import/export. | Chaque élargissement de portée est explicite et chaque run reste reproductible. |

Ne pas attendre tous les lots pour rendre le produit utile : la bibliothèque et quelques méthodes CRM fiables apportent déjà de la valeur. Le modèle de données et les contrats doivent toutefois anticiper versions et runs dès le premier lot.

## 26. Critères d’acceptation de l’ensemble

1. Un skill inaccessible est absent de la recherche, de la sélection et des suggestions.
2. Une version publiée est immuable et figée pour toute la durée du run.
3. Le menu `/` et le menu `+` consultent le même catalogue.
4. Sélectionner un skill ne lance pas immédiatement une action.
5. Les paramètres manquants sont demandés sans perdre le brouillon du message.
6. Le créateur n’envoie aucun message métier pendant une simulation.
7. Une discussion contenant des données privées n’est pas copiée telle quelle dans un skill partagé.
8. Les trois modes du chat sont appliqués côté serveur.
9. Un skill ne peut pas augmenter les permissions ni activer lui-même l’autonomie.
10. Les outils et formats inconnus sont refusés avant exécution.
11. Un accès révoqué est appliqué à la prochaine lecture, action ou reprise.
12. Les sources et citations sont vérifiées avant restitution.
13. Un arrêt empêche les nouvelles étapes et conserve les effets déjà confirmés.
14. Une reprise ne duplique pas un envoi, une tâche ou une mise à jour.
15. Les états partiels et les limites de recherche sont visibles.
16. Les changements d’outils et d’effets d’une version sont montrés avant adoption.
17. Les imports restent des brouillons désactivés et ne lancent pas de code arbitraire.
18. Les menus, dialogues et tableaux restent accessibles au clavier et contenus sur mobile.
19. Les journaux techniques ne diffusent pas le contenu privé des ressources consultées.
20. Le retour à une ancienne version conserve l’historique des runs et des effets.

## 27. Décisions à prendre avant l’implémentation

Les valeurs proposées permettent de démarrer sans bloquer la conception : brouillons privés, bibliothèque d’équipe unique, publication contrôlée, création de skills ouverte aux membres autorisés, import en brouillon, exécution dans les droits du lanceur et budgets plafonnés par le serveur.

Les décisions qui dépendent du produit sont : qui peut publier pour l’équipe; quelles méthodes peuvent être utilisées automatiquement; quelles données peuvent être jointes à une méthode partagée; durée de conservation des runs; éventuelle exécution planifiée; et ouverture future à des scripts ou à des auteurs externes.

La réalisation devra prévoir de nouvelles migrations pour les entités persistantes et leurs droits, des routes validées, l’intégration au moteur existant, puis les composants du chat et du créateur. Ce document ne prétend pas que ces éléments sont déjà installés.
