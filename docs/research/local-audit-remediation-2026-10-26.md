# Corrections de l’audit local du 26 octobre 2026

Base : `dc66b86f8d125f49be62dbf8525c4e479ac5d04c`. Ce suivi traite les constats fournis, sans affirmer une certification générale de production.

## Corrections

- Next.js et eslint-config-next 16.4.3, Zod 4.6.7, lockfiles alignés. Les audits npm complets de l’application et de production du paquet MCP ne signalent plus de vulnérabilité au moment du contrôle. Les dépendances transitives de développement fast-uri, undici et Vite ont également été mises à jour dans leurs plages compatibles ; la CI vérifie désormais les avis élevés/critiques de l’application et du paquet. Avis : [Next images](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), [use cache](https://github.com/advisories/GHSA-673q-mjm6-r5xr), [Zod collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). Aucune exploitation dans Relay n’a été prouvée ; la mise à niveau retire les versions affectées.
- Le paquet MCP optionnel passe en 1.1.1 ; son archive, manifeste, verrouillage, commandes d’installation et tests sont alignés. Les anciennes archives restent immuables. Les utilisateurs d’un ancien pont doivent relancer l’installateur courant pour migrer vers HTTP natif ; le serveur ne peut pas mettre à jour leur poste.
- CSP appliquée avec nonce de 256 bits, transmission au rendu dynamique et conservation lors des renouvellements de cookies/redirections. Voir [politique et compromis de cache](../operations/security-headers.md). Scripts inline sans nonce et eval bloqués en production ; styles inline conservés pour les composants.
- Le test de répertoire utilise un vrai QueryClientProvider et un mock partiel. La comparaison des sources et de l’archive MCP normalise uniquement CRLF/LF.
- Dashboard de démonstration : débordement de 9 px reproduit à 390 px, causé par « Ajouter un widget » dans une colonne de 44 px. Les actions mobiles peuvent maintenant se répartir sur plusieurs lignes sans dépasser ; règles desktop conservées.
- Liens secondaires de connexion espacés et disposés en blocs.
- Formulaire public : réutilisation du client HTTP existant avec timeout, messages français et masquage des erreurs réseau/5xx ; bouton de reprise du chargement. Une reprise d’envoi conserve la saisie et l’identifiant de tentative, sans rejouer automatiquement une écriture.

## Vérifications

- Suite unitaire complète finale : 742 tests réussis dans 105 fichiers, après toutes les mises à jour de dépendances.
- TypeScript et build Next.js de production réussis ; ESLint : zéro erreur, 11 avertissements existants. Structure et Prettier vérifiés.
- Scanner de secrets source exécuté ; scanner de frontières de bundles : 139 artefacts, aucune détection selon ses règles.
- Chromium sur le vrai build de production : login, dashboard, contacts et formulaire invalide à 320/390/768/1440 px (16 combinaisons), aucune erreur de page ou débordement horizontal. Espacement des liens desktop contrôlé. Bootstrap des scripts avec nonce, rotation entre réponses et injection HTML de script sans nonce rejetée par CSP. Une exécution privilégiée depuis DevTools n’est pas une simulation valide d’injection HTML et n’est pas une frontière de sécurité du propriétaire du navigateur.
- PostgreSQL local jetable : suites de permissions/visibilité, accès CRM, portails, invitations, sauvegarde, OAuth/intégrations et MCP réussies, y compris isolation tenant, rôles, refresh/replay, confirmations et idempotence.

## Limites de validation

Le bootstrap PostgreSQL standard échoue sur `pg_jsonschema`, requis par les deux dernières migrations Record Studio. Les suites SQL ci-dessus couvrent donc les migrations antérieures, pas la nouvelle fonctionnalité Record Studio. Les extensions réelles et la chaîne CI doivent être vérifiées sur une image PostgreSQL Supabase appropriée. Aucun substitut permissif de validation JSON n’a été installé pour faire passer les contrôles.

Les sessions sont couvertes par les tests existants du SDK SSR contre une fixture Auth HTTP, pas par un parcours complet avec un véritable service Supabase Auth et deux comptes clients. Aucun compte réel, aucune donnée utilisateur, aucun e-mail fournisseur et aucune charge de production n’ont été employés. Le TLS/CDN et les en-têtes du domaine final nécessitent un contrôle après déploiement. Aucune nouvelle migration applicative n’est nécessaire pour ces corrections.
