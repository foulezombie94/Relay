# MCP CRM — comparaison et évolutions du 11 octobre 2026

Cette analyse compare les documentations officielles publiques ; elle ne prétend pas avoir installé ou exercé les services concurrents avec des comptes de test.

| Service                                                                                                                        | Fonctions documentées utiles                                                                                                   | Application dans Zyliad                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [Attio](https://docs.attio.com/mcp/overview)                                                                                   | Identité, membres, lecture de fiches par IDs, attributs, listes et entrées, notes, tâches, réunions, emails et rapports        | Identité actuelle, membres minimisés, lecture de 10 fiches par appel, relations et contenu de listes paginés, contexte ciblé et fils d’emails |
| [HubSpot](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) | Accès aux objets, activités et conversations selon les permissions ; découverte de l’utilisateur et des capacités ; OAuth/PKCE | Outil de diagnostic affichant le rôle et les scopes effectifs, catalogue filtré et vérification indépendante des scopes en SQL                |
| [Salesforce](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/servers-reference.html)                   | Séparation des outils de lecture, mutation et suppression ; chaque appel respecte les permissions utilisateur                  | Lectures sous RLS et propositions exactes confirmées dans Zyliad ; aucune nouvelle suppression ou fonction SQL arbitraire                     |

## Changements livrés

Le serveur distant SDK v2 devient **1.1.0**. Les 22 noms existants restent compatibles et huit lectures sont ajoutées, soit 30 outils : `zyliad_connection`, `zyliad_get_record`, `zyliad_get_records`, `zyliad_record_context`, `zyliad_record_relations`, `zyliad_list_records`, `zyliad_search_members`, `zyliad_email_thread`.

Le contexte d’une fiche et la lecture de plusieurs fiches regroupent les accès en une seule requête RPC métier. Une requête HTTP garde toutefois sa vérification de session et l’appel métier revérifie le token : ce regroupement ne supprime pas ces contrôles ni toutes les requêtes SQL internes. Il n’y a aucun cache partagé de données privées.

Les instructions, descriptions, paramètres, messages et cinq prompts MCP sont en français. Les valeurs CRM, noms propres et citations restent intacts. Les marqueurs de protocole, scopes et noms d’outils restent stables. Les instructions orientent le modèle externe vers le français par défaut ; Zyliad ne peut pas imposer la langue de toutes les réponses d’un client tiers.

Les réponses sont limitées à 256 KiB, les appels à la base à 10 secondes, les pages à 20 éléments, le contexte à 5 extraits par section et les lots à 10 fiches. Les erreurs fournissent une catégorie, un message français, un identifiant de corrélation et un délai de reprise pour les erreurs temporaires ou quotas. Aucune reprise d’écriture automatique n’est ajoutée.

## Frontières conservées

- Le workspace et l’identité viennent du token vérifié et du membership courant. Un paramètre `workspace_id` est refusé par les nouveaux outils.
- Les nouveaux helpers sont `SECURITY INVOKER`, privés et sans grant direct navigateur. Les lectures s’effectuent sous `zyliad_mcp`, rôle sans connexion ni contournement RLS.
- Chaque section de contexte exige son scope propre. Les entrées de liste exigent configuration **et** fiches ; les droits sur la liste et chaque fiche s’appliquent aussi.
- Un ID absent et un ID inaccessible ont la même réponse. Les lots indiquent les IDs demandés indisponibles sans révéler leur existence ailleurs.
- Les membres renvoient uniquement leur UUID, nom affiché et rôle ; les comptes Auth et secrets fournisseurs ne sont jamais interrogés.
- Les champs personnalisés sont sélectionnés explicitement et `attributes_partial` indique une sélection incomplète. Ne jamais remplacer un objet complet par une sélection partielle.
- Les écritures existantes restent des propositions, avec version, idempotence et confirmation exacte dans Zyliad. L’agent ne peut pas confirmer.
- Les journaux structurés contiennent action, résultat, durée, workspace, connexion et corrélation. Aucun argument, résultat complet, email ou token n’est journalisé.

## Évolutions à traiter séparément

La recherche sémantique, la fusion de doublons, la gestion de champs/pipelines et les actions externes ne sont pas introduites par ce changement. Elles nécessitent leurs propres budgets, politique de risque, consentement et tests métier. Le simple fait qu’un concurrent les expose ne prouve pas qu’elles peuvent être ajoutées sans ces contrôles.

## Validation

Les résultats et commandes reproductibles sont décrits dans [la fiche MCP](../features/mcp.md). Les tests SQL utilisent une base Docker PostgreSQL locale jetable ; aucune fixture ou mesure de charge n’est exécutée sur la production. Une validation du parcours avec les applications personnelles Claude Code et Codex reste à effectuer depuis ces clients : l’environnement de développement ne possède pas ces sessions.

Résultats locaux : **628 tests sur 82 fichiers**, dont **30 tests MCP**, passent ; les deux suites SQL MCP passent après l’installation de toutes les migrations sur une base PostgreSQL 17 neuve. Typecheck, build de production, structure, Prettier et scans des secrets dans le dépôt, les logs de tests et les bundles navigateur passent. Lint : aucune erreur, 15 avertissements préexistants hors des fichiers modifiés.

Les outils et références de précontrôle du scan automatisé Codex Security sont indisponibles dans cette session ; aucun rapport de ce scanner n’est donc revendiqué. La revue locale couvre chaque fichier modifié, le rôle et les grants SQL, les scopes composés, les sources privées, les curseurs, les erreurs et logs. Elle ne constitue pas un audit indépendant ni une mesure de charge avec 40 utilisateurs.

Les advisors Supabase avant migration signalent les tables privées avec RLS sans policy (accès direct fermé intentionnellement), sept RPC métier `SECURITY DEFINER` accessibles aux utilisateurs authentifiés et la protection contre les mots de passe compromis désactivée. Ces réglages préexistent et ne sont pas modifiés par cette migration MCP. Références : [revue des grants SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Une alerte de linter ne prouve pas à elle seule que les RPC métier sont vulnérables ; leurs contrôles doivent être examinés dans leur propre contexte.
