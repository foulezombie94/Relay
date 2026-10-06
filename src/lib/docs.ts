export type HelpArticle = {
  id: string;
  category: string;
  title: string;
  description: string;
  sections: { title: string; paragraphs: string[]; steps?: string[] }[];
  href?: string;
};
export const helpArticles: HelpArticle[] = [
  {
    id: "demarrer",
    category: "Premiers pas",
    title: "Créer votre espace et démarrer",
    description: "Du premier compte à votre première relation client.",
    href: "/login",
    sections: [
      {
        title: "Votre compte",
        paragraphs: [
          "Créez votre compte depuis Connexion. Si la confirmation email est activée, ouvrez le lien reçu avant de vous connecter. La récupération de mot de passe est disponible sur la même page.",
        ],
        steps: [
          "Créer et confirmer votre compte.",
          "Nommer votre espace de travail.",
          "Ajouter une entreprise, une personne et une opportunité.",
        ],
      },
      {
        title: "Votre équipe",
        paragraphs: [
          "Dans Paramètres, les administrateurs peuvent inviter des membres et choisir leur rôle. Le propriétaire et les administrateurs configurent le CRM ; les membres travaillent sur les données ; les lecteurs ne peuvent pas les modifier. Les invitations se partagent manuellement : Relay ne les envoie pas automatiquement par email.",
        ],
      },
    ],
  },
  {
    id: "fiches",
    category: "Votre CRM",
    title: "Personnes, entreprises et opportunités",
    description: "Trois vues adaptées à trois types de données.",
    href: "/app/companies",
    sections: [
      {
        title: "Choisir la bonne fiche",
        paragraphs: [
          "Personnes regroupe vos contacts et leurs coordonnées. Entreprises centralise vos comptes et prospects. Opportunités suit une vente avec montant, devise, étape, responsable et date de clôture. Les personnes et entreprises ne portent pas de montant commercial dans leur aperçu.",
        ],
      },
      {
        title: "Relier le contexte",
        paragraphs: [
          "Ouvrez une fiche pour retrouver relations, notes, tâches, engagements, activités et documents. L’onglet Relations permet de relier des fiches. Les raccourcis dans l’aperçu ouvrent directement les fiches liées. La prochaine action affiche une tâche ou un engagement ouvert selon son échéance.",
        ],
        steps: [
          "Ouvrir une fiche.",
          "Ajouter les coordonnées et un responsable.",
          "Relier le compte, les contacts et les opportunités.",
          "Ajouter une prochaine action.",
        ],
      },
      {
        title: "Retrouver votre organisation",
        paragraphs: [
          "Recherche, tri, responsable et colonnes permettent de composer une vue. Enregistrez-la pour la retrouver et la partager dans votre espace. L’export CSV reprend les filtres de votre sélection.",
        ],
      },
    ],
  },
  {
    id: "importer",
    category: "Votre CRM",
    title: "Importer un CSV ou un fichier Excel",
    description: "Associer les colonnes, vérifier les lignes et enregistrer.",
    href: "/app/people",
    sections: [
      {
        title: "Préparer le fichier",
        paragraphs: [
          "Le fichier doit avoir une première ligne avec des noms de colonnes uniques. Formats acceptés : CSV et Excel .xlsx. Limites : 5 Mo, 1 000 lignes et 100 colonnes. Excel utilise uniquement la première feuille ; remplacez les formules par leurs valeurs.",
        ],
        steps: [
          "Ouvrir Personnes, Entreprises ou Opportunités.",
          "Cliquer sur Importer CSV / Excel.",
          "Associer chaque colonne à un champ Relay, notamment le nom.",
          "Choisir le format décimal et la politique de doublons.",
          "Vérifier les lignes, puis confirmer l’import.",
        ],
      },
      {
        title: "Erreurs et doublons",
        paragraphs: [
          "La vérification n’écrit aucune fiche. Les lignes invalides sont détaillées et téléchargeables. Vous pouvez corriger le fichier ou accepter explicitement d’importer seulement les lignes valides. Les personnes sont rapprochées par email, les entreprises par domaine ; les opportunités ne sont pas rapprochées par leur nom. Aucune fiche existante n’est écrasée.",
        ],
      },
      {
        title: "Reprise et historique",
        paragraphs: [
          "L’écriture des fiches et du journal est transactionnelle : une erreur de base annule l’ensemble de cette tentative. Réessayer le même fichier avec les mêmes paramètres restitue l’import déjà enregistré. L’historique affiche les quantités créées, les doublons ignorés et les erreurs.",
        ],
      },
    ],
  },
  {
    id: "pipelines",
    category: "Ventes",
    title: "Pipelines et probabilités",
    description: "Séparer les cycles de vente et définir vos hypothèses.",
    href: "/app/pipelines",
    sections: [
      {
        title: "Configurer un pipeline",
        paragraphs: [
          "Le pipeline principal est créé avec l’espace. Les propriétaires et administrateurs peuvent créer d’autres pipelines et renommer leurs six étapes. Nouveau, Qualification, Proposition, Négociation, Gagné et Perdu restent les états de référence pour les règles internes.",
        ],
        steps: [
          "Ouvrir Pipelines et créer ou configurer un pipeline.",
          "Nommer les étapes et définir leurs probabilités.",
          "Choisir le pipeline dans chaque opportunité.",
        ],
      },
      {
        title: "Comprendre les probabilités",
        paragraphs: [
          "Les probabilités sont des hypothèses de votre équipe, pas des prédictions calculées par une IA. Une opportunité hérite de la probabilité de son étape ; décochez cette option pour choisir un pourcentage propre à cette vente. Gagné vaut toujours 100 %, Perdu 0 %.",
        ],
      },
      {
        title: "Documenter une perte",
        paragraphs: [
          "Lorsque vous passez une opportunité à Perdu depuis Relay, renseignez une raison. Cette information aide à comprendre les tendances dans Rapports. Si une ancienne fiche n’a pas de raison, le rapport l’indique au lieu d’en inventer une.",
        ],
      },
    ],
  },
  {
    id: "rapports",
    category: "Ventes",
    title: "Lire les rapports et prévisions",
    description: "Distinguer chiffre réalisé, pipeline ouvert et prévision.",
    href: "/app/reports",
    sections: [
      {
        title: "Les quatre valeurs",
        paragraphs: [
          "Pipeline ouvert : somme des ventes qui ne sont ni gagnées ni perdues. Prévision pondérée : somme du montant de chaque vente ouverte multiplié par sa probabilité. Ventes gagnées : somme des opportunités gagnées. Ventes perdues : valeur des opportunités perdues. Il ne s’agit pas d’un suivi de facturation ni d’une garantie de revenu.",
        ],
      },
      {
        title: "Périodes et devises",
        paragraphs: [
          "Les clôtures attendues utilisent la date prévue de chaque opportunité ouverte. Sans date, la vente apparaît dans une ligne distincte. Chaque devise a son propre rapport ; Relay n’additionne pas euros et dollars et ne fait pas de conversion. Les filtres portent sur le pipeline et le responsable. Le mois sélectionné filtre uniquement les résultats gagnés/perdus, à partir du dernier passage effectif au statut actuel dans le journal (UTC). Les montants sont les valeurs actuelles des fiches. Une vente sans date d’issue fiable est exclue du total mensuel et signalée. La date prévue ne sert jamais de date réelle de signature.",
        ],
      },
      {
        title: "Portée",
        paragraphs: [
          "Les rapports parcourent toutes les opportunités accessibles correspondant aux filtres, jusqu’à 50 000 lignes. Le pipeline visuel, lui, présente les 50 résultats de la page courante ; ses sommes concernent cette page. Les tâches du rapport sont filtrées par responsable, tous pipelines confondus. La comparaison des probabilités configurées avec les taux observés utilise les ventes actuellement clôturées, ayant traversé l’étape dans leur pipeline actuel. Une vente compte une seule fois par étape ; les ventes ouvertes et les étapes non observées sont exclues. Moins de 20 ventes résolues est signalé comme échantillon faible. Cette comparaison descriptive ne modifie jamais automatiquement les probabilités. Au-delà de 100 000 événements du journal, les métriques historiques ne sont pas affichées avec des données partielles.",
        ],
      },
    ],
  },
  {
    id: "recherche",
    category: "Votre CRM",
    title: "Rechercher dans tout votre contexte",
    description: "Fiches, notes, tâches, engagements et réunions.",
    href: "/app/search",
    sections: [
      {
        title: "Utiliser la recherche globale",
        paragraphs: [
          "Saisissez au moins deux caractères et choisissez une catégorie ou Tout le contexte. La recherche couvre les noms et coordonnées des fiches, le contenu des notes, les descriptions des tâches, les passages sources des engagements et les résumés de réunions.",
        ],
        steps: [
          "Saisir un mot ou une expression entre guillemets.",
          "Filtrer par catégorie si nécessaire.",
          "Lire l’extrait et ouvrir la fiche liée.",
        ],
      },
      {
        title: "Droits et limites",
        paragraphs: [
          "Vos droits sont vérifiés à chaque recherche. Les notes privées d’un autre membre restent exclues. Au maximum 25 résultats sont affichés par catégorie ; les comptes complets vous indiquent quand affiner votre recherche. Il s’agit d’une recherche textuelle indexée, pas d’une recherche sémantique.",
        ],
      },
    ],
  },
  {
    id: "emails",
    category: "Communication",
    title: "Créer et utiliser un modèle email",
    description: "Réutiliser un message sans perdre le contrôle de l’envoi.",
    href: "/app/email-templates",
    sections: [
      {
        title: "Préparer un modèle",
        paragraphs: [
          "Les modèles sont partagés dans votre espace. Renseignez un nom, un objet et un corps de message. Variables disponibles : {{name}}, {{email}}, {{domain}} et {{workspace}}. Elles reprennent les valeurs de la fiche sélectionnée et de votre espace.",
        ],
      },
      {
        title: "Rédiger et envoyer",
        paragraphs: [
          "Depuis Messages, ouvrez Rédiger un email. Choisissez une fiche et un modèle, puis appliquez-le. Les données manquantes sont signalées. Vous pouvez modifier le destinataire, l’objet et le texte avant de confirmer l’envoi. Créer ou modifier un modèle n’envoie aucun email.",
        ],
        steps: [
          "Connecter Gmail ou Outlook dans Intégrations.",
          "Rédiger un email et sélectionner une fiche.",
          "Appliquer un modèle puis relire le message.",
          "Confirmer l’envoi au destinataire affiché.",
        ],
      },
      {
        title: "Limites",
        paragraphs: [
          "Les modèles produisent du texte simple. Les séquences présentes dans Relay préparent des étapes mais n’envoient pas automatiquement des campagnes. La programmation, l’arrêt sur réponse et la désinscription d’une séquence restent à développer.",
        ],
      },
    ],
  },
  {
    id: "integrations",
    category: "Communication",
    title: "Connecter Gmail, Outlook et les calendriers",
    description: "Autoriser un service et comprendre les messages d’erreur.",
    href: "/app/integrations",
    sections: [
      {
        title: "Connecter un service",
        paragraphs: [
          "Chaque service dispose d’un consentement séparé : Gmail, Google Calendar, Outlook et Outlook Calendar. Utilisez Connecter dans Intégrations, acceptez les permissions puis revenez dans Relay. Les messages et événements importés restent privés au compte connecté.",
        ],
      },
      {
        title: "Synchroniser",
        paragraphs: [
          "Synchroniser effectue un import manuel de 25 messages ou événements maximum. Les calendriers sont en lecture seule. Le logiciel n’annonce pas de synchronisation complète en arrière-plan.",
        ],
      },
      {
        title: "Résoudre les erreurs",
        paragraphs: [
          "Accès refusé par Google en mode test : l’administrateur doit ajouter votre compte aux utilisateurs de test du projet OAuth. API Gmail ou Calendar désactivée : activez le service correspondant dans Google Cloud. Permissions insuffisantes ou consentement expiré : reconnectez le service. Relay affiche les erreurs connues sans révéler les jetons. La déconnexion locale ne remplace pas la révocation du consentement chez le fournisseur.",
        ],
      },
    ],
  },
  {
    id: "doublons",
    category: "Votre CRM",
    title: "Comparer, fusionner et annuler une fusion",
    description: "Nettoyer les fiches avec un aperçu et un historique.",
    href: "/app/quality",
    sections: [
      {
        title: "Décider du doublon",
        paragraphs: [
          "Qualité des données détecte les doublons potentiels. Comparer affiche les deux fiches. Vous pouvez modifier une fiche ; Relay recalcule alors la comparaison avant une fusion. Garder séparés conserve votre décision ; Ignorer reporte le groupe de sept jours.",
        ],
      },
      {
        title: "Fusion et restauration",
        paragraphs: [
          "Fusionner exige un aperçu et une confirmation. Les versions des fiches sont vérifiées et la modification se fait dans une transaction. Un journal conserve la fusion. L’annulation est réservée aux administrateurs ; si les données ont changé depuis la fusion, une restauration pouvant écraser ces changements est refusée.",
        ],
      },
    ],
  },
  {
    id: "securite",
    category: "Administration",
    title: "Rôles et données privées",
    description: "Qui peut voir, modifier et partager votre contexte.",
    href: "/app/settings",
    sections: [
      {
        title: "Isolation des espaces",
        paragraphs: [
          "Chaque ressource appartient à un espace et les règles de la base limitent l’accès à ses membres. Les lecteurs consultent sans modifier. La configuration des pipelines est réservée aux propriétaires et administrateurs. Une note privée n’est visible que par son auteur ; une communication synchronisée reste privée au compte connecté.",
        ],
      },
      {
        title: "Partage client",
        paragraphs: [
          "Un portail client montre uniquement les éléments explicitement partagés avec ce portail. Les accès se rattachent à une adresse vérifiée. Les liens temporaires de fichiers expirent après 60 secondes ; retirer un accès n’annule pas rétroactivement un lien déjà émis avant cette expiration.",
        ],
      },
      {
        title: "Configuration technique",
        paragraphs: [
          "L’hébergement public nécessite HTTPS, les variables serveur, les callbacks OAuth et la configuration Supabase. Les secrets ne doivent jamais être placés dans une URL, une page publique ou le code client. Les clés Zapier peuvent être limitées et révoquées dans Intégrations. Relay n’annonce pas de certification Enterprise, de SSO SAML ou de capacité de charge mesurée.",
        ],
      },
    ],
  },
];
