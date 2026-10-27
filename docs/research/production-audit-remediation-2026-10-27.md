# Suite de l’audit public de production — 27 octobre 2026

L’audit du site public était partiel : navigation anonyme, contrôles API sans session, mesures responsive et scan ZAP ciblé. Aucun contournement exploitable n’a été confirmé. Les résultats ne certifient pas les parcours authentifiés, l’isolation entre comptes, les intégrations ou la capacité de production.

## Corrections

- Une clé de formulaire public mal formée reçoit maintenant une réponse 404 compréhensible, avant toute initialisation du client privilégié. Les contrôles de publication et d’appartenance du créateur restent applicables aux clés valides.
- Le chargement d’un formulaire indisponible ne montre plus de détails techniques de validation ni de bouton « Réessayer » pour les erreurs permanentes de lien ou d’accès. Les erreurs réseau, les réponses 429 et les pannes temporaires conservent la possibilité de réessayer ; la saisie et l’idempotence des soumissions restent inchangées.
- `Permissions-Policy` interdit caméra, microphone, géolocalisation, paiement, USB et capture d’écran. Aucun usage de ces capacités n’existe actuellement dans le navigateur : les intégrations de réunions importent les contenus des fournisseurs. Une future fonction de capture devra revoir cette politique.

## Exceptions CSP explicites

`img-src https:` sert aux favicons des domaines d’entreprises saisis par les utilisateurs dans `CompanyLogo`. Une liste fixe de fournisseurs casserait ces logos. Cette permission d’images ne donne pas une permission d’exécution de scripts. La remplacer par un proxy serveur sans protections SSRF déplacerait le risque. La politique est conservée tant que ce chargement direct fait partie du produit ; son périmètre est expliqué dans le code.

`style-src 'unsafe-inline'` sert aux attributs de positionnement React/Radix/graphiques et aux styles de verrouillage du scroll injectés par les dialogues. Le nonce et `strict-dynamic` continuent de protéger les scripts ; `unsafe-eval` reste réservé au développement. Retirer les styles inline sans adapter ces composants provoquerait des régressions de menus, modales et graphiques.

Ces deux observations sont des choix de compatibilité documentés, pas des vulnérabilités corrigées ou des faux positifs supprimés du scanner.

## Autres observations

Les avertissements de préchargement CSS sur la route 404 sont produits par le chargement de ressources Next.js. Aucun impact mesuré n’a justifié de supprimer le préchargement ou de modifier le cache global. Ils restent à surveiller sur une navigation représentative.

Les alertes CORS sur ressources statiques et métadonnées OAuth publiques, les occurrences de cache public, les commentaires de bundles et la réflexion du champ email ne sont pas traités comme des failles sans preuve de données privées exposées ou d’exécution. Les protections d’accès existantes sont conservées.

## Validation

Les tests de régression portent sur le refus des clés invalides avant accès privilégié, le maintien du filtrage des formulaires publiés et la distinction des échecs permanents et temporaires dans l’interface.

- `npm test` : 106 fichiers, 755 tests réussis.
- `npm run typecheck` et `npm run build` : réussis avec la configuration Supabase locale factice utilisée par la CI.
- `npm run lint` : aucune erreur ; 11 avertissements préexistants hors des fichiers corrigés.
- `npm run format:check` et `npm run check:structure` : réussis.
- `npm audit --audit-level=high` : aucune vulnérabilité signalée par le registre au moment du contrôle.
- `npm run check:secrets` et `npm run check:secrets:bundles` : réussis ; 139 artefacts de build analysés.
- Playwright CLI sur le build local de production : deux chargements indépendants du lien mal formé montrent le message français sans détails UUID ni bouton de relance ; l’en-tête Permissions-Policy est présent. Une panne 503 simulée puis une reprise vérifient le retour au formulaire. Aucun événement `pageerror` n’est apparu pendant ces scénarios. Les réponses simulées ne qualifient pas Supabase ni un enregistrement réel.

Les suites SQL et fournisseurs externes ne sont pas relancées : aucune migration, permission, intégration ni mutation métier n’a changé.

## Qualification restante

| Priorité | Vérification à réaliser dans un espace dédié                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Connexion réelle, déconnexion, révocation/expiration, cookies ; deux utilisateurs et deux espaces ; viewer/member/admin/owner ; isolation RLS et IDOR.                            |
| P1       | CRUD connecté et persistance ; fichiers/imports/exports ; traitements différés ; confirmations et idempotence ; intégrations ; sauvegarde et restauration.                        |
| P2       | Double soumission et concurrence ; réseau dégradé ; accessibilité clavier/lecteur d’écran/contraste ; responsive interactif ; comparaison visuelle ; performances et supervision. |

Une suite unitaire réussie apporte une protection contre les régressions du dépôt ; elle ne remplace pas ces vérifications de bout en bout. Aucun nouveau scan actif ou test avec effet réel n’est lancé sur la production pour ce correctif. La version déployée doit être rapprochée du commit publié avant de vérifier le résultat en production.
