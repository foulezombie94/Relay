# Réunions et analyses Zyliad

La page `/app/meetings` fournit Agenda, Appels & transcriptions et Modèles d’analyse. Elle remplace l’ancien formulaire de ressources générique. La recherche `?focus=<uuid>&workspace=<uuid>` ouvre une réunion autorisée même si elle n’est pas sur la page courante.

## Interface

La présentation reprend les principes de page et de base de données Notion documentés dans [la recherche](../research/meeting-competitive-analysis.md) : couverture, icône, callouts, propriétés et badges. `src/components/meetings/blocks.tsx` regroupe les composants de présentation propres à Zyliad.

Les vues Liste et Galerie présentent les mêmes résultats. Changer de présentation conserve recherche, filtres, pagination, regroupement et favoris ; toutes les actions des réunions restent disponibles. Les filtres actifs sont visibles et peuvent être effacés sans réinitialiser la présentation. Le lecteur et les modèles utilisent la même feuille de style, responsive et compatible avec les thèmes existants. Cette révision n’exige aucune migration ni nouvelle variable d’environnement.

## Données et permissions

La migration `20261010232508_meeting_workspace.sql` ajoute les informations de réunion, un verrou optimiste `version`, les favoris propres à l’utilisateur, les associations CRM et les modèles. Les anciennes migrations restent intactes. Les RPC de lecture sont `SECURITY INVOKER` avec un `search_path` vide ; RLS conserve les contraintes de confidentialité et les lecteurs limités. Les relations utilisent des clés étrangères composites par espace. Les listes sont bornées à 25 résultats et n’exposent pas les transcriptions.

Un favori est une préférence personnelle et peut être utilisé par un lecteur autorisé. Les modifications métier demandent un rôle membre, administrateur ou propriétaire. Un modèle en brouillon est visible par son auteur et les administrateurs ; un modèle publié est lisible par l’équipe. Seuls son auteur et les administrateurs peuvent le modifier. La visibilité initiale d’une réunion ne peut pas être élargie après création. Les associations supplémentaires n’accordent aucun nouveau droit sur la réunion ; elles restent limitées à 100 et apparaissent dans les activités CRM accessibles.

Le calendrier provient de `communications`, avec ses droits existants réservés au propriétaire. La synchronisation conserve les liens de conférence et le lieu, sans changer les leases, scopes ou mécanismes OAuth. Les nouveaux champs sont remplis aux prochaines synchronisations ; les événements existants sans lien restent utilisables.

## Analyse IA

Le formulaire appelle l’orchestrateur existant avec un `meeting_id` validé et une nouvelle conversation privée. Le serveur autorise uniquement `get_source(kind="meeting", id=<identifiant sélectionné>)`. Il bloque recherche d’autres sources, découverte d’outils et mutations, indépendamment des consignes contenues dans la transcription ou le modèle. Les propositions de mutations sont retirées et au moins une citation vérifiée de la réunion est exigée. Quotas, contrôle frais des accès, références de sources et historique existants restent applicables.

Les secrets du fournisseur IA et les tokens d’intégration restent côté serveur. Sans clé IA configurée, l’interface explique que l’analyse est indisponible. Les modèles locaux et partagés ne déclenchent aucune requête IA avant un clic explicite. L’éditeur permet un aperçu sur une réunion accessible avant publication. Chaque régénération consomme le quota normal. L’export et la copie portent sur la transcription accessible, pas sur d’autres contenus CRM.

Les tâches sont créées via le formulaire habituel : l’utilisateur examine leur titre, leur description et leur échéance avant d’enregistrer. Aucune tâche ne découle automatiquement d’un texte externe.

## Limites explicites

Pas de service natif d’enregistrement automatique ni de fichier vidéo inventé. Pas de lien public ni d’envoi automatique aux invités. Les réunions manuelles ne créent pas et n’annulent pas un rendez-vous chez Google/Microsoft. Les événements des calendriers restent en lecture seule dans cette page. Les fonctions de capture nécessitent un fournisseur spécialisé, consentement, comptes configurés et tests réels séparés.

## Validation

- `src/lib/domain/meetings.test.ts` : destinations de conférence, bornes, import de transcription, calculs de durée, fuseaux et changement d’heure.
- `src/components/meetings/meetings.test.tsx` : révocation d’accès, liens profonds, lecteur, rendu de contenu externe, confirmation des favoris, passage Liste/Galerie et réinitialisation des filtres.
- Tests des outils et du runner IA : source précise, outils interdits, absence de mutation.
- `supabase/tests/meetings.sql` : isolation des espaces, réunions/calendriers privés, auteurs, brouillons, lecteurs, liens, version, validation et pagination. Inclus dans `npm run test:performance:db`.
- Les essais navigateur utilisent des données fictives et la vraie interface. Les tests SQL utilisent une base PostgreSQL locale jetable, jamais des écritures de fixtures en production.

Comparer la liste des migrations locales et distantes après déploiement, puis contrôler CI et les statuts Vercel/Railway du commit exact. Les essais de connexion OAuth réels restent conditionnés à la disponibilité des applications et comptes fournisseurs.
