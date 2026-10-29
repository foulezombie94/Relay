# Skills Ask Zyliad

État au 27 octobre 2026 : la bibliothèque, l’éditeur avec aperçu, les modèles, l’import/export, les versions, les préférences, le partage et l’exécution explicite dans Ask Zyliad sont raccordés aux RPC Supabase. La migration `20261027195131_agent_skills.sql` a été appliquée au projet APP TQT. Le push Git déclenche le déploiement applicatif ; la disponibilité de la version déployée n’est pas vérifiée ici.

## Effets et permissions

`src/lib/agent/contracts.ts` classe chaque outil dans `toolEffects`, avec `satisfies Record<ToolName, ToolEffect>`. Un effet externe compte aussi comme écriture. Les schémas, descriptions, effets et intégrations sont centralisés dans `toolRegistry`.

Une méthode est choisie explicitement dans le chat. Le mode `ask`, `review` ou `auto` de la conversation reste la source unique de l’approbation ; la méthode ne peut pas le modifier. `skillExecutionPolicy()` exige une version publiée, une activation personnelle et l’intersection entre droits utilisateur, outils accordés et intégrations disponibles. Ces ensembles viennent du serveur authentifié. La préférence historique `auto_select` n’active pas de routage automatique.

Le moteur accepte un catalogue restreint dans `ToolContext.allowedTools`. `undefined` conserve le fonctionnement normal de l’assistant ; `[]` retire les outils métier et leur découverte. Les appels directs, la découverte progressive et les propositions d’action respectent cette restriction. Les confirmations, contrôles des sources et mécanismes de livraison existants restent applicables. La route du chat charge une version publiée, valide ses entrées, démarre une exécution serveur liée à la conversation et passe ce catalogue au moteur.

## Studio

La page `/app/skills` donne accès aux méthodes personnelles, aux méthodes d’équipe et aux 16 modèles métier. La recherche est paginée. On peut créer un brouillon, importer un manifeste JSON ou SKILL.md, exporter, publier une version, restaurer une version antérieure, archiver, accorder un accès nominatif et activer la méthode pour le chat.

L’éditeur permet de modifier le nom, la description, la catégorie, les tags, les conditions d’utilisation, les instructions, les étapes, les entrées, les outils, le budget, le format, les exemples, les évaluations, les ressources et la visibilité. L’aperçu suit les changements. La publication montre explicitement les outils d’écriture et externes accordés à la version. Les préférences d’activation ne modifient pas le mode d’approbation de l’assistant.

Dans Ask Zyliad, le bouton « Méthode » permet de choisir une version publiée, de saisir ses champs requis ou de demander la conception d’une méthode dans le chat. Le résultat du créateur est validé contre un schéma strict et peut être enregistré comme brouillon privé ; il n’est jamais publié automatiquement.

## Contrats et portabilité

Les entrées publiques utilisent `parseSkillManifest()`, `validateSkillValues()` et `importSkill()`, qui normalisent les erreurs en `SkillValidationError`. Les clés réservées `__proto__`, `constructor` et `prototype` sont refusées avant le parseur. Les profondeurs, tailles, listes et budgets sont bornés. Les sélections multiples contiennent des UUID distincts. Un identifiant valide ne prouve pas un droit d’accès : chaque ressource est vérifiée à l’enregistrement, à la publication et au chargement.

L’export JSON utilise l’enveloppe `zyliad.skill`, version 2. Le Markdown contient cette enveloppe dans un bloc final ancré ; l’import accepte également l’ancien JSON et le bloc V1. Le bloc structuré fait autorité. Un import crée toujours un brouillon privé et n’accorde aucune permission.

Les clés et manifestes sont enregistrés dans `relay_private`. Les RPC Studio vérifient l’appartenance à l’espace, les rôles, la révision attendue et l’accès aux ressources. L’Engine de démarrage/fin d’exécution est réservé au `service_role`, vérifie la capability du run et récupère le mode d’approbation du message utilisateur vérifié. L’utilisateur ne peut annuler que son propre run ; il ne peut pas déclarer un run terminé ou choisir son mode d’exécution directement.

## Création structurée et évaluations

Le créateur utilise le format `skill_manifest`. Le moteur exige un objet `skill_result` : `draft` avec manifeste valide, `clarify` avec questions non vides ou `reject` avec un motif. Une prose seule ou un manifeste invalide ne devient pas un brouillon. Le créateur n’a aucun outil CRM et n’attache aucune ressource ni dépendance.

