# Fondamentaux CRM — novembre 2026

Ces fonctionnalités comblent les écarts « P0 » de l’[analyse du 3 novembre 2026](../research/crm-feature-gap-2026-11-03.md). Pour chacune : ce que voit l’utilisateur, où se trouve le code, les garanties de sécurité, la configuration et les limites. Les contrôles SQL figurent dans `supabase/tests/` et sont lancés par `npm run test:performance:db`.

## 1. Étapes de pipeline libres

- **Interface** : `/app/pipelines`. Un pipeline compte de 1 à 20 étapes en cours, librement nommées, réordonnables par glisser-déposer, chacune avec sa probabilité. Gagné (100 %) et Perdu (0 %) restent les deux étapes finales réservées ; elles peuvent être renommées. Le Kanban, les filtres, l’éditeur de fiche, l’import, les workflows et les dashboards suivent les étapes du pipeline concerné.
- **Données** : `pipelines.stages` (liste ordonnée des clés d’étapes en cours). La clé est le premier nom donné à l’étape ; un renommage ne modifie que le libellé (`labels`), donc l’historique et les rapports restent cohérents.
- **Garanties** : `relay_private.validate_pipeline` contrôle noms, doublons, probabilités et refuse de supprimer une étape encore utilisée. `save_pipeline_stages` déplace atomiquement les opportunités d’une étape supprimée vers l’étape choisie, avec contrôle de version. `validate_deal_stage` refuse une étape inconnue du pipeline d’une opportunité.
- **Code** : `src/lib/domain/pipelines.ts`, `src/components/pipelines/`, `src/app/api/[workspace]/pipeline-stages/`, migration `20261105131214_custom_pipeline_stages.sql`.

## 2. Filtres ET/OU imbriqués

- **Interface** : bouton « Filtrer » des listes de fiches. Conditions combinées par Et / Ou, groupes imbriqués sur 3 niveaux, 30 conditions au maximum, enregistrés avec la vue (`filter_tree`). Les anciennes vues à liste plate (`filters`, ET implicite) restent valides.
- **Garanties** : l’arbre est validé par Zod côté serveur (champs et opérateurs autorisés, profondeur, taille), puis traduit en arbre logique PostgREST avec des valeurs toujours entre guillemets et échappées. Les lectures restent soumises à RLS.
- **Limite** : les attributs personnalisés numériques et dates n’offrent pas « supérieur / inférieur » (valeurs JSON comparées en texte).
- **Code** : `src/lib/domain/record-filters.ts`, `src/components/records/filter-builder.tsx`, `src/lib/api/record-query.ts`.

## 3. Enrichissement automatique

- **Entreprises** : à la création ou au changement de domaine, le worker lit la page d’accueil publique du site (titre, description, logo, JSON-LD Organization, réseaux sociaux). Pour un domaine en `.fr` ou une adresse en France, l’Annuaire des entreprises (API publique sans clé) ajoute secteur NAF, effectif INSEE, SIREN, ville et année de création — uniquement en cas de correspondance exacte et unique du nom.
- **Personnes** : rattachement à l’entreprise de leur domaine professionnel (créée au besoin, puis elle-même enrichie). Les messageries gratuites sont ignorées.
- **Garanties** : les résultats sont stockés dans `record_enrichments` (RLS identique aux fiches, y compris lecteurs limités) ; l’enrichissement ne modifie ni la version ni les valeurs saisies d’une fiche. Les appels réseau vérifient la résolution DNS (aucune adresse privée), épinglent l’adresse, suivent au plus 3 redirections sur le même site, avec délai et taille bornés. File avec leases, 3 tentatives.
- **Configuration** : réglage d’espace « Enrichissement automatique » (Paramètres › Général) ; côté worker `FEATURE_ENRICHMENT`, `ENRICHMENT_FR_REGISTRY`. L’hôte `recherche-entreprises.api.gouv.fr` doit être joignable par le worker.
- **Code** : `src/lib/domain/enrichment.ts`, `src/lib/integrations/enrichment.ts`, `src/components/records/enrichment-panel.tsx`.

## 4. Création automatique des contacts

- **Interface** : Paramètres › Emails et calendriers. Chaque utilisateur active la capture pour sa propre boîte ou son agenda ; les administrateurs définissent des domaines exclus.
- **Règles** : à l’arrivée d’un email (expéditeur entrant, destinataires sortants) ou d’un événement (organisateur, participants), une personne est créée si aucune fiche — même à la corbeille — ne porte déjà cette adresse, puis rattachée à l’entreprise de son domaine. Sont exclus : le domaine de l’utilisateur, les adresses automatiques (no-reply, notifications…), les domaines exclus et, comme entreprise, les messageries gratuites. Au plus 10 créations par message. Si l’objet a des champs obligatoires, rien n’est créé.
- **Garanties** : trigger `relay_private.capture_contacts` ; un échec ne bloque jamais la synchronisation.

## 5. Suivi d’ouverture et de clic

