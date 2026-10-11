import { marketplaceApps } from "@/lib/integrations/platform/catalog";

export type Connector = {
  provider: string;
  name: string;
  status: string;
  configured: boolean;
  missing: string[];
  description: string;
  email?: string;
  last_sync?: string;
  auto_sync?: boolean;
  pending?: boolean;
  imported?: number;
  last_error?: string;
  worker_ready?: boolean;
};

export type AppCategory =
  "communication" | "calendars" | "calling" | "automations" | "files" | "sales";
export const appCategories: { id: AppCategory; name: string }[] = [
  { id: "communication", name: "Communication" },
  { id: "calendars", name: "Calendars" },
  { id: "calling", name: "Calling & meetings" },
  { id: "automations", name: "Automations" },
  { id: "files", name: "Fichiers & documents" },
  { id: "sales", name: "Ventes & facturation" },
];

export type CatalogApp = {
  id: string;
  name: string;
  category: AppCategory;
  description: string;
  headline: string;
  overview: string[];
  features: { title: string; description: string }[];
  requirements: string;
  website: string;
  documentation: string;
  support: string;
};

const emailFeatures = [
  {
    title: "Retrouvez vos échanges",
    description:
      "Consultez les messages importés dans votre CRM et reliez-les au contexte de vos contacts.",
  },
  {
    title: "Préparez votre suivi",
    description:
      "L’assistant peut utiliser les échanges auxquels vous avez accès pour préparer vos prochaines actions.",
  },
  {
    title: "Envoyez avec confirmation",
    description:
      "L’envoi d’un email par l’assistant demande votre validation. Les automatisations suivent les règles que vous configurez.",
  },
];
const calendarFeatures = [
  {
    title: "Importez vos rendez-vous",
    description: "Retrouvez les événements des 30 prochains jours de votre calendrier principal.",
  },
  {
    title: "Préparez vos réunions",
    description: "Rapprochez vos rendez-vous des informations de vos contacts dans Zyliad.",
  },
  {
    title: "Automatisez vos événements",
    description:
      "Les workflows peuvent créer un événement lorsque vous avez accordé les permissions nécessaires.",
  },
];
const meetingFeatures = [
  {
    title: "Importez les transcriptions",
    description:
      "Récupérez les transcriptions déjà disponibles chez le fournisseur, par lots avec reprise.",
  },
  {
    title: "Gardez le contexte",
    description: "Retrouvez le contenu importé dans Réunions et utilisez-le avec votre assistant.",
  },
  {
    title: "Préparez la suite",
    description:
      "Utilisez vos transcriptions accessibles pour résumer un échange et préparer le suivi de vos engagements.",
  },
];

