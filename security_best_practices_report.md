# Revue de sécurité ciblée — Relay, 10 octobre 2026

Les chemins audités utilisent Next.js 16, React 19, TypeScript, Supabase Auth et PostgreSQL avec RLS. Les corrections portent sur la séparation des environnements, les écritures CRM, les formulaires, les erreurs et leurs confirmations. Les deux skills demandés, `typescript-expert` et `security-best-practices`, ont été utilisés, ainsi que les instructions Supabase et les références du plugin Codex Security. Les skills sont conservés dans le dossier personnel de Codex, hors du dépôt de l’application.

Il s’agit d’une revue manuelle du code et des contrôles Supabase. Le workflow automatisé Codex Security n’a pas pu être lancé : ses outils de lancement ne sont pas exposés dans cette session. Ce document ne constitue pas un rapport issu de ce scanner, ni une certification exhaustive du dépôt.

Le code dispose désormais de garde-fous et de tests. La mise en production reste à valider : le seul projet Supabase accessible, `duhnmyxpxizxbxlhbtzs` (« APP TQT »), est la production ; l’utilisateur a confirmé qu’aucun projet TEST distinct n’existe.

## Priorité élevée — séparation et intégrité

### 1. Configuration sans protection explicite du projet de production — corrigé dans le code

**Impact :** une configuration de développement reprenant les identifiants de production pouvait envoyer les écritures de développement vers ce projet.

**Cause :** l’exemple local désignait la production, les clients consommaient directement les variables et les scripts SQL acceptaient des destinations arbitraires ou les credentials génériques.

**Correction et preuves :** `src/lib/supabase/config.ts:11` lie explicitement l’environnement, l’URL, la référence choisie et celle de production. Les clients serveur/navigateur, le proxy, le worker via son client admin et le build utilisent ce contrôle. `src/instrumentation.ts:3` vérifie également la configuration au démarrage. `scripts/tests/database-target.ts:1` exige une base locale jetable et rejette les paramètres pouvant remplacer l’hôte. Les sept lanceurs SQL utilisent ce garde-fou ; les exemples locaux ne désignent plus la production.

**Validation :** configurations production/preview compatibles et incompatibles, variables absentes, clé privilégiée publique, processus de développement/test visant la production et destinations SQL distantes refusées. Les tests SQL se sont exécutés seulement sur loopback. La validation réelle entre deux projets reste bloquée par l’absence de projet TEST ; les variables déployées, domaines, webhooks et destinations OAuth n’ont pas été certifiés.

### 2. Confirmation insuffisante des écritures et reprises incertaines — corrigé sur les flux audités

**Impact :** l’interface pouvait annoncer une sauvegarde sans vérifier la ligne retournée, puis perdre la saisie ou dupliquer une création après perte de la réponse.

**Cause :** le helper frontend considérait toute réponse HTTP réussie comme un enregistrement et ne conservait pas de clé de tentative ni de brouillon.

**Correction et preuves :** `src/components/providers/data-provider.tsx:51` valide avant envoi, bloque les soumissions concurrentes et confirme l’identifiant avant succès. `src/lib/api/save-attempt.ts:12` conserve une clé UUID de création par contenu et périmètre ; le contenu n’est pas stocké dans la clé. `src/app/api/[workspace]/[resource]/route.ts:110` réutilise seulement une création déjà confirmée dans le même espace avec les mêmes valeurs. Les PATCH conservent leurs contrôles de version et refusent zéro ligne ou un identifiant différent. `src/components/ui.tsx:202` préserve le brouillon pendant l’envoi, y compris lors d’un rechargement ; `src/components/ui/editor-draft.tsx:18` valide les données restaurées, les limite à l’onglet et à 24 heures, et les supprime à la confirmation ou à la déconnexion/changement de compte.

**Validation :** tests React du formulaire et du provider, routes API avec résultats vides/corrompus, reprise de création après réponse perdue et changement des valeurs, plus `supabase/tests/crm-save-reliability.sql` contre PostgreSQL réel. Les transactions existantes d’import/outbox et les migrations appliquées sont conservées.

