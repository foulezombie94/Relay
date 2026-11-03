# Fonctionnalités CRM à mettre en place — analyse concurrentielle du 3 novembre 2026

Document de recherche daté. Il compare Relay à Attio, HubSpot, Pipedrive, folk, Twenty, Close et Salesforce, puis classe les fonctionnalités manquantes par priorité. L'état de Relay a été relevé dans le code (`src/`, `supabase/migrations/`) le 3 novembre 2026, car [la matrice de couverture](../product/feature-coverage.md) date du 6 octobre et ne reflète plus les moteurs livrés depuis (workflows, séquences, dashboards, MCP, réunions). Les capacités des concurrents viennent de leurs pages produit publiques et d'articles tiers de 2026 ; prix et formules évoluent vite et sont à revérifier avant toute décision commerciale.

## Ce que Relay couvre déjà

| Domaine             | Présent dans Relay                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Modèle de données   | Personnes, entreprises, opportunités, objets et attributs personnalisés, relations, Record Studio, formules/rollups  |
| Vues                | Tableau, Kanban, listes, vues sauvegardées, filtres simples, segments                                                |
| Pipelines           | Plusieurs pipelines, probabilités par étape, raisons de perte, forecast par devise                                   |
| Qualité des données | Import CSV/XLSX avec mapping et reprise, migrations depuis d'autres CRM, doublons, fusion et annulation, export      |
| Collaboration       | Notes, tâches, activités, documents, notifications, mentions, journal d'audit                                        |
| Communication       | Gmail/Outlook OAuth, calendriers Google/Microsoft, synchro durable avec leases, envoi confirmé, modèles d'email      |
| Automatisation      | Moteur de workflows (blocs, événements externes, idempotence), séquences avec moteur d'envoi, désinscription, Zapier |
| Reporting           | Dashboards personnalisables, widgets, historique des ventes, rapports                                                |
| IA                  | Ask Relay (recherche, agrégations, sources vérifiées, confirmations exactes, outbox), skills d'agent, serveur MCP    |
| Réunions            | Connecteurs Meet/Teams/Zoom pour transcriptions, bibliothèque de réunions                                            |
| Différenciateurs    | Engagements avec preuves, contradictions, priorités expliquées, portail client, passage vente gagnée → réalisation   |
| Captation           | Formulaires publics (`/forms/[key]`)                                                                                 |
| Équipe              | Quatre rôles, invitations, visibilité lecteur, délégation admin, révocation portail                                  |

## Ce qui manque, par priorité

Légende de la colonne « Référence » : **A** Attio, **H** HubSpot, **P** Pipedrive, **F** folk, **T** Twenty, **C** Close, **S** Salesforce.

### P0 — attendu par tout acheteur, son absence fait perdre des ventes

| #   | Fonctionnalité                                              | Pourquoi                                                                                                     | Référence | Écart constaté dans Relay                                                                       |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------- |
| 1   | Étapes de pipeline libres                                   | Chaque équipe a son propre processus ; six étapes fixes bloquent l'adoption                                  | A H P T S | `stages` est une énumération fixe dans `src/lib/domain/types.ts`                                |
| 2   | Filtres composés ET/OU imbriqués                            | Indispensable pour segmenter, alimenter séquences, workflows et rapports                                     | A H P T S | `record-filters.ts` n'accepte qu'une liste plate                                                |
| 3   | Enrichissement automatique entreprises/personnes            | Attio et folk remplissent logo, secteur, taille, LinkedIn à la création ; c'est leur premier « effet waouh » | A H F     | Seul le site/logo d'entreprise est déduit                                                       |
| 4   | Synchro email/calendrier entièrement automatique            | Le CRM doit se remplir seul : contacts créés depuis la boîte mail, historique d'échanges sur la fiche        | A H F C   | Synchro durable présente ; vérifier création auto des contacts et partage par équipe            |
| 5   | Suivi d'ouverture et de clic des emails                     | Base de toute prospection et des déclencheurs de séquence                                                    | H P C     | Aucun suivi d'ouverture/clic trouvé                                                             |
| 6   | API REST publique versionnée + clés API + webhooks sortants | Les clients branchent leurs outils ; Zapier seul ne suffit pas                                               | A H P T S | API interne et MCP ; pas d'API `/v1` documentée (OpenAPI) ni de webhooks sortants configurables |
| 7   | Historique des valeurs d'attributs                          | « Qui a changé ce montant et quand » : confiance et audit                                                    | A H S     | `audit_events` existe ; à exposer par champ sur la fiche                                        |
| 8   | Corbeille et restauration des fiches                        | Erreur de suppression = perte de données                                                                     | A H P     | Annulation de fusion uniquement                                                                 |
| 9   | Facturation et abonnements                                  | Impossible de vendre Relay en libre-service                                                                  | tous      | Aucun Stripe                                                                                    |
| 10  | Double authentification (2FA)                               | Exigence sécurité de base des acheteurs B2B                                                                  | tous      | Aucune MFA trouvée                                                                              |

### P1 — différencie un CRM moderne type Attio

