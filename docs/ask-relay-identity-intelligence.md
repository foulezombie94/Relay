# Ask Relay : identité et intelligence agentique

## Audit et changements

L’agent disposait déjà d’une boucle de Tool Calling, de 37 outils Zod, de recherches paginées et d’agrégations SQL, de contrôles d’accès actuels, d’un original de demande conservé séparément, de confirmations exactes, d’une outbox, d’un audit et de quotas. Ces composants sont conservés.

Les descriptions destinées au modèle étaient génériques : les recherches partageaient une même description, comme les actions. Le prompt ne communiquait pas le modèle backend. Il recommandait des recherches pertinentes mais ne précisait pas assez quand éviter un outil, comment exploiter les résultats vides ou ne pas répéter une même lecture.

La livraison documente chaque outil et chaque paramètre, sans ajouter d’outil métier. `search_emails` couvre explicitement plaintes, objections et intentions d’achat, avec vérification du contexte. `search_records` retrouve les fiches ; `get_record` expose leurs relations bornées, puis les fiches associées sont consultées selon leurs propres permissions. `aggregate_crm_data` est privilégié pour combien, total, moyenne et évolution par période. Le regroupement mensuel utilise création, réception d’email ou date de réunion selon la source ; il ne reconstitue pas les anciens états commerciaux.

L’identité officielle est Ask Relay, assistant IA officiel du CRM Relay, propulsé par OpenAI. Le modèle est lu depuis `OPENAI_MODEL`, avec le défaut explicite `gpt-4.1-mini`. Les questions simples d’identité et salutations reçoivent une réponse déterministe sans appel fournisseur ni outil métier, au sein du runtime authentifié existant. Les demandes composées restent dans l’agent normal. L’activation, les quotas et les protections existantes continuent de s’appliquer.

Le prompt distingue lecture utile, réponses générales et actions. Il encourage une recherche ciblée suivie de lectures utiles, l’exploitation du contexte pour les références, la vérification de fils et engagements pour les réponses attendues, et les clarifications uniquement nécessaires. Aucun routage CRM par mots-clés n’est ajouté.

Une lecture identique déjà réussie dans le tour est refusée avec une indication de stratégie alternative. La clé provient des arguments validés et normalisés par Zod. Un curseur ou filtre différent reste autorisé ; les mutations et lectures de statuts ne sont pas mises en cache. Une action invalide les clés de lecture. Aucun contenu précédemment consulté n’est rejoué depuis un cache, et les sources sont encore revérifiées avant la réponse.

Un test a aussi identifié une erreur préexistante dans la détection des affirmations d’exécution : la frontière de mot JavaScript après un accent ne reconnaissait pas « envoyé. ». La borne Unicode est corrigée ; une action en attente ne peut plus laisser passer ces formulations françaises testées comme une confirmation d’envoi.

## Validation et mesures

`npm run test:agent` couvre identité backend, demandes explicites et familières, sources non fiables séparées de la demande, absence de données, lectures répétées, pagination, mutation suivie d’une lecture, permissions révoquées, actions sensibles en attente, résultats partiels et limites de boucle. Les tests préexistants contrôlent aussi outils non autorisés, destinataires ambigus, confirmations et citations.

Ces tests simulent les réponses du fournisseur pour vérifier l’orchestration et les frontières backend. Ils ne mesurent pas la qualité linguistique réelle d’OpenAI. La CI exécute également les tests SQL et de concurrence préexistants ; aucun schéma ni migration supplémentaire n’est nécessaire.

Une batterie synthétique de 12 scénarios couvre demandes explicites, indirectes, familières, ambiguës, contexte, plusieurs outils, zéro outil, absence de données, outils interdits et actions sensibles. Le script d’évaluation ne construit aucun client Supabase, compte OAuth ou outbox : même lorsqu’un outil d’écriture est sélectionné, aucune action n’est exécutée.

Commandes :

```sh
npm run eval:agent -- --dry-run
# Avec une clé OpenAI déjà disponible dans l’environnement :
npm run eval:agent
```

Le rapport, par défaut `/tmp/relay-agent-evaluation.json` avec permissions 0600, contient sélection correcte selon l’oracle des scénarios, appels inutiles (lectures répétées ou outils hors périmètre attendu), latence par demande et moyenne, tokens, coût estimé avec les tarifs configurés, réussite des scénarios complexes et réponses synthétiques à examiner. `RELAY_AGENT_EVAL_MAX_USD` borne le coût estimé global, par défaut 1 USD ; `RELAY_AGENT_EVAL_REPORT` choisit le chemin.

Les tarifs doivent correspondre au modèle sélectionné ; un modèle autre que la famille gpt-4.1-mini exige des tarifs explicites avant toute évaluation réelle.

La précision sémantique demande une revue humaine des réponses face aux faits fournis. Elle reste `null` tant qu’elle n’est pas évaluée : aucune auto-évaluation du modèle n’est présentée comme un score fiable. Sans clé OpenAI, le rapport indique `not_run`, sans taux, coût ou latence inventés. Ce benchmark ne remplace pas les tests RLS ni une validation réelle des envois fournisseurs.