const legacyCatalog: CatalogApp[] = [
  {
    id: "gmail",
    name: "Gmail",
    category: "communication",
    description: "Vos emails et votre suivi client, réunis au même endroit.",
    headline: "Donnez à vos échanges Gmail tout le contexte de Zyliad.",
    overview: [
      "Connectez votre compte Google pour retrouver vos emails dans Zyliad et préparer votre suivi sans perdre le contexte de vos contacts.",
      "Le premier import couvre les 30 derniers jours, puis les nouveaux messages. Les imports restent privés à votre compte, et l’envoi par l’assistant exige votre confirmation.",
    ],
    features: emailFeatures,
    requirements:
      "Un compte Google et l’autorisation d’accéder aux messages et d’envoyer des emails. Votre organisation peut demander un consentement administrateur.",
    website: "https://workspace.google.com/products/gmail/",
    documentation: "https://support.google.com/mail/",
    support: "https://support.google.com/mail/gethelp",
  },
  {
    id: "outlook",
    name: "Outlook",
    category: "communication",
    description: "Retrouvez vos conversations Microsoft dans votre CRM.",
    headline: "Connectez vos conversations Outlook à votre espace Zyliad.",
    overview: [
      "Reliez votre compte Outlook ou Microsoft 365 pour importer vos emails et retrouver vos conversations dans Messages.",
      "L’import conserve vos données privées à votre compte. Il reprend par lots, sans créer de doublons, et les envois par l’assistant nécessitent votre confirmation.",
    ],
    features: emailFeatures,
    requirements:
      "Un compte Microsoft compatible avec la configuration de votre organisation. Le consentement administrateur peut être requis.",
    website:
      "https://www.microsoft.com/microsoft-365/outlook/email-and-calendar-software-microsoft-outlook",
    documentation: "https://support.microsoft.com/outlook",
    support: "https://support.microsoft.com/contactus",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "calendars",
    description: "Vos rendez-vous Google, avec le contexte de vos contacts.",
    headline: "Préparez chaque rendez-vous avec Google Calendar et Zyliad.",
    overview: [
      "Connectez votre calendrier principal pour retrouver vos événements à venir et préparer vos rendez-vous dans Zyliad.",
      "L’import porte sur les 30 prochains jours. La création d’événements par un workflow exige les permissions d’écriture accordées lors de la connexion.",
    ],
    features: calendarFeatures,
    requirements:
      "Un compte Google donnant accès à votre calendrier principal. La connexion du calendrier est distincte de celle de Gmail.",
    website: "https://workspace.google.com/products/calendar/",
    documentation: "https://support.google.com/calendar/",
    support: "https://support.google.com/calendar/gethelp",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    category: "calendars",
    description: "Gardez votre calendrier Microsoft au plus près de vos ventes.",
    headline: "Vos rendez-vous Outlook trouvent leur place dans Zyliad.",
    overview: [
      "Importez les événements à venir de votre calendrier principal Microsoft et retrouvez-les dans le contexte de votre CRM.",
      "Les imports restent privés et couvrent les 30 prochains jours. Les workflows peuvent créer des événements avec votre autorisation d’écriture.",
    ],
    features: calendarFeatures,
    requirements:
      "Un compte Microsoft et les permissions de calendrier. Outlook Calendar se connecte indépendamment de votre messagerie Outlook.",
    website:
      "https://www.microsoft.com/microsoft-365/outlook/email-and-calendar-software-microsoft-outlook",
    documentation: "https://support.microsoft.com/outlook",
    support: "https://support.microsoft.com/contactus",
  },
  {
    id: "google-meet",
    name: "Google Meet",
    category: "calling",
    description: "Transformez vos transcriptions Meet en contexte utile.",
    headline: "Retrouvez le fil de vos réunions Google Meet dans Zyliad.",
    overview: [
      "Importez les transcriptions disponibles de vos réunions Google Meet pour conserver le contexte de vos échanges.",
      "Zyliad ne rejoint pas vos appels et ne lance aucun enregistrement. La création et la disponibilité des transcriptions dépendent de votre abonnement et de vos réglages Google Meet.",
    ],
    features: meetingFeatures,
    requirements:
      "Un compte Google avec un abonnement et des réglages permettant les transcriptions. Celles-ci doivent déjà être disponibles dans Meet.",
    website: "https://workspace.google.com/products/meet/",
    documentation: "https://support.google.com/meet/",
    support: "https://support.google.com/meet/gethelp",
  },
  {
    id: "microsoft-teams",
    name: "Microsoft Teams",
    category: "calling",
    description: "Vos réunions Teams et leurs transcriptions dans Zyliad.",
    headline: "Donnez une suite à vos réunions Microsoft Teams.",
    overview: [
      "Importez les transcriptions disponibles des réunions que vous avez organisées dans Teams et retrouvez-les dans Zyliad.",
      "La transcription doit être activée chez Microsoft. Zyliad ne rejoint pas les appels ; votre organisation peut exiger l’autorisation d’un administrateur.",
    ],
    features: meetingFeatures,
    requirements:
      "Un compte Microsoft autorisé à lire les réunions et leurs transcriptions. Certaines permissions nécessitent un consentement administrateur.",
    website: "https://www.microsoft.com/microsoft-teams/group-chat-software",
    documentation: "https://support.microsoft.com/teams",
    support: "https://support.microsoft.com/contactus",
  },
  {
    id: "zoom",
    name: "Zoom",
    category: "calling",
    description: "Importez les transcriptions de vos enregistrements cloud.",
    headline: "Gardez le contexte de vos appels Zoom dans Zyliad.",
    overview: [
      "Récupérez les transcriptions déjà disponibles dans vos enregistrements cloud Zoom et rassemblez-les dans votre CRM.",
      "L’intégration ne lance aucune capture et ne rejoint aucune réunion. Un enregistrement cloud avec transcription est nécessaire pour importer le contenu.",
    ],
    features: meetingFeatures,
    requirements:
      "Un compte Zoom disposant d’enregistrements cloud et de transcriptions accessibles. Autorisez leur lecture lors de la connexion.",
    website: "https://www.zoom.com/",
    documentation: "https://support.zoom.com/",
    support: "https://support.zoom.com/",
  },
  {
    id: "zapier",
    name: "Zapier",
    category: "automations",
    description: "Reliez vos outils à Zyliad avec vos propres automatisations.",
    headline: "Connectez Zyliad à vos outils avec Webhooks by Zapier.",
    overview: [
      "Créez vos automatisations avec Webhooks by Zapier ou une intégration privée. Un administrateur génère une clé limitée à cet espace, valable 90 jours et révocable.",
      "La clé permet la lecture des personnes, entreprises, opportunités et tâches. La création est facultative ; les notes, messages, documents et données privées ne sont pas exposés. Ce connecteur n’est pas une app publiée sur le catalogue Zapier.",
    ],
    features: [
      {
        title: "Connectez vos Zaps",
        description: "Utilisez Webhooks by Zapier avec l’API de votre espace Zyliad.",
      },
      {
        title: "Choisissez les permissions",
        description: "Autorisez la lecture, et si nécessaire la création de fiches et de tâches.",
      },
      {
        title: "Gardez le contrôle",
        description:
          "Vos clés expirent après 90 jours et peuvent être révoquées à tout moment par un administrateur.",
      },
    ],
    requirements:
      "Un administrateur de votre espace, un hébergement HTTPS accessible à Zapier et un Zap utilisant Webhooks ou une intégration privée.",
    website: "https://zapier.com/",
    documentation: "https://docs.zapier.com/integrations/build/auth",
    support: "https://help.zapier.com/",
  },
];

