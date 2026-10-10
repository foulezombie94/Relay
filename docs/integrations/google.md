# Google — adapter partagé

Documentation officielle consultée le **10 octobre 2026**, avant les endpoints et scopes de cet adapter. Utiliser les mêmes applications OAuth pour Calendar, Gmail, Drive, Sheets et Meet ; ne demander que les permissions de la fonctionnalité activée. Le consentement supplémentaire Google conserve les fonctionnalités précédentes du même compte ; un changement de compte détruit leurs anciens curseurs, mappings et abonnements locaux.

## Authentification et permissions

Authorization Code, client confidentiel serveur, PKCE S256, `state` aléatoire à usage unique, `access_type=offline`, `include_granted_scopes=true`, `prompt=consent select_account`. Un refresh token est requis pour la synchronisation différée. `openid email` identifient le compte via userinfo et son email vérifié.

| Fonctionnalité                    | Scopes additionnels                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| Calendar lecture                  | `calendar.calendarlist.readonly`, `calendar.events.readonly`, `calendar.events.freebusy` |
| Calendar écriture / Meet P0       | `calendar.events`                                                                        |
| Gmail lecture                     | `gmail.readonly`                                                                         |
| Gmail brouillons et envoi activés | `gmail.compose`, qui autorise aussi l’envoi ; pas de scope `gmail.send` redondant        |
| Drive / Sheets                    | `drive.file`, uniquement les fichiers créés ou explicitement partagés avec l’application |

Les scopes Workspace utilisent le préfixe `https://www.googleapis.com/auth/`. Drive/Sheets n’importent pas tout un Drive ; un sélecteur de fichiers Google autorisé reste nécessaire dans l’UX finale. Les scopes Gmail sont restreints : la vérification OAuth Google et, selon le stockage/transfert de données, une évaluation de sécurité peuvent être exigées. Les tokens d’une application externe en mode Testing peuvent expirer après sept jours ; ce mode ne valide pas la production.

## Endpoints utilisés

- OAuth : `accounts.google.com/o/oauth2/v2/auth`, `oauth2.googleapis.com/token`, `/revoke`, `openidconnect.googleapis.com/v1/userinfo`.
- Calendar v3 : `users/me/calendarList`, `calendars/{id}/events`, `events/{eventId}`, `freeBusy`, `events/watch`, `channels/stop`.
- Gmail v1 : `users/me/profile`, `threads`, `threads/{id}`, `messages/{id}` pour la métadonnée Message-ID d’une réponse, `messages/send`, `drafts`, `messages` pour les IDs récents et `history` pour les deltas.
- Drive v3 : `files`, `files/{id}`, `changes/startPageToken`, `changes`, `changes/watch`, `channels/stop`.
- Sheets v4 : `spreadsheets/{id}`, `values/{range}`, `values/{range}:append`.

Meet P0 crée `conferenceData.createRequest` dans Calendar avec `conferenceDataVersion=1`. Aucun enregistrement, participant, transcript ou recording Meet n’est importé. Les fonctionnalités avancées restent soumises aux scopes, plans, consentements et API Meet actuels.

## Tools typés disponibles dans l’adapter

`calendar.list_calendars`, `calendar.search_events`, `calendar.get_availability`, `calendar.create_event`, `calendar.update_event`, `calendar.cancel_event`, `meet.create_meeting`, `gmail.search`, `gmail.read_thread`, `gmail.create_draft`, `gmail.send`, `gmail.reply`, `drive.search_files`, `drive.get_file`, `drive.create_folder`, `sheets.list_spreadsheets`, `sheets.get_spreadsheet`, `sheets.read_range`, `sheets.write_range`, `sheets.append_rows`.

Ces contrats existent côté backend ; ils ne sont pas encore exposés au modèle. Les corps externes sont des données non fiables. Les brouillons sont risque 1, communications et invitations risque 2, suppressions et écritures Sheets en masse risque 3. Les mises à jour/suppressions Calendar exigent l’ETag exact. Les cellules utilisent `RAW`, sans interprétation de formules.

## Sync, notifications et quotas

Calendar garde `syncToken/pageToken`, Gmail `historyId/pageToken`, Drive les change tokens. La première lecture Gmail se limite aux IDs des messages Inbox des trente derniers jours ; pièces jointes et corps complets ne sont pas importés en arrière-plan. Les cursors expirés relancent seulement la ressource sélectionnée. Les pages sont limitées et leur commit exige le lease courant du worker.

