export const crmSources = [
  {
    id: "attio",
    name: "Attio",
    formats: "CSV · Excel · ZIP",
    url: "https://attio.com/help/reference/imports-exports/back-up-your-workspace-data",
    steps: [
      "Dans Workspace settings → General, lancez Export Workspace data.",
      "Téléchargez la sauvegarde ZIP, ou exportez une vue en CSV.",
      "Importez les tables Companies, People puis Deals avec leurs identifiants.",
    ],
  },
  {
    id: "pipedrive",
    name: "Pipedrive",
    formats: "CSV · Excel",
    url: "https://support.pipedrive.com/en/article/exporting-data-from-pipedrive",
    steps: [
      "Ouvrez Tools and apps → Export data, avec les droits d’export.",
      "Exportez Organizations, People puis Deals en CSV ou Excel.",
      "Conservez les ID des fiches et les ID des organisations / personnes associées.",
    ],
  },
  {
    id: "close",
    name: "Close",
    formats: "CSV · JSON",
    url: "https://help.close.com/account-management/exporting-data",
    steps: [
      "Dans Leads, ouvrez le menu … → Export.",
      "Choisissez Leads, Contacts ou Opportunities, puis CSV ou JSON et All fields.",
      "Le JSON contenant des leads avec contacts et opportunités propose des collections séparées dans Zyliad. Les activités ne sont pas reprises.",
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    formats: "CSV · Excel · associations",
    url: "https://knowledge.hubspot.com/import-and-export/export-records",
    steps: [
      "Depuis chaque vue Contacts, Companies et Deals, choisissez Export.",
      "Dans Customize, incluez les propriétés et associations, avec Record ID et les ID associés.",
      "Importez les entreprises, puis les personnes et les opportunités dans le même lot. Les noms d’associations seuls ne suffisent pas.",
    ],
  },
  {
    id: "freshsales",
    name: "Freshsales",
    formats: "CSV · ZIP",
    url: "https://support.freshsales.io/support/solutions/articles/50000001894-how-do-i-export-all-required-data-from-the-crm-",
    steps: [
      "Dans Admin Settings → Account, cliquez sur Export data.",
      "Choisissez la période et les types de fiches, puis téléchargez le ZIP reçu par email.",
      "Choisissez les CSV Contacts, Accounts et Deals dans Zyliad ; conservez leurs ID.",
    ],
  },
  {
    id: "copper",
    name: "Copper",
    formats: "CSV · Excel",
    url: "https://support.copper.com/en/articles/8823355-export-data-from-copper",
    steps: [
      "Ouvrez Workspace Settings → Manage Your Data → Export Data.",
      "Exportez Companies, People et Opportunities et téléchargez les fichiers reçus par email.",
      "Copper propose aussi des exports Excel. Conservez les identifiants des entreprises associées.",
    ],
  },
  {
    id: "zoho",
    name: "Zoho CRM",
    formats: "CSV · Excel · ZIP",
    url: "https://help.zoho.com/portal/en/kb/crm/data-administration/data-backup/articles/requesting-data-backup",
    steps: [
      "Exportez Accounts, Contacts et Deals depuis leurs modules, ou demandez une sauvegarde dans Setup → Data Administration → Data Backup.",
      "Téléchargez les données puis choisissez un CSV du ZIP dans Zyliad.",
      "Gardez Record ID / CONTACTID / ACCOUNTID et les identifiants de relation. Les pièces jointes et paramètres ne sont pas restaurés.",
    ],
  },
  {
    id: "folk",
    name: "folk",
    formats: "CSV",
    url: "https://help.folk.app/en/articles/5007388-export-data",
    steps: [
      "Ouvrez le groupe et la vue à migrer, puis son menu d’export.",
      "Exportez les personnes ou entreprises en CSV, avec les champs utiles.",
      "Si le CSV ne contient que le nom de l’entreprise, reliez les fiches depuis Relations après import : Zyliad ne rapproche pas les homonymes automatiquement.",
    ],
  },
  {
    id: "monday",
    name: "monday CRM",
    formats: "Excel · CSV",
    url: "https://support.monday.com/hc/en-us/articles/26989749858578-Export-from-monday-to-Excel",
    steps: [
      "Dans le tableau, ouvrez … → More actions → Export board to Excel.",
      "Exportez les tableaux Companies, Contacts et Deals séparément.",
      "Choisissez la feuille et la ligne d’en-tête. Excluez les lignes de groupe ou de total via le rapport de validation. Les tableaux connectés exigent des ID explicites.",
    ],
  },
  {
    id: "file",
    name: "CSV / Excel",
    formats: "CSV · Excel · JSON · ZIP",
    url: "",
    steps: [
      "Préparez un fichier par type de fiche, avec une ligne d’en-tête.",
      "Le nom est obligatoire ; ajoutez email, domaine ou montant si disponibles.",
      "Vérifiez la correspondance, les étapes et les lignes rejetées avant confirmation.",
    ],
  },
] as const;
export type CrmSource = (typeof crmSources)[number]["id"];
