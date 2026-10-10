import type { IntegrationId, ProviderFamily } from "./contracts";
export type MarketplaceApp = {
  id: IntegrationId;
  name: string;
  provider: ProviderFamily;
  category:
    "Communication" | "Calendriers" | "Fichiers" | "Automatisations" | "Ventes" | "Réunions";
  description: string;
};
export const marketplaceApps: MarketplaceApp[] = [
  {
    id: "api-webhooks",
    name: "API & Webhooks Zyliad",
    provider: "zyliad",
    category: "Automatisations",
    description: "Connectez vos propres applications et recevez les événements de votre CRM.",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    provider: "google",
    category: "Calendriers",
    description: "Retrouvez vos événements, vos disponibilités et préparez vos rendez-vous.",
  },
  {
    id: "gmail",
    name: "Gmail",
    provider: "google",
    category: "Communication",
    description: "Retrouvez vos échanges et préparez vos suivis depuis Zyliad.",
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    provider: "microsoft",
    category: "Communication",
    description: "Vos emails Outlook, reliés à vos contacts et opportunités.",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    provider: "microsoft",
    category: "Calendriers",
    description: "Consultez votre calendrier et organisez vos prochains rendez-vous.",
  },
  {
    id: "slack",
    name: "Slack",
    provider: "slack",
    category: "Communication",
    description: "Partagez les nouvelles de votre pipeline dans les canaux choisis.",
  },
  {
    id: "stripe",
    name: "Stripe",
    provider: "stripe",
    category: "Ventes",
    description: "Retrouvez les abonnements, factures et paiements de vos clients.",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    provider: "google",
    category: "Fichiers",
    description: "Retrouvez les fichiers que vous partagez avec Zyliad.",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    provider: "google",
    category: "Fichiers",
    description: "Consultez vos tableaux et préparez des imports ou exports.",
  },
  {
    id: "calendly",
    name: "Calendly",
    provider: "calendly",
    category: "Calendriers",
    description: "Reliez vos prises de rendez-vous aux personnes de votre CRM.",
  },
  {
    id: "typeform",
    name: "Typeform",
    provider: "typeform",
    category: "Automatisations",
    description: "Transformez les réponses de vos formulaires en nouvelles opportunités.",
  },
  {
    id: "notion",
    name: "Notion",
    provider: "notion",
    category: "Fichiers",
    description: "Retrouvez les pages et données que vous partagez avec Zyliad.",
  },
  {
    id: "zapier",
    name: "Zapier",
    provider: "zyliad",
    category: "Automatisations",
    description: "Reliez les événements et actions de Zyliad à vos workflows Zapier.",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    provider: "dropbox",
    category: "Fichiers",
    description: "Recherchez vos documents et rattachez-les aux bonnes fiches.",
  },
  {
    id: "onedrive",
    name: "OneDrive",
    provider: "microsoft",
    category: "Fichiers",
    description: "Retrouvez les fichiers de votre compte Microsoft depuis Zyliad.",
  },
  {
    id: "pandadoc",
    name: "PandaDoc",
    provider: "pandadoc",
    category: "Ventes",
    description: "Préparez vos propositions et suivez la signature des documents.",
  },
  {
    id: "apollo",
    name: "Apollo",
    provider: "apollo",
    category: "Ventes",
    description: "Enrichissez les contacts autorisés par votre compte et votre abonnement.",
  },
  {
    id: "google-meet",
    name: "Google Meet",
    provider: "google",
    category: "Réunions",
    description: "Créez vos réunions avec un lien Meet et reliez-les à votre CRM.",
  },
  {
    id: "zoom",
    name: "Zoom",
    provider: "zoom",
    category: "Réunions",
    description: "Organisez vos réunions et retrouvez les ressources autorisées.",
  },
];
export const connectionMessages: Record<string, string> = {
  disconnected: "Déconnecté",
  connecting: "Connexion en cours",
  connected: "Connecté",
  syncing: "Synchronisation en cours",
  degraded: "Connexion à vérifier",
  needs_reauth: "À reconnecter",
  revoked: "Déconnexion en cours",
  error: "Une intervention est nécessaire",
};
