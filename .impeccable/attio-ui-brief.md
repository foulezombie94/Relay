# Interface opérationnelle — Attio avec le bleu Relay

Direction demandée explicitement par l’utilisateur : reprendre fidèlement les références Attio, sur toute l’application, en conservant son bleu #365de3. Construction directe dans le dépôt Relay du Bureau.

THESIS : une interface de travail calme et dense, où les données et les actions priment sur les grandes cartes décoratives.
OWN-WORLD : surfaces blanches, navigation gris neutre, encre graphite, filets gris 1px, accent Relay réservé aux actions et au focus. Police sans locale existante, icônes Lucide fines. Contrôles 32px, menus 30px, tableau 40px, header 48px ; cibles tactiles agrandies sur mobile.
STORY : sélectionner une vue, retrouver une relation, ouvrir sa fiche, agir sur ses échanges, tâches et documents. Les réglages, rapports et workflows utilisent le même vocabulaire visuel.
FIRST VIEWPORT : sidebar compacte, titre et actions sobres, barre de vues et filtres, tableau blanc à séparateurs verticaux. Les fiches séparent informations et activité par une règle, avec onglets gris et soulignement graphite.
FORM : référence imposée par l’utilisateur, aucune exploration d’identité concurrente. Les variantes d’Attio anciennes/récentes sont synthétisées autour des contrôles et de la densité, en gardant les parcours et permissions existants.
FINISH : états hover, focus, disabled, danger et sélection cohérents ; modal et drawer au clavier ; thèmes clair/sombre et densité ; tableaux scrollables sans débordement de page ; vérification desktop/mobile et des parcours publics.

## Références inspectées

468 fichiers de C:/Users/pc/Desktop/Attio-UI ouverts individuellement en résolution originale le 11 octobre 2026, après un inventaire par section. Les quatre GIF ont également été examinés à quatre positions supplémentaires chacun. Les captures détaillent navigation, objets CRM, listes, tableaux, emails, workflows, extension, appels, rapports, tâches, notes, assistant, réglages et imports/exports.

Sources officielles complémentaires : https://docs.attio.com/sdk/components/button ; https://docs.attio.com/sdk/components/forms/text-input ; https://docs.attio.com/sdk/components/table ; https://github.com/attio ; https://github.com/makenotion. Les composants attio/client s’exécutent dans les surfaces du SDK Attio ; ce ne sont pas des composants DOM autonomes à installer dans ce CRM Next.js. Relay reproduit les contrôles avec ses primitives Radix déjà installées.

## Périmètre

Tokens et composants partagés, navigation, tableaux, vues CRM, fiches, menus, formulaires et styles propres aux fonctionnalités. La landing conserve son identité documentée. Aucune mutation Supabase, changement de migration, de permission ou de logique métier. La démonstration publique sert de parcours de vérification avec des données fictives.
