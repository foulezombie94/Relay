# Lanceurs de validation

Les tests unitaires sont à côté du code (`*.test.ts` / `*.test.tsx`) et lancés par `npm test`. Les assertions SQL sont dans [supabase/tests](../../supabase/tests) ; ce dossier contient leurs lanceurs et fixtures de bootstrap locales.

| Commande / fichier                                  | Rôle                                                                                         |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `node --import tsx scripts/tests/migrate-local.mts` | Initialiser les migrations dans une base PostgreSQL jetable locale                           |
| `npm run test:agent:db`                             | Scénarios agent, confirmations et dashboards en base                                         |
| `npm run test:performance:db`                       | Seize suites SQL de permissions, agrégats, cache, jobs et CRM                                |
| `npm run test:agent:concurrency`                    | Analyse unique, quota email et confirmation idempotente                                      |
| `npm run test:agent:tokens`                         | Admissions et réservations de tokens concurrentes                                            |
| `npm run test:performance:load`                     | Charge CRM locale avec fixtures et nettoyage                                                 |
| `npm run eval:agent`                                | Évaluation du modèle ; configurer le fournisseur de test et lire le script avant utilisation |
| `npm run test:queue`                                | Tests de queue SQL avec `RELAY_TEST_DATABASE_URL` ; base locale jetable uniquement           |
| `npm run test:integrations`                         | Framework et adapter Google avec réponses simulées, OAuth et webhooks authentifiés           |
| `npm run test:integrations:db`                      | Vault privé, isolation tenant, états OAuth, confirmations, cursor/lease et révocation SQL    |
| `npm run check:secrets:bundles`                     | Scan des bundles navigateur générés, sans afficher de credential                             |

Tous les runners utilisent `RELAY_TEST_DATABASE_URL` et refusent une destination distante, les paramètres de connexion dans l’URL et les bases ne portant pas un nom `relay_test` ou `relay_test_*`. Le bootstrap émule les composants Auth nécessaires, sans remplacer Supabase Auth. Les suites SQL annulent leurs transactions ; les runners de charge/concurrence nettoient leurs fixtures. Aucun runner ne charge implicitement les credentials applicatifs de `.env.local`.

`npm run test:performance:db` inclut aussi `crm-save-reliability.sql` : insert/update confirmés, UUID de reprise unique, version périmée, refus du lecteur et isolation entre workspaces. Initialiser une base locale jetable avec `migrate-local.mts` avant ce contrôle ; ne jamais utiliser le MCP de production pour les fixtures.

Ne pas tester la charge sur la production. Les évaluations IA peuvent consommer des tokens. Protocole, résultats et limites : [docs/performance](../../docs/performance/README.md).