**Limites :** une création d’espace via son RPC conserve le blocage des doubles clics mais ne possède pas la clé de reprise des ressources CRM. Une mise à jour dont la réponse est perdue exige un rechargement si sa version a changé. Les brouillons ne constituent pas une sauvegarde durable : si le stockage navigateur est bloqué, la saisie reste dans le formulaire, mais sa restauration après rechargement n’est pas garantie. Les mots de passe ne sont pas persistés par ce mécanisme.

## Priorité moyenne — disponibilité et informations internes

### 3. Erreurs réseau et payloads malformés mal distingués — corrigé

**Cause :** les mutations partageaient un helper sans délai limite ; certains formulaires Auth affichaient directement les erreurs SDK. Les enveloppes PATCH et JSON malformés pouvaient provoquer une exception avant validation.

**Correction et preuves :** `src/lib/api/request.ts:14` distingue réseau, timeout, réponse invalide et erreur applicative, et ne relance pas automatiquement les écritures. `src/lib/supabase/fetch.ts:1` borne les appels SDK à 25 secondes. `src/lib/supabase/session.ts:9` masque les messages Auth internes. `src/lib/api/context.ts:136` transforme un JSON malformé en 400 ; `src/lib/api/context.ts:107` distingue contraintes, autorisations, conflits et indisponibilité. `src/lib/api/context.ts:73` ajoute un identifiant aux erreurs serveur, conservé dans des logs sans contenu CRM ni secrets. Les hooks Sentry existants et leurs filtres sont conservés.

**Validation :** réseau interrompu, timeout pendant lecture de réponse, réponse non JSON, serveur 500, permissions 403, conflit 409 et indisponibilité 503. Les tests navigateur vérifient aussi une interruption Auth avec saisie conservée et absence d’exception JavaScript non gérée.

### 4. Dépendance transitive UUID signalée par npm — corrigé

**Preuve :** l’audit npm initial signalait `uuid <11.1.1` et son parent ExcelJS pour [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). L’avis concerne les variantes v3/v5/v6 avec buffer explicite ; ExcelJS appelle uniquement v4 dans le chemin inspecté. Aucune exploitation de cet avis par le CRM n’a été démontrée.

**Correction :** `package.json:60` remplace uniquement la dépendance UUID d’ExcelJS par `11.1.1`, qui conserve l’export CommonJS v4 utilisé. ExcelJS n’est pas rétrogradé.

**Validation :** `src/lib/api/xlsx-budget.test.ts` écrit et importe un véritable classeur avec mise en forme conditionnelle étendue, exerçant cet appel v4. L’audit npm final des dépendances de production ne signale aucune vulnérabilité connue. Ce résultat ne prouve pas l’absence de vulnérabilités inconnues.

### 5. Protection Supabase contre les mots de passe compromis désactivée — action externe restante

**Preuve :** l’advisor sécurité Supabase de production signale `auth_leaked_password_protection`. Cette configuration Auth ne se corrige pas par une migration SQL ; aucun outil permettant de modifier cette configuration n’est disponible dans cette session.

**Action :** activer la protection dans les réglages Auth si l’offre le permet, puis vérifier le comportement sur TEST. Référence : [sécurité des mots de passe Supabase](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Contrôles conservés et résultats Supabase

- Les 43 tables du schéma public ont RLS activée ; aucun accès public de bucket ni vue publique n’a été trouvé dans les contrôles effectués.
- Les 33 informations concernant des tables privées sans policy correspondent au refus d’accès des clients dans `relay_private`.
- Les six avertissements sur des fonctions `SECURITY DEFINER` accessibles aux utilisateurs connectés ont été examinés : les contrôles d’identité, d’espace, de rôle/capacité et le `search_path` vide sont conservés ; `anon` ne peut pas les exécuter. Ils ne démontrent pas une vulnérabilité par leur seule présence.
- Aucun contournement RLS, retrait de confirmation métier, changement de lease ou modification de migration appliquée n’a été introduit.
- La démonstration demeure une page explicitement fictive en lecture seule, sans client DB ni écriture dans les tables CRM.

Le détail des scénarios et des vérifications figure dans [le rapport de fiabilité](docs/history/crm-reliability-audit-2026-10-10.md). Les contrôles de déploiement restant à réaliser sont décrits dans [le guide d’exploitation](docs/operations/deployment.md).
