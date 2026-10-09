# Analyse du dépôt — 9 octobre 2026

Référence initiale : `6330a135226c0e07f1e06ff47d88d5e175211716`. Analyse de l'arborescence, références locales, configurations, points d'entrée, couches applicatives, tests et documentation. Elle sert à préparer le travail en équipe ; elle n'est pas un audit de sécurité exhaustif ni une certification de production. Les règles d'accès restent à tester après toute évolution.

## Les six commits précédents

Intervalle : `3d157af..6330a13`, avant le présent rangement. Commande reproductible : `git diff --numstat 3d157af 6330a13`. La différence compare les deux états finaux ; elle ne recompte pas plusieurs fois une ligne modifiée dans des commits intermédiaires.

| Nature                                  |  Ajoutées | Supprimées | Différence nette |
| --------------------------------------- | --------: | ---------: | ---------------: |
| Code applicatif TypeScript/React/worker |       942 |        797 |             +145 |
| Migrations SQL                          |       600 |          0 |             +600 |
| Tests et lanceurs de validation         |     1 029 |         90 |             +939 |
| Documentation                           |        79 |          6 |              +73 |
| Résultats JSON des mesures locales      |     1 914 |          0 |           +1 914 |
| Configuration et autres fichiers        |        27 |          6 |              +21 |
| **Total**                               | **4 591** |    **899** |       **+3 692** |

Le code applicatif et SQL a donc augmenté de **745 lignes nettes**, avec remplacement d'une partie des collectes TypeScript par des agrégations SQL. Les six commits ont des responsabilités distinctes : base, agent, lectures CRM, worker, validation et déploiement. Les résultats JSON ne sont pas des lignes de logique applicative.

## Inventaire avant rangement

Comptage des fichiers suivis `.ts`, `.tsx`, `.mts`, `.css`, `.sql`, en lignes physiques incluant commentaires et lignes vides. Hors dépendances, build, lockfile, documentation Markdown et artefacts JSON. Ce n'est pas un nombre de SLOC ni une mesure de complexité. Les tests `.test.*` sont séparés de leur module.

| Ensemble                                        | Fichiers | Lignes physiques |
| ----------------------------------------------- | -------: | ---------------: |
| Interface React et CSS associés                 |       83 |           24 769 |
| Routes Next.js et styles globaux                |       67 |            7 311 |
| Domaine métier                                  |       27 |            3 195 |
| Moteur agent IA, hors tests/UI/SQL              |       10 |            2 108 |
| Intégrations fournisseurs                       |       13 |            1 687 |
| Adaptateurs API                                 |       13 |            1 290 |
| Textes de l'aide utilisateur                    |        1 |            1 154 |
| Queue et handlers de jobs                       |       11 |              744 |
| Session/clients Supabase                        |        4 |               95 |
| Observabilité                                   |        3 |               89 |
| Invitations équipe                              |        1 |               10 |
| Configurations TypeScript et scripts hors tests |        7 |              283 |
| Migrations SQL                                  |       42 |            5 551 |
| Tests TypeScript                                |       46 |            3 926 |
| Scripts de validation et bootstrap              |       10 |            1 022 |
| Tests SQL                                       |       16 |            1 293 |
| SQL historique conservé                         |        7 |              680 |
| **Total de ce périmètre**                       |  **361** |       **55 207** |

Les lignes d'agent SQL sont imbriquées dans des migrations communes ; ce tableau ne les attribue pas artificiellement toutes au moteur IA. Le rangement conserve le contenu des fonctions ; Git reconnaît les déplacements comme renommages lorsque leur contenu reste équivalent.

## Résultats de l'analyse

La séparation web / logique métier / API / intégrations / jobs / Supabase existe déjà. Les tests unitaires sont généralement colocalisés et les tests SQL couvrent droits, confirmations et concurrence. Les contrats d'outils sont typés ; queue et outbox sont durables. Il n'est pas nécessaire de remplacer cette architecture pour rendre le dépôt compréhensible.