| #   | Fonctionnalité                               | Pourquoi                                                                                   | Référence |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 11  | Extension Chrome (capture LinkedIn/Gmail)    | Ajouter un contact depuis LinkedIn ou Gmail en un clic ; argument central de folk          | A F H P   |
| 12  | Recherche globale ⌘K + recherche sémantique  | Navigation rapide et questions en langage naturel sur tout l'historique                    | A H T     |
| 13  | Agent de recherche web IA par fiche          | Attio « Research agent » : remplit des attributs IA (secteur, actualités, signaux d'achat) | A H       |
| 14  | Attributs calculés par IA                    | Colonne dont la valeur est produite par un prompt (score, résumé, catégorie)               | A H       |
| 15  | Lead scoring                                 | Prioriser les prospects selon critères et engagement                                       | H P S     |
| 16  | Prise de rendez-vous (liens de réservation)  | Remplace Calendly, crée la réunion et la fiche automatiquement                             | H P C     |
| 17  | Objectifs et quotas commerciaux              | Suivi par commercial, équipe et période dans les dashboards                                | H P S     |
| 18  | Produits, lignes d'opportunité et devis PDF  | Montant calculé par lignes, devis envoyé et signé                                          | H P S     |
| 19  | Commentaires en fil sur fiches et notes      | Discussion d'équipe dans le contexte, avec mentions et notifications                       | A H T     |
| 20  | Éditeur de notes riche collaboratif          | Blocs, mentions de fiches, édition simultanée, modèles de notes                            | A F T     |
| 21  | Notetaker IA de réunion (bot)                | Enregistrement, transcription, résumé et mise à jour auto du CRM ; Attio l'intègre         | A H       |
| 22  | Application mobile (ou PWA soignée)          | Consulter et noter après un rendez-vous                                                    | A H P C   |
| 23  | Intégration Slack                            | Alertes de deals, Ask Relay dans Slack (Attio l'a lancé en 2026)                           | A H P     |
| 24  | Permissions par équipe, objet et champ       | Masquer marges ou contrats ; condition pour les comptes de plus de 20 personnes            | A H S     |
| 25  | Notifications email/push et digest quotidien | Rappels de tâches, deals inactifs, mentions                                                | A H P     |

### P2 — vente aux entreprises et extension du marché

| #   | Fonctionnalité                                                                 | Référence |
| --- | ------------------------------------------------------------------------------ | --------- |
| 26  | SSO SAML/OIDC et provisioning SCIM                                             | A H S     |
| 27  | Téléphonie : appel depuis le navigateur, enregistrement, SMS, WhatsApp         | C H P     |
| 28  | Territoires et règles d'attribution des leads (round-robin)                    | H S P     |
| 29  | Processus d'approbation (remise, devis)                                        | H S       |
| 30  | Multi-devises avec taux de change convertis                                    | H P S     |
| 31  | Signature électronique de devis et contrats                                    | H P       |
| 32  | Marketplace d'applications et SDK d'extensions                                 | A H P T   |
| 33  | Conformité RGPD outillée : consentements, droit à l'oubli, export par personne | H P       |
| 34  | Sandbox / environnement de test des workflows                                  | H S       |
| 35  | Tickets / service client lié aux comptes                                       | H S       |

## Ordre de réalisation recommandé

1. **Fondations bloquantes** : étapes de pipeline libres (1), filtres ET/OU (2), corbeille (8), 2FA (10). Elles touchent le schéma et conditionnent workflows, séquences et rapports ; chaque changement passe par une nouvelle migration.
2. **Le CRM qui se remplit seul** : enrichissement (3), création automatique de contacts depuis la synchro (4), suivi d'ouverture (5), extension Chrome (11). C'est l'argument principal d'Attio et folk.
3. **Monétisation et ouverture** : Stripe (9), API publique, clés et webhooks sortants (6).
4. **IA différenciante**, en s'appuyant sur Ask Relay et les skills existants : attributs IA (14), agent de recherche (13), lead scoring (15), recherche sémantique (12).
5. **Productivité commerciale** : prise de rendez-vous (16), objectifs (17), produits/devis (18), commentaires et notes riches (19–20), Slack (23).
6. **Montée en gamme** : permissions fines (24), SSO/SCIM (26), puis téléphonie selon la cible.

## Positionnement

Relay a déjà des fonctions qu'aucun concurrent cité ne propose nativement : engagements avec preuves, contradictions, priorités expliquées, portail client et passage vente → réalisation. Le plus urgent n'est pas d'en ajouter d'autres mais de combler les attentes de base (P0), qui font échouer une évaluation avant même que ces différenciateurs soient vus.

## Sources

- [Attio — tarifs et catalogue par offre](https://attio.com/pricing), [centre d'aide](https://attio.com/help)
- [Attio CRM 2026 review — Stacksync](https://www.stacksync.com/blog/attio-crm-2026-review-features-pros-cons-pricing)
- [Attio Review 2026 — SyncGTM](https://syncgtm.com/blog/attio-review)
- [Attio lance GTM Atlas — Pulse](https://www.pulse.bot/b2b-growth/news/attio-launches-gtm-atlas-shifts-to-upmarket-aifirst-crm-strategy-673a2154-12f3-4467-9112-eee5a788847b/)
- [Pipedrive vs HubSpot 2026 — Capterra](https://www.capterra.com/compare/152373-132666/Pipedrive-vs-HubSpot-CRM)
- [Pipedrive vs HubSpot 2026 — Automation Atlas](https://automationatlas.io/guides/pipedrive-vs-hubspot-2026-comparison/)
- [Alternatives à Twenty — Modern Inbound](https://moderninbound.com/blog/best-twenty-crm-alternatives)
- [folk](https://www.folk.app/), [Close](https://close.com/), [Pipedrive](https://www.pipedrive.com/en/products)
