# Landing Relay

Mode : Persuade. Cible : équipes B2B. Le créateur demande le niveau de finition d’Attio, folk et Pipedrive et délègue le meilleur positionnement. Construction directe en code approuvée.

## Direction contract

THESIS : vendre avec un contexte partagé, puis tenir les engagements client. Le produit occupe le premier écran plutôt qu’une illustration abstraite.

OWN-WORLD : papier blanc, encre #20252d, bleu Relay #365de3, surface #f4f6fb, vert réalisation #176a50, contours #dfe4ec. Manrope en titres, DM Sans en lecture, chiffres tabulaires. Aperçus avec hiérarchie de vrai CRM, pas de logos clients fictifs.

STORY : comprendre les ventes, examiner pipeline/relations/réalisation, découvrir les intégrations, lever les objections, créer un espace ou ouvrir la démo publique.

FIRST VIEWPORT : navigation compacte avec Doc ; titre centré ample à deux lignes ; deux actions ; grand aperçu interactif du pipeline, sidebar et prochaines actions. Les onglets sont de vrais contrôles, les données explicitement illustratives.

FORM : choix de la convention CRM premium explicitement demandée par l’utilisateur, qui prime sur l’assignation 7 du seed a250431b. Le système est celui d’un espace commercial lisible ; les concurrents servent de références de finition, sans copie de leurs assets, slogans ou preuves. Signature : passer des opportunités aux engagements sans perdre le client.

FINISH : unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Frontière des aperçus publics
Les aperçus réutilisent les vues UI du CRM et des fixtures locales en lecture seule. AppSidebarView reçoit ses propriétés sans session : aucun import Supabase, fournisseur de données, React Query ou page CRM. Le wrapper AppSidebar conserve les fonctions privées dans l’application. Les liens des aperçus ne préchargent pas les routes privées. La route / évite le rafraîchissement de session dans le proxy. Les primitives visuelles sont extraites des formulaires et du calendrier. Un test récursif protège ces frontières.
