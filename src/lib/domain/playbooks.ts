export const playbooks = [
  {
    id: "discovery",
    name: "Qualifier avec un contexte clair",
    stage: "Nouveau",
    why: "Vérifier le besoin, le décideur et le calendrier avant d’avancer.",
    steps: [
      { title: "Confirmer le besoin et les critères de décision", days: 1 },
      { title: "Identifier le décideur et le calendrier prévu", days: 2 },
    ],
  },
  {
    id: "proposal",
    name: "Suivre une proposition sans oubli",
    stage: "Proposition",
    why: "Planifier un retour sur le périmètre, les exclusions et la décision.",
    steps: [
      {
        title: "Confirmer la réception et le périmètre de la proposition",
        days: 2,
      },
      {
        title: "Clarifier les exclusions et convenir de la prochaine décision",
        days: 5,
      },
    ],
  },
  {
    id: "handover",
    name: "Passer de la vente à la réalisation",
    stage: "Gagné",
    why: "Organiser la transmission et confirmer les engagements acceptés.",
    steps: [
      {
        title: "Préparer le dossier de réalisation et ses exclusions",
        days: 1,
      },
      { title: "Confirmer les jalons avec le client", days: 3 },
    ],
  },
] as const;
