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
