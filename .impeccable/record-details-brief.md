# Fiches CRM — Operate

Extension de l’identité Relay, construction directe en code déjà approuvée. But : comprendre une personne, gérer un compte ou faire avancer une vente. Trois compositions distinctes dans le même panneau de détail, sans inventer de données ou de fonctions.
THESIS : l’objet détermine la hiérarchie, pas seulement le titre.
OWN-WORLD : UI Relay, blanc, bleu, encre, surfaces froides ; polices et contrôles existants.
STORY : personne = profil + échanges ; entreprise = contacts + portefeuille ; opportunité = étapes + valeur + parties prenantes.
FIRST VIEWPORT : identité unique, coordonnées ou valeur, navigation adaptée, action concrète. Plus de nom affiché deux fois et de rangées de compteurs vides.
FORM : convention CRM demandée (Attio, Pipedrive, HubSpot), extension précisément ciblée ; pas de nouvelle identité ni de seed nécessaire.
FINISH : vraies relations et activités, montants par devise, états fermés exclus du pipeline ouvert, aperçu limité signalé, lecture seule respectée, panneau responsive et clavier.
Sources : https://support.pipedrive.com/en/article/deal-detail-view ; https://attio.com/help/reference/attio-101/attios-data-model/understanding-records ; https://knowledge.hubspot.com/records/customize-records

## Livraison et preuves

Disposition du reviewer : **ship — aucune correction matérielle requise**. Extension ordinaire de l’application ; DESIGN.md et .impeccable/design.json conservent le monde de la landing.

- Personne : identité et coordonnées, informations et entreprise en colonne secondaire, prochaine action, échanges et opportunités au premier plan.
- Entreprise : portefeuille commercial par devise, contacts et engagements au premier plan ; prochaine action et informations du compte en colonne secondaire.
- Opportunité : valeur, probabilité, clôture et progression du pipeline dans l’identité ; prochaine action, parties prenantes et activité au premier plan, détails et documents en colonne secondaire.

Typographie et tons sémantiques sont limités à ces fiches et cohérents avec l’UI applicative existante. Les advisories du détecteur sur les rampes de la LANDING ne nécessitent pas de changement du monde global. Les layouts à deux colonnes deviennent une colonne sur mobile ; les noms longs se replient et les onglets peuvent défiler. Les états fermés restent exclus du pipeline ouvert et les aperçus limités sont signalés.

Preuves transmises : six captures validées, une pour chacun des trois objets à 1280px desktop et 390px mobile. Vrais liens de relations, édition et formulaires de tâches vérifiés. Typecheck, six tests et ESLint ciblé passent.

Aucune modification backend ni de schéma. Le contexte des fiches utilise un cache partagé ; les candidats de relations sont chargés seulement lors de l’ajout d’une relation. Les données, permissions et capacités existantes restent la source de vérité.
