# Activation des intégrations

OpenAI : renseigner OPENAI_API_KEY. Le contexte est borné aux fiches/notes/réunions récentes et filtré par RLS ; aucune source externe n’est synchronisée automatiquement.

Google : créer un client OAuth de type application web, activer Gmail API et Calendar API, ajouter APP_URL/api/oauth/google/callback et les scopes configurés dans src/lib/integrations/oauth.ts. Les scopes Gmail peuvent nécessiter validation fournisseur.
Microsoft : enregistrer une application web dans Entra, ajouter APP_URL/api/oauth/microsoft/callback, les permissions déléguées User.Read, Mail.Read, Mail.Send, Calendars.Read et offline_access, puis client ID et secret. L’endpoint organizations vise les comptes d’entreprise.
Les jetons sont chiffrés avec INTEGRATION_ENCRYPTION_KEY et stockés dans un schéma privé. Une sauvegarde des données nécessite aussi la conservation sécurisée de cette clé.

La synchronisation est manuelle et bornée ; ce n’est pas un moteur de synchronisation incrémentale intégrale. Les conversations importées sont privées à leur utilisateur. La déconnexion détruit les jetons locaux sans effacer les éléments déjà importés et sans révoquer le consentement chez le fournisseur. Révocation fournisseur à effectuer dans les paramètres du compte externe.

Documents des protocoles utilisés : https://developers.google.com/identity/protocols/oauth2/web-server et https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow.
