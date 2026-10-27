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
