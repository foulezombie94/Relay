# Pages CRM : inspirations et adaptations

Sources officielles consultées le 6 octobre 2026 :

- Attio : https://attio.com/help/reference/industry-guides/sales-led — objets spécialisés, relations et vues adaptées au processus commercial.
- HubSpot : https://knowledge.hubspot.com/records/view-and-filter-records — filtres, vues enregistrées, colonnes personnalisées et aperçu de fiche.
- Pipedrive : https://support.pipedrive.com/en/article/deal-card-customization-sorting — cartes commerciales avec valeur, responsable et informations utiles.

## Implémentation Relay

- Personnes : tableau de contacts par défaut, noms et coordonnées ; répertoire disponible avec avatars ronds.
- Entreprises : répertoire de comptes par défaut, site et coordonnées ; tableau disponible.
- Opportunités : pipeline par défaut, valeur par devise et étape, responsable, clôture, ajout dans une étape, déplacement par glisser-déposer ou sélection accessible.
- Chaque page conserve la recherche, les filtres de responsable, les colonnes, l'import/export et les vues enregistrées. Les champs de vente sont réservés aux opportunités et aux objets personnalisés qui les utilisaient déjà.
- Les vues enregistrées conservent le mode d'affichage dans config.layout. Le répertoire utilise le type table existant et ne nécessite pas de migration.
- Les aperçus de fiche distinguent contacts, comptes et ventes. Ils proposent des raccourcis vers les fiches liées et la première tâche ou le premier engagement ouvert, selon l'échéance.
- Les calendriers utilisent React DayPicker, avec présentation française et limites de positionnement dans la fenêtre d'édition.

## Portée des données

Le pipeline et ses sommes portent sur les 50 résultats de la page courante, après filtres ; l'interface l'indique. Les devises ne sont pas additionnées entre elles. Le contexte de fiche utilise l'API existante avec ses règles d'accès et ses limites ; un aperçu tronqué est signalé. Aucun indicateur commercial fictif ni comptage de relations non chargé n'est affiché.

Validation ciblée : contrôle TypeScript et inspection du pipeline, des pages et de la sélection d'une date dans le navigateur. L'espace consulté ne contenait pas de fiches ; le déplacement et les aperçus liés n'ont donc pas été exercés sur des données réelles.

## Sidebar — référence Notion du 25 octobre 2026

La navigation reprend les styles calculés de la sidebar Notion inspectée dans Chrome : largeur de 270 px, fond #f9f8f7, police système de 14 px, lignes de 30 px avec un intervalle de 1 px et marges latérales de 8 px. Les titres de groupe utilisent 12 px. La barre supérieure mesure 44 px et la recherche 32 px, avec 12 px de marge latérale. La sélection est un fond gris translucide sans accent bleu.

Les onglets, routes, objets personnalisés et préférences de groupes de Relay sont conservés. Le bas de la navigation contient Paramètres puis une barre de 44 px : avatar et changement d’espace, Intégrations, Aide et menu du compte. Les contrôles de cette barre mesurent 28 px et sont espacés de 2 px. Le profil conserve l’email, les paramètres, les portails et la déconnexion. Ctrl+K ouvre la recherche dans l’application authentifiée ; les aperçus publics désactivent ce raccourci et le préchargement privé. Le mode réduit, le panneau mobile et le thème sombre restent disponibles ; les cibles tactiles mobiles restent de 40 px.

Les interactions ont été complétées après inspection des menus Notion : flèche près du titre, actions au survol et au focus clavier, menus de section (replier/déplier, tout replier/déplier, remonter/descendre), favoris et personnalisation de la visibilité. Le bouton + ajoute un raccourci vers un onglet Relay existant. Les menus des onglets proposent les favoris, la copie du lien et l’ouverture dans un nouvel onglet. Opportunités et Messages déplient respectivement Pipelines et Modèles email.

La fermeture masque désormais la sidebar entière ; le survol du bouton de réouverture ou du bord gauche affiche un panneau flottant, refermable par Échap ou un clic extérieur. La bordure se redimensionne par glisser-déposer ou avec les flèches du clavier, entre 220 et 480 px ; un double-clic rétablit 270 px. Ordre, visibilité et favoris sont validés contre le catalogue du workspace et enregistrés par utilisateur et espace. Les aperçus publics restent sans lecture ni écriture de ces préférences. Les tests ciblés couvrent les sous-routes, les groupes repliés, les favoris, les bornes de redimensionnement et les préférences invalides.

Le mode Personnaliser remplace la navigation par un éditeur dédié, inspiré du mode édition Notion : poignées de déplacement, masquage réversible, menus d’ajout avec recherche et bouton bleu Terminé. Les accès rapides peuvent pointer vers les onglets Relay existants. Chaque section déplie ses propres onglets pour choisir leur visibilité et leur ordre. Le déplacement fonctionne par glisser-déposer ou flèches du clavier sur les poignées ; la disposition par défaut peut être restaurée sans effacer les favoris. Le mode normal reflète immédiatement les préférences sauvegardées par utilisateur et workspace. Les tests vérifient l’édition, la restauration d’une section masquée, la persistance, les accès rapides et le maintien des favoris.