- **Périmètre** : emails des séquences. Les emails approuvés par Ask Relay ne sont pas modifiés (leur contenu exact est confirmé).
- **Fonctionnement** : une alternative HTML est ajoutée au texte (pixel `/api/t/o/{jeton}`, liens réécrits vers `/api/t/c/{jeton}/{n}`). La redirection ne mène qu’aux URL enregistrées à l’envoi : aucun jeton ou numéro forgé ne permet de rediriger ailleurs. Rien n’est compté avant l’envoi confirmé ; robots de sécurité et requêtes HEAD sont ignorés. Le lien de désinscription n’est jamais suivi. Compteurs dans l’historique d’envoi des séquences.
- **Configuration** : désactivé par défaut, activé par un administrateur (Paramètres › Emails et calendriers). La CNIL considère que le pixel d’ouverture requiert le consentement du destinataire.
- **Limite** : les ouvertures sont une estimation (préchargement d’images par certaines messageries).

## 6. API REST publique, clés et webhooks

- **API** : `/api/v1` — `me`, `objects`, `records` (liste par curseur, lecture, création, modification avec version, mise à la corbeille), `tasks`, `notes`, `webhooks`. Spécification : `/api/v1/openapi.json`, générée depuis les schémas Zod.
- **Clés** : Paramètres › Développeurs (administrateurs). Secret `zk_…` affiché une seule fois ; seul son SHA-256 est stocké. Permissions par scope, expiration (30 j, 90 j, 1 an ou jamais), révocation immédiate, 120 requêtes par minute. Une clé agit avec l’identité de son créateur via le rôle PostgreSQL `zyliad_api` (sans `BYPASSRLS`) : RLS, triggers et validateur de fiches s’appliquent comme dans l’application. Elle devient invalide si son créateur perd son accès en écriture.
- **Écritures** : en-tête `Idempotency-Key` obligatoire. Rejouer renvoie la même réponse ; réutiliser la clé avec un autre corps renvoie 409.
- **Webhooks** : événements `record.*`, `task.*`, `note.*` (jamais les notes privées), filtrables par objet. Outbox privée, leases, 8 tentatives à délai croissant, désactivation après 20 événements non livrés, journal de 30 jours. Signature `Zyliad-Signature: t=…,v1=HMAC-SHA256(secret, "t.corps")`. Livraison au moins une fois : dédupliquer sur `id`. Destinations HTTPS publiques uniquement (DNS vérifié et épinglé, pas de redirection).
- **Configuration** : les secrets de signature sont chiffrés avec `INTEGRATION_ENCRYPTION_KEY`, nécessaire au web et au worker.

## 7 et 8. Historique des valeurs et corbeille

- **Historique** : onglet « Modifications » de chaque fiche. Auteur, date, valeur avant et après, par champ, y compris les attributs personnalisés ; calculé depuis l’audit existant (`record_field_history`, RLS de l’audit).
- **Corbeille** : `/app/trash`. Supprimer une fiche la place à la corbeille (auteur et date enregistrés). Les membres restaurent ; les administrateurs suppriment définitivement après la saisie de « SUPPRIMER ». Les fiches liées à des preuves (documents, engagements, réunions…) restent à la corbeille. Purge automatique après 30 jours par le worker.

## 9. Facturation Stripe

- **Interface** : Paramètres › Facturation (administrateurs) : offre, sièges, renouvellement, alertes de paiement, Checkout et portail client Stripe (factures, moyen de paiement, changement d’offre, résiliation).
- **Garanties** : l’état n’est écrit que depuis des webhooks Stripe dont la signature est vérifiée sur le corps brut ; chaque événement est appliqué une fois et jamais par-dessus un plus récent. Un client Stripe par espace. Facturation par siège (propriétaires, administrateurs, membres ; lecteurs gratuits), quantités réalignées par le worker avec prorata. Aucune donnée de carte n’est traitée par Zyliad.
- **Configuration** : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS`, `STRIPE_AUTOMATIC_TAX` (web) ; clé et prix aussi sur le worker. Endpoint webhook : `/api/billing/webhook`, événements `checkout.session.completed` et `customer.subscription.*`. Activer le portail client dans le tableau de bord Stripe.
- **Limite** : l’offre n’active ni ne bloque encore de fonctionnalités.

## 10. Double authentification

- **Interface** : Paramètres › Sécurité. Activation TOTP (QR code ou clé manuelle) avec n’importe quelle application d’authentification ; à la connexion, une étape demande le code à 6 chiffres.
- **Application** : une session dont le compte a un facteur vérifié mais qui n’est pas `aal2` est refusée par le proxy, les layouts, toutes les routes API, le portail et le consentement MCP.
- **Exigence d’espace** : un administrateur (lui-même en `aal2`) peut exiger la 2FA. Elle est appliquée dans `relay_private.has_role` et `member_workspaces`, donc dans toutes les politiques RLS : sans second facteur, l’espace reste invisible, même par accès direct à PostgREST. Les membres concernés voient un écran d’activation au lieu de l’onboarding.
- **Configuration** : MFA TOTP activée dans Supabase Auth (activée par défaut). Un facteur perdu se réinitialise depuis le tableau de bord Supabase après vérification d’identité.

## Worker

`src/lib/jobs/maintenance.ts` exécute sur chaque réplique des tâches idempotentes (leases et `SKIP LOCKED`) : purge de la corbeille, livraison et rétention des webhooks, enrichissement, réalignement des sièges Stripe. `FEATURE_WORKER_MAINTENANCE=false` les désactive toutes.
