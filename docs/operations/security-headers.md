# Politique de sécurité du navigateur

Le proxy crée un nonce aléatoire de 256 bits pour chaque requête, remplace tout en-tête CSP fourni par le client et transmet la même politique au rendu Next.js et au navigateur. Les scripts de production exigent ce nonce ; `unsafe-eval` est réservé au développement. Les retours anticipés, formulaires publics, rotations de cookies et redirections de connexion conservent cette frontière.

Le layout racine attend `connection()` : les pages HTML publiques sont également rendues à la requête, afin que leur nonce corresponde à la réponse. Cela abandonne leur pré-rendu statique ; les ressources `/_next/static` conservent leur cache. Les réponses traitées par le proxy restent privées et non stockables.

Les styles inline restent nécessaires à React, Radix et aux graphiques. Les images HTTPS permettent les logos et favicons externes des entreprises. Les connexions navigateur sont limitées à l'origine de l'application, l'origine Supabase validée et l'origine d'ingestion Sentry configurée. Les polices sont locales ; objets, frames et inclusion de l'application dans une iframe sont interdits. Le HMR local est permis uniquement en développement.

Après modification, vérifier avec un build de production : en-tête `Content-Security-Policy`, nonce différent sur deux réponses, bootstrap/hydratation fonctionnels, navigation client, styles et absence de violation inattendue. Un script inline ajouté sans nonce doit être bloqué. Vérifier également les réponses du domaine déployé : une surcouche CDN peut modifier les en-têtes. Cette défense ne remplace ni RLS ni les permissions serveur.
