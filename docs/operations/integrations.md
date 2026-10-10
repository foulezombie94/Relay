# Gmail, Google Calendar, Outlook, Outlook Calendar et Zapier

## Google et Microsoft : configuration obligatoire

Les boutons fonctionnent avec vos propres applications OAuth. Aucun mot de passe Gmail/Outlook n’est demandé ni stocké dans Zyliad. Le consentement se déroule chez le fournisseur. Les quatre services ont des autorisations distinctes ; les calendriers restent en lecture seule.

Dans .env.local ou chez votre hébergeur, renseignez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, APP_URL et INTEGRATION_ENCRYPTION_KEY (clé AES de 32 octets en base64). La clé de chiffrement existante doit être conservée avec les sauvegardes. Ne la remplacez pas quand vous ajoutez les identifiants OAuth. Ne publiez aucun secret ni .env.local.

APP_URL doit être une origine HTTPS en production. En local, le callback conserve votre origine localhost/127.0.0.1 afin de garder les cookies de session.

### Google

1. Créez un projet Google Cloud puis activez Gmail API et Google Calendar API.
2. Configurez Google Auth Platform : nom de l’application, audience et utilisateurs test.
3. Créez un client OAuth de type Application Web.
4. Autorisez les URI suivantes pour votre origine APP_URL :
   - /api/oauth/gmail/callback
   - /api/oauth/google-calendar/callback
5. En local, inscrivez les URI complètes pour http://localhost:3000 ET http://127.0.0.1:3000.
6. Renseignez client ID et secret côté serveur, redémarrez, puis connectez chaque service.

Gmail demande openid, email, gmail.readonly et gmail.send. Calendar demande openid, email et calendar.events.readonly. Le profil est obtenu auprès de Google avec le jeton et une adresse vérifiée. Une autorisation partielle est refusée pour le service concerné.

