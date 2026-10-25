"use client";
import { Sparkles, CalendarDays, Users, ChartNoAxesCombined, MessageSquare } from "lucide-react";
import styles from "./assistant.module.css";
export const assistantStarters = [
  {
    label: "Préparer un rendez-vous",
    icon: CalendarDays,
    prompt:
      "Prépare mon prochain rendez-vous à partir des notes, réunions et engagements accessibles. Donne le contexte, les questions à poser et les points à vérifier. Cite les sources et reste en lecture seule.",
  },
  {
    label: "Faire le point client",
    icon: Users,
    prompt:
      "Aide-moi à faire le point sur un client : informations documentées, échanges récents, engagements et prochaines étapes à envisager. Cite les sources et reste en lecture seule.",
  },
  {
    label: "Analyser mon pipeline",
    icon: ChartNoAxesCombined,
    prompt:
      "Analyse mon pipeline commercial accessible : opportunités, étapes, échéances et points de vigilance. Cite les sources, sépare les devises, indique les limites des données et reste en lecture seule.",
  },
  {
    label: "Résumer mes échanges",
    icon: MessageSquare,
    prompt:
      "Résume mes échanges récents accessibles, les décisions et les engagements à vérifier. Cite les sources, précise les incertitudes et reste en lecture seule.",
  },
];
export function AssistantWelcome() {
  return (
    <div className={styles.welcome}>
      <span className={styles.welcomeMark} aria-hidden="true">
        <Sparkles size={31} strokeWidth={1.4} />
      </span>
      <h1>Que faisons-nous avancer aujourd’hui&nbsp;?</h1>
    </div>
  );
}
export function AssistantQuickActions({
  disabled,
  onChoose,
}: {
  disabled: boolean;
  onChoose: (prompt: string) => void;
}) {
  return (
    <div className={styles.suggestions}>
      <div className={styles.promptGrid} aria-label="Suggestions pour une nouvelle discussion">
        {assistantStarters.map(({ label, prompt, icon: Icon }) => (
          <button
            type="button"
            key={label}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChoose(prompt)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
