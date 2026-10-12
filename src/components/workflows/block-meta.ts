import {
  Bell,
  CalendarDays,
  CheckCheck,
  Clock3,
  FileText,
  GitBranch,
  ListPlus,
  Mail,
  MessageSquare,
  Settings2,
  Sparkles,
  Webhook,
} from "lucide-react";
import type { WorkflowAction } from "@/lib/domain/types";
export const blockMeta: Record<
  WorkflowAction["type"],
  { icon: typeof Bell; category: string; color: string; description: string }
> = {
  task: {
    icon: CheckCheck,
    category: "Tâches",
    color: "blue",
    description: "Créer une tâche et l’attribuer au bon responsable.",
  },
  commitment: {
    icon: CheckCheck,
    category: "Engagements",
    color: "blue",
    description: "Proposer un engagement à valider par votre équipe.",
  },
  note: {
    icon: FileText,
    category: "Notes",
    color: "blue",
    description: "Ajouter une note partagée à la fiche.",
  },
  set_field: {
    icon: Settings2,
    category: "Fiches",
    color: "blue",
    description: "Modifier une information autorisée de la fiche.",
  },
  add_to_list: {
    icon: ListPlus,
    category: "Listes",
    color: "blue",
    description: "Ajouter la fiche à une liste de votre espace.",
  },
  branch: {
    icon: GitBranch,
    category: "Logique",
    color: "green",
    description: "Séparer le parcours selon une condition Oui / Non.",
  },
  delay: {
    icon: Clock3,
    category: "Logique",
    color: "green",
    description: "Attendre une durée puis reprendre le workflow.",
  },
  wait_until: {
    icon: Clock3,
    category: "Logique",
    color: "green",
    description: "Attendre une date, une condition ou une réponse email.",
  },
  ai: {
    icon: Sparkles,
    category: "Intelligence artificielle",
    color: "purple",
    description: "Analyser un texte et utiliser une sortie structurée.",
  },
  email: {
    icon: Mail,
    category: "Communication",
    color: "purple",
    description: "Envoyer un email via le compte connecté et autorisé.",
  },
  slack: {
    icon: MessageSquare,
    category: "Communication",
    color: "purple",
    description: "Publier un message dans un canal Slack configuré.",
  },
  notify: {
    icon: Bell,
    category: "Communication",
    color: "purple",
    description: "Notifier votre équipe dans Zyliad.",
  },
  calendar: {
    icon: CalendarDays,
    category: "Calendrier",
    color: "purple",
    description: "Créer un événement dans le calendrier connecté.",
  },
  webhook: {
    icon: Webhook,
    category: "Utilitaires",
    color: "amber",
    description: "Appeler une destination HTTPS préalablement autorisée.",
  },
};
