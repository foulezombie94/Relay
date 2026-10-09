# Sessions de connexion Relay

Relay conserve la session Supabase sur le même navigateur après rechargement et fermeture. Le client navigateur unique est initialisé dans `AppProvider` pour laisser le SDK renouveler les jetons et reprendre après la mise en veille. Le proxy renouvelle aussi les cookies avant le rendu serveur et conserve tous les cookies et en-têtes anti-cache, y compris lors de la redirection depuis `/login`.

Les cookies restent propres à l'hôte, avec `SameSite=Lax`, `Path=/`, priorité haute et `Secure` en production. La durée de stockage persistante est celle du SDK Supabase ; elle ne prolonge pas la validité d'un JWT ou d'une session. Le SDK SSR doit pouvoir lire les cookies côté navigateur pour renouveler la session : ajouter `HttpOnly` à cette architecture empêcherait ce renouvellement. Aucun mot de passe n'est sauvegardé et aucun nouveau stockage de jetons n'est ajouté.

La reprise depuis `/` et `/login` exige `getUser()` côté serveur. L'accueil redirige les sessions valides vers `/app/dashboard` ; les visiteurs sans cookie de session gardent la landing sans appel Auth. La réponse d'accueil utilise `private, no-store` pour revérifier la session au retour. Un cookie indique uniquement qu'une vérification doit être tentée. Les destinations de connexion sont limitées à `/app/dashboard` et `/invite`. L'inscription et la récupération du mot de passe restent accessibles explicitement. Après connexion, une navigation complète évite de réutiliser un état Next.js antérieur à l'authentification.

Les opérations CRM continuent à vérifier l'utilisateur et son appartenance actuelle au workspace. Une session révoquée ou un jeton de renouvellement invalide exige une nouvelle connexion. Les pannes temporaires d'Auth produisent une erreur 503 dans le contexte CRM et l'ouverture du workspace ; elles ne deviennent pas des erreurs 401. L'interface propose de réessayer les erreurs temporaires.

La déconnexion utilise `scope: local` : elle ferme cette session et les onglets qui la partagent, sans déconnecter les autres appareils. Un changement de compte ou une déconnexion purge le cache React Query avant navigation. Les callbacks de session n'appellent aucune méthode Auth pour éviter les blocages sur le verrou du SDK.

Aucune migration SQL ni modification des paramètres Auth hébergés n'est requise. Les règles Supabase d'expiration, d'inactivité et de révocation continuent à s'appliquer. Effacer les données du site, utiliser la navigation privée ou changer de domaine peut nécessiter une nouvelle connexion.

Vérification automatisée : `npm test` et `npm run typecheck`. Les tests de `src/lib/supabase` et `src/proxy.test.ts` couvrent la rotation avec le vrai SDK SSR et un fournisseur HTTP isolé, la reprise, la révocation, les pannes temporaires, les destinations de redirection, les permissions et l'isolation des caches entre utilisateurs.
