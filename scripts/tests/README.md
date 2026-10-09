# Lanceurs de validation

Les tests unitaires sont à côté du code (`*.test.ts` / `*.test.tsx`) et lancés par `npm test`. Les assertions SQL sont dans [supabase/tests](../../supabase/tests) ; ce dossier contient leurs lanceurs et fixtures de bootstrap locales.

| Commande / fichier                                  | Rôle                                                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `node --import tsx scripts/tests/migrate-local.mts` | Initialiser les migrations dans une base PostgreSQL jetable locale                              |
| `npm run test:agent:db`                             | Scénarios agent, confirmations et dashboards en base                                            |
| `npm run test:performance:db`                       | Seize suites SQL de permissions, agrégats, cache, jobs et CRM                                   |
| `npm run test:agent:concurrency`                    | Analyse unique, quota email et confirmation idempotente                                         |
| `npm run test:agent:tokens`                         | Admissions et réservations de tokens concurrentes                                               |
| `npm run test:performance:load`                     | Charge CRM locale avec fixtures et nettoyage                                                    |
| `npm run eval:agent`                                | Évaluation du modèle ; configurer le fournisseur de test et lire le script avant utilisation    |
| `npm run test:queue`                                | Ancien lanceur SQL avec `SUPABASE_DB_URL`, TLS et `.env.local` ; base de test dédiée uniquement |

Les runners locaux utilisent `RELAY_TEST_DATABASE_URL` et refusent une destination distante. Leur bootstrap émule les composants Auth nécessaires, sans remplacer Supabase Auth. Les suites SQL annulent leurs transactions ; les runners de charge/concurrence nettoient leurs fixtures.

Ne pas tester la charge sur la production. Les évaluations IA peuvent consommer des tokens. Protocole, résultats et limites : [docs/performance](../../docs/performance/README.md).