const resources: Record<string, { website: string; documentation: string; support: string }> = {
  "api-webhooks": {
    website: "/doc?article=integrations",
    documentation: "/doc?article=integrations",
    support: "/doc",
  },
  "google-drive": {
    website: "https://drive.google.com/",
    documentation: "https://developers.google.com/workspace/drive/api/guides/about-sdk",
    support: "https://support.google.com/drive/",
  },
  "google-sheets": {
    website: "https://sheets.google.com/",
    documentation: "https://developers.google.com/workspace/sheets/api/guides/concepts",
    support: "https://support.google.com/docs/",
  },
  slack: {
    website: "https://slack.com/",
    documentation: "https://docs.slack.dev/",
    support: "https://slack.com/help",
  },
  stripe: {
    website: "https://stripe.com/",
    documentation: "https://docs.stripe.com/connect",
    support: "https://support.stripe.com/",
  },
  calendly: {
    website: "https://calendly.com/",
    documentation: "https://developer.calendly.com/",
    support: "https://help.calendly.com/",
  },
  typeform: {
    website: "https://www.typeform.com/",
    documentation: "https://www.typeform.com/developers/",
    support: "https://help.typeform.com/",
  },
  notion: {
    website: "https://www.notion.com/",
    documentation: "https://developers.notion.com/",
    support: "https://www.notion.com/help",
  },
  dropbox: {
    website: "https://www.dropbox.com/",
    documentation: "https://www.dropbox.com/developers/documentation/http/overview",
    support: "https://help.dropbox.com/",
  },
  onedrive: {
    website: "https://www.microsoft.com/microsoft-365/onedrive/online-cloud-storage",
    documentation: "https://learn.microsoft.com/graph/onedrive-concept-overview",
    support: "https://support.microsoft.com/onedrive",
  },
  pandadoc: {
    website: "https://www.pandadoc.com/",
    documentation: "https://developers.pandadoc.com/",
    support: "https://support.pandadoc.com/",
  },
  apollo: {
    website: "https://www.apollo.io/",
    documentation: "https://docs.apollo.io/",
    support: "https://knowledge.apollo.io/",
  },
};
const categories: Record<(typeof marketplaceApps)[number]["category"], AppCategory> = {
  Communication: "communication",
  Calendriers: "calendars",
  Fichiers: "files",
  Automatisations: "automations",
  Ventes: "sales",
  Réunions: "calling",
};
export const appCatalog: CatalogApp[] = [
  ...legacyCatalog,
  ...marketplaceApps
    .filter((app) => !legacyCatalog.some((legacy) => legacy.id === app.id))
    .map((app) => ({
      id: app.id,
      name: app.name,
      category: categories[app.category],
      description: app.description,
      headline: app.description,
      overview: [
        app.provider === "google"
          ? "Une connexion Google partagée, avec les permissions de cette app uniquement. Les autres fonctionnalités Google s’activent par consentement supplémentaire."
          : "Cette intégration figure dans le catalogue Zyliad. Son connecteur est en développement : aucune donnée n’est importée et aucune connexion n’est proposée avant sa disponibilité.",
      ],
      features:
        app.provider === "google"
          ? [
              {
                title: "Consultez les fichiers autorisés",
                description:
                  "L’accès reste limité aux fichiers partagés avec Zyliad, sans importer automatiquement votre espace de stockage.",
              },
              {
                title: "Gardez le contrôle",
                description:
                  "Les permissions et l’historique sont accessibles dans la gestion de votre connexion Google.",
              },
            ]
          : [
              { title: "Fonctionnalités prévues", description: app.description },
              {
                title: "Activation à venir",
                description:
                  "Les fonctions seront proposées après implémentation et validation du connecteur officiel.",
              },
            ],
      requirements:
        app.provider === "google"
          ? "La plateforme Google doit être configurée par votre administrateur et validée avec un compte dédié avant activation générale. Les accès aux fichiers utilisent drive.file."
          : "Le connecteur doit être implémenté et validé avant installation. Ajouter une clé fournisseur ne suffit pas à l’activer.",
      ...resources[app.id],
    })),
];

export function categoryName(id: AppCategory) {
  return appCategories.find((category) => category.id === id)?.name ?? id;
}