Calendar/Drive ne fournissent pas une signature HMAC de payload comparable à Slack : vérifier le token de canal secret, channel ID, resource ID et numéro de message. Gmail/Pub/Sub authentifié vérifie l’ID token signé avec la bibliothèque Google, l’audience enregistrée, le service account attendu, `email_verified`, issuer et expiration. Valider ensuite abonnement, compte Gmail, `historyId` chaîne numérique et `publishTime`. Le `messageId` assure la déduplication ; l’historique se lit depuis le cursor sauvegardé, même si les notifications arrivent hors ordre.

Ne jamais logger les erreurs JWT brutes : la bibliothèque peut y inclure le token. Seuls des codes fermés (`expired_token`, `invalid_audience`, `invalid_issuer`, `invalid_signature`, etc.) et un correlation ID sont journalisés.

Les limites Google diffèrent par produit, projet, utilisateur et méthode. Le framework impose une admission locale conservatrice de 60 actions/minute/utilisateur/famille et 300/workspace/famille ; cela ne remplace pas les quotas Google. `429`, `Retry-After`, timeouts et 5xx sont normalisés avec backoff/jitter et nombre d’essais limité. Vérifier notamment les quotas Gmail modifiés pour les nouveaux projets en 2026, les coûts par méthode, et les quotas Sheets lecture/écriture avant activation ; ne pas considérer l’admission locale comme une garantie de quota fournisseur.

## Configuration, rotation et révocation

Variables serveur : `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`, `INTEGRATION_VAULT_KEYS` (JSON de key IDs vers clés base64 de 32 octets), `INTEGRATION_VAULT_ACTIVE_KEY`. Pour vérifier Gmail/Pub/Sub : `GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL`. Aucune de ces valeurs secrètes ne doit être publique ou envoyée au modèle.

Créer les clés dans le secret manager de chaque plateforme. Pour tourner le vault, ajouter la nouvelle clé au keyring, changer l’ID actif et utiliser `rotateEnvelope` dans un processus opérateur serveur avec contrôle de revision ; conserver l’ancienne clé jusqu’à conversion de toutes les enveloppes retenues. Le batch opérateur reste à implémenter. Pour Google, tourner le client secret selon la console officielle et vérifier refresh/callback sur un compte dédié.

Disconnect bloque immédiatement l’accès aux credentials, annule les jobs de cette connexion, arrête ses canaux quand possible, révoque le refresh token via l’endpoint officiel, puis détruit le credential local. Un échec de révocation distante nécessite la reprise opérateur ; il n’est pas présenté comme une déconnexion distante réussie.

En cas de 401 / `invalid_grant` : statut `needs_reauth`, nouveau consentement. Scope absent : activer seulement la permission nécessaire. 410 Calendar / 404 de l’historique Gmail : reset du cursor de cette ressource. 429 : respecter le cooldown. Publication Pub/Sub hors fenêtre : refuser ; examiner le backlog et la synchronisation incrémentale sans remplacer le cursor par le `historyId` de la notification.

## Références officielles

- [OAuth web server et tokens](https://developers.google.com/identity/protocols/oauth2/web-server), [bonnes pratiques](https://developers.google.com/identity/protocols/oauth2/resources/best-practices), [bibliothèque Node officielle](https://github.com/googleapis/google-auth-library-nodejs).
- [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [référence v3](https://developers.google.com/workspace/calendar/api/v3/reference), [sync](https://developers.google.com/workspace/calendar/api/guides/sync), [push](https://developers.google.com/workspace/calendar/api/guides/push), [quotas](https://developers.google.com/workspace/calendar/api/guides/quota).
- [Gmail scopes et vérification](https://developers.google.com/workspace/gmail/api/auth/scopes), [référence v1](https://developers.google.com/workspace/gmail/api/reference/rest), [push/watch/stop](https://developers.google.com/workspace/gmail/api/guides/push), [quotas](https://developers.google.com/workspace/gmail/api/reference/quota).
- [Pub/Sub push authentifié](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions).
- [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [référence v3](https://developers.google.com/workspace/drive/api/reference/rest/v3), [change tokens](https://developers.google.com/workspace/drive/api/guides/manage-changes), [limites](https://developers.google.com/workspace/drive/api/guides/limits).
- [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes), [référence v4](https://developers.google.com/workspace/sheets/api/reference/rest), [limites](https://developers.google.com/workspace/sheets/api/limits).
- [Meet authentification et plans](https://developers.google.com/workspace/meet/api/guides/authenticate-authorize), [changelog Meet](https://developers.google.com/workspace/meet/api/release-notes), [changelog Workspace](https://developers.google.com/workspace/release-notes).
