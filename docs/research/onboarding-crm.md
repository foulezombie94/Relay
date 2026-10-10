# Inscription et onboarding Relay

## Références étudiées

Analyse des pages publiques officielles, sans création de comptes chez les autres CRM :

- [Attio — connexion](https://attio.com/help/reference/account-settings/signing-into-attio) : parcours court, email ou Google, choix de l’espace. Attio utilise un mot de passe temporaire envoyé par email ; Relay conserve son authentification native par email et mot de passe.
- [Attio — synchronisation](https://attio.com/help/reference/email-calendar/email-and-calendar-syncing) : connexion des échanges après l’accès au compte, plutôt qu’un prérequis à l’inscription.
- [HubSpot — configuration initiale](https://knowledge.hubspot.com/get-started/set-up-your-account) : compte personnel, paramètres de l’organisation, équipe et intégrations.
- [Pipedrive — inscription](https://www.pipedrive.com/en/register/) : entrée courte et configuration progressive.

L’interface Relay reprend ces principes avec sa propre identité : blanc, typographie sobre, formulaire étroit, progression visible et aperçu du produit explicitement fictif. Les polices existantes sont servies localement. Sur mobile, le formulaire occupe l’écran et l’aperçu décoratif est masqué.

## Parcours implémenté

1. `/signup` : email, puis mot de passe avec contrôle de visibilité. Les anciens liens `/login?mode=signup` restent fonctionnels. Les invitations conservent `/invite` comme destination.
2. `/onboarding` : profil personnel enregistré par Supabase Auth. Un nouvel invité complète aussi son profil avant d’ouvrir l’espace déjà rejoint.
3. Premier espace : nom et fuseau horaire. Création transactionnelle du workspace, de son propriétaire et des objets Personnes, Entreprises et Opportunités.
4. Espace prêt : ouvrir l’accueil, connecter Gmail/Outlook depuis les intégrations, ouvrir l’import CSV ou inviter l’équipe depuis ses paramètres. Les actions sont facultatives et respectent les rôles affichés ; les API et RLS restent les contrôles d’accès effectifs.

L’étape de vérification email est volontairement absente, conformément à la demande. Le projet Supabase utilise déjà `mailer_autoconfirm: true` : aucun changement de configuration Auth n’a été nécessaire. Sans session confirmée par le SDK, le formulaire affiche une erreur et ne simule jamais une connexion réussie. Aucun bouton Google de connexion n’est affiché, ce fournisseur Auth n’étant pas activé sur le projet.

## Enregistrement et reprise

- Session vérifiée côté serveur avant tout accès à l’onboarding et toute création.
- Validation du profil, de l’espace, du fuseau et de la clé de tentative ; origine vérifiée pour le POST.
- RPC invoker public, implémentation privée avec `search_path` vide, `auth.uid()` et grants explicites. Aucun accès anonyme et aucun propriétaire fourni par le navigateur.
- Verrou transactionnel par utilisateur et clé de tentative stable : plusieurs appels ne créent pas plusieurs premiers espaces. Une réponse perdue conserve la clé ; un rechargement retrouve le workspace enregistré.
- Lecture de la membership après la création avant d’afficher le succès.
- Mot de passe jamais enregistré dans le stockage applicatif. Les clés de tentative ne stockent pas les données du formulaire en clair.
- La métadonnée `relay_onboarding_pending` pilote uniquement la présentation et la reprise. Elle n’accorde aucun rôle ou droit d’accès.
- Aucune synchronisation ou invitation n’est annoncée avant sa réalisation dans le parcours existant.

## Validation

- Tests React : validation, session réellement confirmée, erreurs réseau, doubles soumissions, reprise, nouveau membre invité, droits visibles et finalisation confirmée.
- Tests API : origine, session révoquée/absente, panne Auth, paramètres invalides, conflits et réponse vide.
- Suite SQL `supabase/tests/onboarding.sql` : permissions anonymes, `auth.uid`, création atomique, retry, absence de doublons et isolation entre utilisateurs. Incluse dans le runner PostgreSQL de la CI, avec deux transactions concurrentes qui doivent produire un seul espace complet.
- Vérification Chromium sur la version construite : inscription, profil, création réelle via PostgreSQL local, réponse réseau perdue, reprise après rechargement, import CSV et écrans 1440 px / 390 px. Supabase Auth est simulé uniquement sur localhost ; aucune identité de test n’est créée en production.
- Contrôles du dépôt : structure, TypeScript, lint, tests, build et Prettier.

Une vérification navigateur contre la production avec une identité réelle reste distincte du test local. La connexion effective de Gmail/Outlook dépend toujours des autorisations OAuth et des fournisseurs configurés.

## Mise en place Supabase

Migration additive `20261010150117_onboarding_workspace.sql` appliquée au projet de production APP TQT. Le nom du fichier correspond à la version attribuée par le MCP ; le SQL testé est inchangé. Vérification en lecture seule des grants, du `search_path` et du wrapper invoker après application. Les tables et données existantes ne sont pas modifiées.

Les advisors ne signalent pas la nouvelle fonction. Ils conservent des notices sur les tables privées volontairement inaccessibles et des alertes concernant six fonctions publiques existantes et la protection contre les mots de passe compromis : [fonctions definer](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protection des mots de passe](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Ce contrôle ne constitue pas une nouvelle certification de sécurité de l’ensemble du CRM.