Chaque modèle contient un exemple et trois cas d’évaluation : demande normale, information manquante et tentative de contournement. Les requêtes sont obligatoires. `evaluateSkillCase()` vérifie le résultat attendu, le contenu requis/interdit, les sources distinctes, le budget et les appels autorisés. Les traces doivent venir du serveur. Aucune campagne d’évaluation avec un fournisseur IA n’a été exécutée ; les fixtures et cette grille ne mesurent pas la qualité sémantique réelle.

## Limites actuelles

La sélection de méthode est manuelle. Les dépendances imbriquées et les longues exécutions en arrière-plan ne sont pas prises en charge ; le moteur refuse les dépendances au lieu de les ignorer. Les résultats et leurs sources restent dans l’historique privé Ask Zyliad et sont soumis aux contrôles d’accès existants.

Avant la dernière intégration de l’interface et de la route du chat, les tests associés couvraient les clés réservées, les imports, les erreurs normalisées, les paramètres multiples, les effets externes, les restrictions d’outils et le résultat structuré du créateur. Aucun test ni build n’a été exécuté pour la dernière intégration, conformément à la demande de l’utilisateur.

## Interface du 28 octobre 2026

L’éditeur reprend la disposition observée dans Notion : titre de page, propriétés compactes, instructions et étapes au centre. L’aperçu se déplie à la demande ; les permissions et limites sont regroupées dans les réglages avancés. Les outils affichent des libellés métier français. Le partage est regroupé dans une fenêtre, avec recherche de membres pour les administrateurs via la route existante. Les autres propriétaires conservent le partage par identifiant, sans élargissement des permissions de lecture de l’équipe.

L’aperçu public `/demo/skills` utilise le même éditeur avec une méthode fictive. Il permet de modifier l’affichage sans enregistrer, publier ou interroger le CRM. Le serveur local a été lancé pour présenter cet écran ; aucune suite de tests ni build de production n’a été lancée pour ce changement.

L’édition des instructions utilise désormais des blocs (texte, deux niveaux de titres, listes à puces/numérotées, cases à cocher, citations et séparateurs). Le menu `/`, les menus de bloc, le déplacement à la souris ou par boutons et l’historique annuler/rétablir sont disponibles. Entrée crée un bloc ; Maj+Entrée ajoute une ligne. Le collage utilise du texte brut. Les blocs se sérialisent en Markdown dans `manifest.instructions`, avec la limite existante de 12 000 caractères, sans changement de schéma SQL. L’aperçu affiche les mêmes types de blocs. Aucun test ni build de production lancé, conformément à la demande antérieure.

L’écran de méthode a été simplifié autour de quatre propriétés : objectif, mots-clés, domaine et accès. Les instructions en blocs occupent la surface principale. Le contexte et les étapes sont repliés dans « Déroulé et contexte » ; les permissions restent dans « Réglages de l’agent ». L’export et l’archivage sont placés dans un menu secondaire. Le style Zyliad utilise une grille de propriétés compacte, un repère violet discret et une barre d’actions réduite. Ce changement est local ; aucun test ni build de production lancé.

### Révision après observation directe dans Chrome, 28 octobre

Cette révision remplace la grille précédente par la disposition de la page Skills observée dans Notion : barre de navigation fine, bandeau bleu, document de 708 px, titre de 40 px et quatre propriétés en lignes. Les propriétés sont Description, Ressources, Étiquettes et Créée par. Le domaine passe dans les réglages ; le partage reste dans sa fenêtre. La propriété Ressources recherche les fiches et notes via la route de recherche existante, sans élargir les accès ; la sauvegarde et le moteur conservent leurs contrôles serveur. Les documents déjà attachés restent affichables et retirables. Aucun téléversement de fichier n’est ajouté.

Le catalogue comprend 24 types fonctionnels : texte, titres 1–4, listes à puces/numérotées/de tâches, dépliant, encadré, citation, tableau, séparateur, lien vers une page, image, vidéo, audio, code, fichier par URL, carte de lien, table des matières et titres dépliants 1–3. Le menu en portail reprend les dimensions relevées (375 px, lignes de 32 px, icônes de 20 px, arrondis de 10 px), les groupes, les raccourcis affichés et le pied « Fermer le menu / esc ». Il s’ouvre au-dessus ou en dessous selon l’espace disponible ; un aperçu apparaît au survol. Recherche sans accents, flèches/Entrée/Échap, transformation en sous-menu, duplication, suppression et déplacement sont raccordés. Le bouton + ouvre le catalogue ; Alt ajoute au-dessus. Les raccourcis Markdown structurent les paragraphes, Ctrl/⌘ B/I/E ajoutent les marques de mise en forme.

