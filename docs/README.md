# Documentation de Relay

Pour débuter : [README](../README.md), [contribution](../CONTRIBUTING.md), [architecture](architecture/README.md) et [analyse du dépôt](architecture/repository-audit.md).

## Architecture et exploitation

- [Architecture, responsabilités et parcours du code](architecture/README.md)
- [Analyse et inventaire au 9 octobre 2026](architecture/repository-audit.md)
- [Session et reconnexion](architecture/session-management.md)
- [Déploiement web, worker et base](operations/deployment.md)
- [Configuration des intégrations](operations/integrations.md)
- [Performances, quotas, tests SQL et mesures](performance/README.md)

## Fonctionnalités

- Interface : [composants de l’espace et référence Notion](features/workspace-components.md)

- MCP : [serveur distant OAuth, Claude Code/Codex, permissions et validation](features/mcp.md)

- Ask Relay : [agent et sécurité](features/ask-relay/ask-relay-agent.md), [identité](features/ask-relay/ask-relay-identity-intelligence.md), [interface](features/ask-relay/ask-relay-interface.md)
- CRM : [écrans et flux](features/crm/crm-pages.md), [opérations quotidiennes](features/crm/daily-crm-operations.md), [doublons](features/crm/duplicate-lifecycle.md), [paramètres](features/crm/settings-interface.md)
- Dashboard : [blocs, widgets, données et validation](features/dashboard.md)
- Workflows : [canvas, blocs et exécutions](features/workflows.md)
- Réunions : [bibliothèque, agenda et analyses](features/meetings.md), [étude Attio](research/meeting-competitive-analysis.md)
- Portails clients : [parcours, permissions et validation](features/client-portals.md)

Ces fiches expliquent une fonctionnalité à leur date de rédaction. Pour les optimisations du 9 octobre, consulter aussi les performances. L'aide affichée dans `/doc` est maintenue séparément dans `src/lib/help/guides.ts`.

## Décisions et recherches

- Produit : [décisions](product/product-decisions.md), [couverture historique](product/feature-coverage.md)
- Recherches : [comparaison CRM](research/competitive-analysis.md), [écarts](research/competitive-gap-analysis.md), [audit historique](research/crm-completeness-audit.md), [dashboards](research/dashboard-competitive-analysis.md), [workflows](research/workflow-competitive-analysis.md), [équipes](research/team-management-analysis.md), [landing](research/landing-page-benchmark.md)

Les recherches et audits historiques donnent le contexte d'une décision ; ils ne constituent pas un inventaire actuel des fonctions livrées. Les affirmations sur l'absence de worker ou de mesures de charge se lisent à leur date.

## Archives

- [Guide principal précédent](history/README-2026-10-08.md)
- [Ancienne note d'architecture](history/architecture-before-2026-10-09.md)
- [Scripts SQL initiaux](../supabase/legacy/README.md)

Les règles produit et design restent dans [PRODUCT.md](../PRODUCT.md) et [DESIGN.md](../DESIGN.md). Les configurations Next.js, Vercel, Railway et outils restent à la racine.
