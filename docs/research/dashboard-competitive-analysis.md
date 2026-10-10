# Dashboards Relay : comparaison et réalisation

Analyse des documentations officielles consultées le 8 octobre 2026. Les captures évoquées dans la conversation n’étant pas jointes, cette comparaison porte sur les fonctionnalités documentées.

Mise à jour du 10 octobre : [Notion Dashboard](https://www.notion.com/fr/help/dashboards), [Notion Charts](https://www.notion.com/en-gb/help/charts), [Attio Dashboards](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/dashboards) et [Attio Reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports) consultés à nouveau. Notion propose des blocs de vues, deux modes, filtres globaux et menus de duplication ; Attio organise les rapports CRM et leurs sources. Zyliad reprend ces parcours avec 25 présentations et 32 modèles. Les paragraphes ci-dessous décrivent la livraison précédente ; [la fiche actuelle](../features/dashboard.md) détaille les ajouts, validations et limites.

| CRM                                                                                           | Meilleures idées                                                                        | Traduction dans Relay                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Attio](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/dashboards) | Composition sobre, déplacement et redimensionnement, descriptions, favoris, permissions | Cartes configurables, déplacement à la souris ou au clavier, trois largeurs, favoris et dashboard personnel par défaut ; configuration privée ou partagée dans l’espace |
| [HubSpot](https://knowledge.hubspot.com/dashboards/customize-your-dashboards)                 | Bibliothèque, filtres globaux, comparaison, duplication et export                       | Trois modèles commercial/activité/direction, filtres de dates/pipeline/responsable/devise, comparaison de périodes de même durée, copie privée, CSV et impression       |
| [Pipedrive](https://support.pipedrive.com/en/article/insights-dashboards)                     | Objectifs, conversion, progression, durée et prévision commerciale                      | Objectifs chiffrés par devise, taux de gain, montants gagnés, prévision pondérée, ancienneté de l’étape, durée du cycle et passages effectivement observés              |
| [monday CRM](https://support.monday.com/hc/en-us/articles/360002187819-The-Dashboards)        | Widgets de plusieurs sources, charge de travail, filtres par widget, adaptation mobile  | Fiches, tâches, engagements, emails et réunions importés ; charge par responsable, réalisation, filtres locaux combinés aux filtres globaux, grille responsive          |

## Fonctionnement livré

Dashboard est le premier élément de la navigation, au-dessus d’Ask Relay, et devient la page d’accueil après connexion. La vue d’ensemble utilise des données réelles ; elle ne crée aucun enregistrement tant que l’utilisateur n’enregistre pas son dashboard.

Chaque dashboard accepte 1 à 24 indicateurs. Neuf présentations : indicateur, barres horizontales, colonnes, courbe, aire, anneau, tableau, pipeline/parcours et objectif. L’éditeur permet de choisir titre, description, source, mesure, dimension, couleur, largeur, dates et filtres. L’aperçu consulte les données autorisées. Les préférences de favoris et d’accueil appartiennent à chaque utilisateur, y compris en lecture seule.

Les filtres du dashboard ET ceux des widgets s’appliquent ensemble. Des pipelines ou responsables contradictoires donnent un résultat vide plutôt qu’un remplacement silencieux. Les sources sans responsable CRM ne sont pas filtrées par ce champ : une mention l’indique. Les montants de devises différentes ne sont jamais additionnés. Un objectif monétaire possède une devise fixe.

L’export est une demande explicite au clic et recalcule les valeurs avec les permissions courantes. Les cellules CSV sont protégées contre les formules. Les sources se consultent dans une liste paginée de 50 lignes, sans contenu d’email ni secrets. La liste des configurations présente au maximum 100 dashboards accessibles.

## Exactitude et limites

Les comptages et agrégations s’exécutent en PostgreSQL, sans charger un échantillon de fiches dans le navigateur. Les graphiques affichent au maximum 200 groupes et signalent les groupes manquants. Trois calculs simultanés au maximum, délai SQL de 8 secondes par appel et budget serveur de 45 secondes ; un indicateur en erreur affiche son erreur.

Le pipeline montre les états actuels, même avec un filtre de date de création. La comparaison rapproche deux cohortes de même durée : elle ne reconstitue pas un ancien instantané du pipeline. La prévision pondérée est une hypothèse, pas un revenu comptable.

Les dates de clôture et durées proviennent des changements réellement enregistrés dans l’audit. Les fiches sans historique sont signalées et exclues des valeurs historiques. Les passages observés ne supposent pas qu’une fiche a parcouru les étapes sautées et ne constituent pas une conversion de cohorte exhaustive. Les montants associés aux clôtures restent les montants actuels. Emails et réunions ne couvrent que les éléments importés et autorisés.

La configuration partagée ne donne aucun droit supplémentaire : chaque RPC utilise SECURITY INVOKER, les politiques RLS et le workspace courant. Le propriétaire ne peut pas être modifié. Les préférences sont isolées par utilisateur ; les tests vérifient aussi la révocation d’accès.

Les liens publics, abonnements email programmés, ACL propres à chaque équipe et rapports réutilisables indépendants ne sont pas inclus dans cette livraison. Ils demandent des politiques supplémentaires. Aucun partage public implicite n’est ajouté.

## Références complémentaires

- [Attio : rapports de ventes](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/build-a-sales-reporting-dashboard)
- [Attio : parcours de conversion](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-funnel-report)
- [HubSpot : filtres globaux](https://knowledge.hubspot.com/dashboards/use-dashboard-filters)
- [Pipedrive : types de rapports](https://support.pipedrive.com/en/article/insights-report-types)
- [Pipedrive : objectifs](https://support.pipedrive.com/en/article/insights-goals)
- [monday : configuration](https://support.monday.com/hc/en-us/articles/26233702292114-Configure-your-Dashboard)
- [monday : charge de travail](https://support.monday.com/hc/en-us/articles/360010699760-The-Workload-Widget)

## Vérification rapide avant déploiement

Tests ciblés des contrats et dates, calculs SQL réels avec rôle authenticated et RLS, pagination, isolation entre espaces, emails privés, permissions révoquées, injection SQL et préférences. TypeScript, lint et compilation de production complètent ces contrôles. Aucun envoi réel à un fournisseur externe n’est nécessaire pour cette fonctionnalité de lecture.