Les types simples restent en Markdown. Les types enrichis utilisent des blocs de code `zyliad-*` contenant un objet JSON dont les champs utiles sont explicitement extraits. Les clôtures de code s’adaptent aux accents graves du contenu. Un bloc inconnu ou mal formé reste visible comme code. Aucun HTML n’est interprété, aucun code n’est exécuté. Les références n’acceptent que les URL http/https sans identifiants ; images et lecteurs ne chargent leur URL qu’après une action explicite. La limite globale des instructions reste 12 000 caractères, celle de l’éditeur 200 blocs, celle d’un tableau 30 lignes et 8 colonnes.

La visite du catalogue Notion a également recensé les bases de données, graphiques, formulaires, colonnes, blocs synchronisés, mentions, importateurs et connecteurs. Ces fonctions de plateforme ne sont pas implémentées par cette révision et ne sont pas présentées comme disponibles. Les commentaires collaboratifs, couvertures et mises en page personnalisées de Notion ne sont pas ajoutés. Le rendu local a été observé dans Chrome ; aucune suite de tests, vérification TypeScript ou compilation de production n’a été lancée. Aucun changement SQL, déploiement ou push Git n’est effectué pour cette révision locale.

### Raccordements CRM du 29 octobre 2026

- Les mentions `@` recherchent des fiches accessibles et ajoutent une référence stable à la méthode. Les marqueurs `@[libellé](record:UUID)` restent lisibles dans les instructions ; leur référence et leurs droits sont revérifiés côté serveur. Le bouton de champs automatiques et la saisie `{{` proposent les valeurs de fiche, contact, entreprise, opportunité et les paramètres `input.clé`.
- Le serveur résout le contexte courant et remplit les paramètres de fiche reconnus (`record_id`, `fiche_id`, `contact_id`, `company_id`, `entreprise_id`, `deal_id`, `opportunity_id`, `opportunite_id`) lorsqu’ils ne sont pas déjà renseignés. Une entreprise liée n’est choisie automatiquement que si elle est unique ; les relations tronquées restent ambiguës. Les valeurs explicites sont contrôlées selon les droits actuels. La date du jour utilise le fuseau de l’espace. Les valeurs CRM sont transmises séparément comme données non fiables, sans interpolation dans les instructions privilégiées du moteur.
- La sauvegarde automatique attend une seconde après la saisie et sérialise les requêtes. Les révisions serveur protègent contre les modifications concurrentes. Une réponse à une ancienne saisie ne remplace pas les nouvelles modifications. Une erreur ou un conflit reste visible ; le brouillon ne se publie jamais automatiquement. Une normalisation des empreintes évite des sauvegardes dues au seul ordre des clés JSONB.
- L’aperçu de préparation appelle `/api/[workspace]/skills/preview`, sans démarrer de run, appel IA ni action. Il affiche le contexte, les paramètres manquants, les étapes et les outils possibles. Les brouillons exigent le droit d’édition ; les versions publiées utilisent les mêmes contrôles de version, activation, ressources, outils et intégrations que le chargement réel. Cet aperçu n’est pas une prédiction des paramètres exacts des futures actions.
- La propriété Ressources permet de sélectionner un document existant ou de déposer un fichier de 4 Mo maximum avec la route de stockage existante. PDF/TXT/CSV fournissent du texte lorsque l’extraction le permet. Les documents appartiennent à l’espace et suivent ses droits ; attacher un fichier à une méthode privée ne rend pas le fichier privé. Retirer une référence ne supprime pas le fichier. La lecture de ressources ajoute `get_source` au brouillon, avec un budget positif ; toute nouvelle version reste soumise à la publication et aux outils accordés.
- « Utiliser une méthode » est disponible sur les fiches contacts, entreprises, opportunités et fiches génériques. Le lien ouvre le chat avec la fiche et le skill, sans exécution immédiate. `/` dans le chat recherche les méthodes activées et autorisées, avec pagination et navigation au clavier. Le sélecteur prépare les paramètres côté serveur avant la sélection ; le moteur revérifie ces droits au lancement. Un changement de fiche dans le compositeur retire la sélection préparée précédente.

L’aperçu public local utilise des données fictives ; aucun enregistrement, stockage ou run réel n’y est effectué. Ces raccordements réutilisent les tables, RPC et bucket existants, sans migration. Aucune suite de tests, vérification TypeScript ou compilation de production n’a été exécutée, conformément à la demande de l’utilisateur. La publication Git est demandée directement sur `main` ; l’état du déploiement est à distinguer du succès du push.