Les principales difficultés de maintenance étaient la racine de `components/` encombrée, les CSS de fiches et paramètres dans `pages/`, les guides développeur tous au même niveau, l'aide utilisateur appelée `lib/docs.ts`, et les SQL historiques à côté des migrations. Plusieurs paragraphes du README et de l'ancienne architecture affirmaient aussi que le worker ou les mesures n'existaient pas encore.

Le rangement déplace 73 fichiers : groupes fonctionnels de composants et CSS, aide produit distincte de la documentation technique, scripts SQL initiaux archivés et documents indexés. Le catalogue Zod auparavant dans `lib/api/resources.ts` rejoint `lib/domain/resource-schemas.ts` : les imports métier ne dépendent plus d'un dossier d'adaptateurs API pour accéder à des schémas purs. Imports, mocks, lectures de fichiers de tests, liens et scripts de formatage sont mis à jour. Les conventions de contribution et la vérification des références locales sont désormais explicites.

## Points à travailler progressivement

| Point observé                                                                                    | Conséquence et suite raisonnable                                                                                                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grandes pages : paramètres 743 lignes, assistant 677, qualité 661, fiches 606 au point de départ | Extraire progressivement les sous-sections vers leur fonctionnalité, en conservant leur comportement et leurs contrats de données.                       |
| Agent : outils 533, runner 523, contrats 521 lignes                                              | Modules centraux couplés aux droits et confirmations ; tout découpage demande une revue de sécurité et leurs tests dédiés.                               |
| Schémas, calculs et SQL partagés par plusieurs fonctionnalités                                   | Modifier un type après avoir identifié routes, worker et RPC qui le consomment. Éviter une extraction massive de services sans bénéfice démontré.        |
| Exports synchrones ; performances mesurées surtout côté SQL                                      | Tester mémoire et latence réelles à volume représentatif avant de promettre une capacité d'entreprise.                                                   |
| Cache, coût IA et jobs dépendent de PostgreSQL et de la configuration                            | Surveiller invalidation, réservations incertaines, leases et erreurs fournisseur ; ne pas confondre code de monitoring et moniteurs externes configurés. |
| OAuth et fournisseur IA configurés sur deux services                                             | Vérifier variables web et worker séparément, avec comptes de test réels. Le succès d'un build ne valide pas ces secrets.                                 |
| Recherches/audits historiques conservés                                                          | Les lire comme contexte daté ; architecture, code et validations récentes déterminent l'état actuel.                                                     |

Les responsabilités opérationnelles sont définies, mais aucun propriétaire humain, règle CODEOWNERS ou obligation de revue n'est inventé pour une équipe inexistante. Les branches protégées et personnes responsables devront être configurées lorsque l'équipe sera constituée.

## Validation et limites

Avant ce rangement, `6330a13` était confirmé déployé sur Railway et Vercel, `/healthz` répondait `ok`, et les deux jobs CI étaient réussis. Les sept migrations récentes étaient appliquées et l'historique de 42 fichiers aligné avec Supabase.

Le lot précédent avait passé 281 tests Vitest, 16 suites SQL et les scénarios de concurrence. Après le rangement, les 281 tests Vitest, TypeScript et le build de production passent à nouveau. Le contrôle de structure valide 764 imports et 83 liens locaux. Le lint ne présente aucune erreur ; les 17 avertissements existants restent visibles, notamment les imports inutilisés et l'attribut ARIA du date picker.

Une comparaison avec le commit initial confirme que les 279 fichiers TypeScript existants sont identiques après normalisation des seules références de fichiers. Les 67 fichiers SQL, tous les CSS et les cinq ressources publiques sont identiques octet pour octet. Les 42 migrations appliquées restent donc inchangées. Les suites SQL et la charge ne sont pas relancées pour ce rangement ; elles ne vérifieraient pas les imports React modifiés.

Les mesures de charge sont isolées : dashboard commercial à 100 000 fiches / 100 utilisateurs simulés, p95 de 5 841 ms à cache vide et 644 ms en répétition. Elles ne prouvent pas 100 utilisateurs réels sans ralentissement. Voir [protocole et résultats](../performance/README.md).