L’application Google en mode Test doit inclure les comptes test. Les scopes Gmail sont soumis aux règles de validation Google pour une distribution en production. [Scopes officiels](https://developers.google.com/workspace/gmail/api/auth/scopes).

### Microsoft

1. Dans Microsoft Entra, créez une inscription d’application. Pour Outlook personnel et Microsoft 365, choisissez les comptes professionnels et personnels.
2. Ajoutez une plateforme Web (pas SPA) et les URI complètes :
   - APP_URL/api/oauth/outlook/callback
   - APP_URL/api/oauth/outlook-calendar/callback
3. Ajoutez les permissions Microsoft Graph déléguées User.Read, Mail.Read, Mail.Send et Calendars.Read. Zyliad ne demande les permissions mail que pour Outlook, et le calendrier que pour Outlook Calendar.
4. Créez un secret client, conservez sa valeur côté serveur et surveillez son expiration.
5. MICROSOFT_TENANT=common prend en charge les comptes personnels et professionnels. organizations, consumers ou un identifiant de tenant sont aussi acceptés.
6. Connectez les services séparément. Une organisation peut demander le consentement de son administrateur.

[Flux officiel Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) et [flux officiel Google](https://developers.google.com/identity/protocols/oauth2/web-server).

### Protection et comportement

Départ OAuth en POST, contrôle d’origine, PKCE S256, state aléatoire chiffré dans un cookie HttpOnly/SameSite et enregistré sous empreinte en base. Le cookie est limité au callback ; le state est à usage unique, lié à la session Zyliad, au service et au workspace, et expire après dix minutes. Le refus du fournisseur retourne un message dans Intégrations et efface le cookie.

Les jetons sont chiffrés AES-256-GCM dans relay_private. Le renouvellement conserve le refresh token lorsqu’il n’est pas remplacé. Une réservation temporaire et une révision serveur évitent les renouvellements concurrents et empêchent une réponse tardive de rétablir un service déconnecté.

Chaque import est manuel et limité à 25 messages ou 25 événements des 30 prochains jours, sur le calendrier principal. Il ne représente pas une synchronisation incrémentale complète. Les imports sont privés à leur utilisateur ; leurs identifiants stables évitent les doublons. L’envoi est manuel et confirmé, sans reprise automatique d’un résultat ambigu.

Déconnecter supprime les jetons locaux et annule le consentement en cours. Les imports sont conservés. Pour révoquer aussi le consentement fournisseur, utilisez les paramètres du compte Google/Microsoft. Les anciens connecteurs combinés google/microsoft ont été déconnectés lors de la migration afin de demander un nouveau consentement par service.

## Zapier

L’intégration utilise Webhooks by Zapier ou une intégration privée sur la plateforme Zapier avec authentification par clé API. Ce n’est pas une application Zyliad publiée dans le catalogue Zapier ni une connexion OAuth Zapier.

Un administrateur crée une clé dans Intégrations. Elle est affichée une fois, conservée uniquement sous empreinte SHA-256, limitée à son workspace, valable 90 jours et révocable. Par défaut, elle permet de lire les champs standards des personnes, entreprises, opportunités et tâches. La création de fiches et tâches peut être autorisée explicitement. Aucun accès aux notes, documents, messages, attributs personnalisés ou sauvegardes privées.

L’API exige SUPABASE_SECRET_KEY côté serveur. Son RPC n’est exécutable que par service_role et contrôle la clé, l’expiration, la révocation, le rôle administrateur courant, les permissions, la limite de 60 requêtes/minute et l’idempotence dans une transaction.

### Configuration d’un Zap

Votre Zyliad doit être hébergé en HTTPS et accessible à Zapier ; localhost n’est pas joignable depuis Zapier. Dans Webhooks by Zapier → Custom Request, ajoutez Authorization: Bearer VOTRE_CLE. Ne mettez jamais la clé dans une URL.

- Vérifier la connexion : GET https://votre-zyliad/api/zapier/auth.
- Lire : GET https://votre-zyliad/api/zapier?resource=people&page=0. Ressources : people, companies, deals, tasks. Tableau de 100 lignes maximum, tri par création puis identifiant ; page commence à zéro. Les déclencheurs d’une intégration privée peuvent utiliser ces identifiants stables.
- Créer : POST https://votre-zyliad/api/zapier avec Content-Type: application/json et Idempotency-Key: IDENTIFIANT_EVENEMENT. Conservez la même clé pour les reprises d’un événement. Une même clé avec un contenu différent est refusée.

Exemple :

```json
{
  "resource": "people",
  "values": { "display_name": "Contact exemple", "email": "contact@example.com" }
}
```

Pour tasks, values accepte title, description, record_id, due_date ISO avec fuseau et priority low/normal/high. La fiche liée doit appartenir au workspace et être active. Les fiches ayant des attributs personnalisés obligatoires doivent être créées dans Zyliad ; l’API ne contourne pas ces obligations.

Réponses : 401 clé invalide/expirée/révoquée ou administrateur retiré ; 403 permission absente ; 409 Idempotency-Key réutilisée ; 429 limite atteinte ; 400 données invalides.

[Documentation des requêtes Zapier](https://help.zapier.com/hc/en-us/articles/44391646192397-Ways-to-make-API-requests-in-Zapier) et [authentification des intégrations privées](https://docs.zapier.com/integrations/build/auth).

## Vérifications ciblées

Six nouveaux tests couvrent les permissions séparées, le consentement incomplet, les origines, le chiffrement/tamper et le renouvellement OAuth (refresh token conservé, déconnexion respectée). Les six tests de doublons existants passent également.

supabase/tests/service-connections.sql vérifie sous rôles authenticated/service_role le state à usage unique, l’isolation, les versions et annulations OAuth, l’accès réservé au gateway Zapier, l’idempotence, les permissions, le débit, la révocation et l’expiration. Toutes les fixtures sont annulées par ROLLBACK.

Les connexions réelles Google/Microsoft nécessitent les identifiants et le consentement utilisateur ; elles ne sont pas déclarées testées avant ces étapes.

## Catalogue Apps dans Zyliad

La page `/app/integrations` présente les sept services OAuth existants et Zapier, avec recherche et catégories Communication, Calendars, Calling & meetings et Automations. Installed apps affiche les connexions actives du compte ; View all filtre le catalogue. Pour Zapier, seuls les administrateurs peuvent consulter les clés : le badge Installed exige une clé non révoquée et non expirée visible par l’administrateur.

Un clic sur une carte ou son logo ouvre une fiche partageable via `?app=gmail` (ou l’identifiant du fournisseur). La fiche comporte l’éditeur Zyliad, la catégorie, les ressources officielles, une galerie d’aperçus illustrés, Overview, How it works et Configure. Install app conserve le POST OAuth existant et la redirection vers le fournisseur. Configure conserve la synchronisation manuelle, la reprise, l’option automatique et la déconnexion. Zapier utilise le formulaire de clés existant. Les droits, le chiffrement et les callbacks ne changent pas. Les vues intégrées dans Paramètres conservent leur périmètre de fournisseurs.

Les badges sont issus des API, pas d’une simulation. Les aperçus sont explicitement illustrés ; aucune connexion ChatGPT, Slack ou autre service non implémenté n’est annoncée.

### Logos et marque

`src/components/integrations/app-logo.tsx` référence les fichiers d’origine des fournisseurs et les affiche sans recoloration, filtre, découpage ni déformation. Les tuiles gardent un fond blanc en mode clair et sombre. Les logos Microsoft Outlook et Teams sont les SVG du CDN officiel Microsoft SharePoint (`static2.sharepointonline.com/files/fabric/assets/brand-icons/product/svg/`). Gmail, Calendar et Meet utilisent les PNG du CDN Google `www.gstatic.com/images/branding/product/2x/` ; aucun SVG n’est redessiné pour les remplacer. Zoom et Zapier utilisent les fichiers de leurs pages officielles [Zoom Media Kit](https://www.zoom.com/en/about/media-kit/) et [Zapier Press](https://zapier.com/press).

Les fichiers sont chargés directement depuis leurs CDN : cet environnement ne permet pas de télécharger ces domaines. Next Image est utilisé avec `unoptimized` pour conserver le fichier original et éviter une dépendance à leur accès depuis le serveur. Si le CDN est indisponible, des initiales neutres remplacent le logo. Les noms des produits et les logos restent ceux de leurs fournisseurs ; l’éditeur de l’intégration est Zyliad. Les SVG sont privilégiés lorsqu’un fichier officiel adapté est disponible, les PNG d’origine sont conservés dans les autres cas.

Le changement de nom visible concerne le CRM, la landing, l’inscription, l’aide, les portails, l’assistant et les noms des exports. Les identifiants techniques existants (variables RELAY, cookies, clés de stockage, routes, tables, RPC et connexions déployées) restent compatibles.
