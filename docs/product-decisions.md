# Relay CRM

Application B2B généraliste. Supabase remplace le choix Prisma/auth/stockage du brief. Stripe et les paiements sont exclus à la demande du propriétaire. Les connexions externes restent conditionnées à des accès réels.

Design : outil de travail précis, fond blanc #ffffff, navigation gris froid #f6f7f9, texte encre #202631, accent cobalt #4169e1, statut turquoise #168a74, frontières #e8ebef. Typographie de travail système, identité Relay en lettrage resserré ; valeurs tabulaires. Signature : contexte relationnel et engagements regroupés dans la fiche, plutôt que cartes marketing. Tables et panneau latéral sur desktop, fiches compactes sur téléphone. L'accent reste réservé aux actions et sélections.

Architecture : Next.js TypeScript, modules métier, Supabase Auth/Postgres/Storage, autorisations PostgreSQL, contrats Zod, traitements reprenables dans une file Postgres. API et worker séparables. Aucun service_role dans le navigateur. Pas de données réelles inventées, pas d'envoi simulé présenté comme réussi.

Conserver le cahier des charges complet et un état honnête par capacité dans feature-coverage.md. Les clients mobiles et les intégrations Enterprise font partie du périmètre à réaliser, et ne seront pas déclarés validés via un simple responsive.
