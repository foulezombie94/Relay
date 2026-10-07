import { crmSources } from "./domain/crm-sources";
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
    id: "migrations",
    category: "Importer et migrer",
    title: "Migrer votre CRM vers Relay",
    description:
      "Attio, Pipedrive, Close, HubSpot, Freshsales, Copper, Zoho, folk et monday CRM.",
    href: "/app/companies",
    sections: [
      {
        title: "Un parcours en quatre étapes",
        paragraphs: [
          "Choisissez l’origine, déposez l’export, associez les colonnes puis vérifiez l’aperçu. Aucune fiche n’est créée avant votre confirmation. Chaque table est importée dans une transaction ; un échec annule cette table. Plusieurs tables sont des imports distincts, pas une restauration globale atomique.",
        ],
        steps: [
          "Créez les champs personnalisés nécessaires et les pipelines de destination dans Relay.",
          "Importez les entreprises, puis les personnes et les opportunités. Choisissez le même CRM et le même nom de lot pour tous les fichiers du même compte source.",
          "Associez ID de la fiche dans le CRM source, puis ID des entreprises ou personnes associées. Les relations utilisent les identifiants exacts ; les noms seuls ne sont pas rapprochés.",
          "Vérifiez les formats décimaux, les devises, les étapes et les lignes rejetées. Confirmez le rejet des erreurs si vous ne les corrigez pas.",
          "Après traitement, consultez créations, doublons, relations créées et relations en attente. Importer ensuite une cible manquante dans le même lot résout sa relation.",
        ],
      },
      {
        title: "Limites et reprise",
        paragraphs: [
          "4 Mo par fichier, 1 000 lignes par table, 100 colonnes, 20 associations maximum par ligne. Les ZIP sont limités à 256 entrées et 20 Mo décompressés, avec 8 Mo par entrée. Les ZIP chiffrés, imbriqués ou ZIP64 ne sont pas acceptés. Les classeurs Excel à l’intérieur d’un ZIP doivent être extraits puis importés séparément. Les anciens .xls doivent être enregistrés en .xlsx. Les classeurs sont limités à 25 feuilles et 150 000 cellules au total. Exportez les identifiants longs en texte ou CSV pour éviter les arrondis d’Excel.",
          "Les identifiants sont isolés par espace de travail, CRM, lot et type de fiche. Utilisez un autre lot pour un autre compte source. Un ID source déjà importé ne recrée et ne modifie jamais sa fiche. Les rapprochements par email / domaine peuvent être ignorés ; les opportunités sans ID ne sont pas rapprochées par nom.",
          "Le JSON Close permet de sélectionner les leads, contacts et opportunités, y compris les collections imbriquées. Les montants des opportunités JSON Close sont convertis des centimes vers la devise ; choisissez le format international. Les autres JSON doivent contenir un tableau de fiches ou une collection data, records, leads, contacts, companies, accounts, people, deals ou opportunities.",
          "Relay reprend les personnes, entreprises et opportunités avec les champs explicitement associés. Une sauvegarde ZIP complète peut contenir des tables hors de ce périmètre. N’importez pas une table de notes, membres, tâches ou paramètres comme une entreprise ; conservez la sauvegarde pour ces données.",
        ],
      },
    ],
  },
  ...crmSources
    .filter((s) => s.id !== "file")
    .map(
      (s): HelpArticle => ({
        id: "migration-" + s.id,
        category: "Importer et migrer",
        title: "Importer depuis " + s.name,
        description:
          "Préparer l’export " + s.formats + " et conserver les relations.",
        href: s.url,
        sections: [
          {
            title: "Exporter depuis " + s.name,
            paragraphs: [
              "Vérifiez que votre compte dispose des droits d’export. Les intitulés peuvent varier selon la langue et la version du produit.",
            ],
            steps: [...s.steps],
          },
          {
            title: "Importer dans Relay",
            paragraphs: [
              "Dans Entreprises, Personnes ou Opportunités, cliquez sur Importer et choisissez " +
                s.name +
                ". Déposez votre fichier, choisissez sa table puis la destination. Un fichier correspond à un type de fiche.",
              "Associez le nom et les champs utiles. Pour les relations, conservez l’ID de chaque fiche et les ID des cibles, séparés par des points-virgules ou fournis dans un tableau JSON de chaînes. Utilisez le même nom de lot pour tous les fichiers du même compte source.",
              "Pour les opportunités, choisissez le pipeline et faites correspondre chaque étape source à une étape Relay. Les autres libellés, propriétaires et configurations ne sont pas automatiquement recréés.",
            ],
            steps: [
              "Vérifier l’import affiche jusqu’à 20 lignes valides et le rapport de toutes les erreurs.",
              "Corrigez l’export ou confirmez explicitement le rejet des lignes invalides.",
              "Confirmez l’import. Consultez les relations en attente et importez les cibles manquantes avec le même lot.",
            ],
          },
          {
            title: "Ce qui est repris",
            paragraphs: [
              "Noms, email principal, domaine, montant, devise, étape, date de clôture, motif de perte, probabilité et champs personnalisés déjà créés, selon vos correspondances. Les fichiers et réglages du backup, les utilisateurs, activités, emails et automatisations ne sont pas restaurés. Les liens exigent des ID explicites ; les noms d’entreprise seuls demandent un rapprochement manuel depuis Relations.",
              "Pour les gros exports, extrayez les CSV puis découpez chaque table en lots de 1 000 lignes et 4 Mo maximum. Gardez le même en-tête et le même nom de lot. L’import n’écrase pas les fiches existantes.",
            ],
          },
        ],
      }),
    ),
  {
    id: "demarrer",
    category: "Premiers pas",
    title: "Créer votre espace et démarrer",
    description: "Du premier compte à votre première relation client.",
    href: "/login",
    sections: [
      {
        title: "Créer votre compte",
        paragraphs: [
          "Relay organise votre travail dans un espace qui regroupe les contacts et les ventes de votre équipe.",
        ],
        steps: [
          "Depuis Connexion, choisissez l’inscription.",
          "Renseignez votre email et votre mot de passe.",
          "Si une confirmation est demandée, ouvrez le lien reçu par email ; vérifiez les courriers indésirables.",
          "Connectez-vous, nommez votre entreprise puis choisissez Créer mon espace.",
        ],
      },
      {
        title: "Commencer avec trois fiches",
        paragraphs: [
          "Créez une entreprise pour le compte client, une personne pour votre interlocuteur et une opportunité pour la vente. Reliez-les depuis Relations dans une fiche. Ajoutez ensuite une tâche avec échéance pour la prochaine action.",
        ],
      },
      {
        title: "Changer d’espace",
        paragraphs: [
          "Le menu du nom de l’espace permet de passer d’un espace à un autre. Chaque espace possède ses propres fiches ; changer d’espace ne déplace pas vos contacts.",
        ],
      },
      {
        title: "Mot de passe oublié ou invitation",
        paragraphs: [
          "Utilisez la récupération du mot de passe depuis Connexion et ouvrez le lien reçu. Si vous êtes invité, utilisez exactement l’adresse invitée et confirmez-la avant de rejoindre l’équipe.",
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
          "Recherche, tri, responsable et colonnes permettent de composer une vue. Enregistrez-la pour la retrouver et la partager dans votre espace. Le bouton Exporter propose Excel, CSV, JSON et TSV et reprend les filtres de votre sélection.",
        ],
      },
    ],
  },
  {
    id: "importer",
    category: "Votre CRM",
    title: "Importer des fichiers et migrer depuis un CRM",
    description: "Associer les colonnes, vérifier les lignes et enregistrer.",
    href: "/app/people",
    sections: [
      {
        title: "Préparer votre fichier",
        paragraphs: [
          "Utilisez CSV, Excel .xlsx, JSON ou un ZIP contenant des CSV ou JSON : 4 Mo maximum au dépôt, 20 Mo après décompression, 256 entrées, 1 000 lignes par table et 100 colonnes. Pour un gros backup, extrayez les CSV sur votre ordinateur et découpez-les en fichiers de 1 000 lignes avec le même en-tête. Choisissez une table ou une feuille et sa ligne d’en-tête ; remplacez les formules Excel par leurs valeurs.",
        ],
      },
      {
        title: "Associer les colonnes",
        paragraphs: [
          "Prévoyez une colonne Nom et vérifiez les correspondances proposées. Prénom et nom peuvent être réunis automatiquement. Ignorez les colonnes inutiles ou créez vos champs personnalisés dans Relay avant l’import pour pouvoir les associer. Les activités, emails, fichiers joints et paramètres du CRM source ne sont pas restaurés.",
        ],
        steps: [
          "Ouvrez Personnes, Entreprises ou Opportunités selon le contenu.",
          "Choisissez Importer, indiquez le CRM source, la destination et le nom du lot, puis déposez votre fichier.",
          "Associez chaque colonne au champ correspondant, notamment le nom.",
          "Choisissez le format décimal : virgule pour 1 234,56 ou point pour 1,234.56.",
          "Choisissez la politique de doublons et lancez l’aperçu.",
        ],
      },
      {
        title: "Examiner les erreurs",
        paragraphs: [
          "L’aperçu ne crée aucune fiche. Téléchargez la liste d’erreurs si besoin. Vérifiez les dates, les devises comme EUR et la raison des ventes Perdues. Corrigez le fichier ou acceptez explicitement de n’importer que les lignes valides.",
        ],
      },
      {
        title: "Décider pour les doublons",
        paragraphs: [
          "Les personnes sont rapprochées par email, les entreprises par domaine. Les ventes ne sont pas rapprochées par leur nom. Vous pouvez ignorer les doublons ou créer les lignes puis examiner les rapprochements dans Qualité des données. Aucune fiche existante n’est écrasée.",
        ],
      },
      {
        title: "Confirmer et retrouver l’import",
        paragraphs: [
          "Relisez l’aperçu puis confirmez. Le résultat et l’historique indiquent créations, doublons ignorés et erreurs. Si une erreur empêche l’enregistrement, cette tentative n’ajoute pas seulement une partie des fiches. Réessayer le même fichier avec les mêmes réglages retrouve l’import déjà terminé.",
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
          "Le pipeline principal est créé avec l’espace. Les propriétaires et administrateurs peuvent créer d’autres pipelines et renommer les six étapes pour adapter le cycle de vente.",
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
        title: "Distinguer les quatre montants",
        paragraphs: [
          "Pipeline ouvert : valeur brute des ventes en cours. Forecast pondéré : montant de chaque vente en cours multiplié par son pourcentage. Gagné : valeur des ventes conclues. Perdu : valeur des ventes abandonnées. Chaque devise reste séparée.",
        ],
      },
      {
        title: "Un exemple de forecast",
        paragraphs: [
          "Une vente de 1 000 € à 25 % et une vente de 4 000 € à 50 % donnent 2 250 € de forecast ouvert. Les ventes gagnées ou perdues restent dans leurs propres montants et ne s’ajoutent pas à ces 2 250 €.",
        ],
      },
      {
        title: "Sélectionner vos résultats",
        paragraphs: [
          "Le mois concerne les ventes gagnées ou perdues. Les clôtures attendues utilisent les dates prévues des ventes encore ouvertes.",
        ],
        steps: [
          "Ouvrez Rapports.",
          "Choisissez un pipeline et un responsable, ou toute l’équipe.",
          "Choisissez le mois et l’année des résultats.",
          "Consultez séparément les devises et les clôtures attendues.",
        ],
      },
      {
        title: "Comparer aux taux historiques",
        paragraphs: [
          "Le taux observé compare les ventes gagnées aux ventes gagnées et perdues qui ont réellement traversé une étape du pipeline actuel. Les ventes ouvertes sont exclues. Les effectifs sont affichés ; moins de 20 ventes est signalé comme un échantillon faible. Cette comparaison ne change pas vos pourcentages.",
        ],
      },
      {
        title: "Comprendre les périodes",
        paragraphs: [
          "Les résultats utilisent le dernier passage enregistré au statut actuel, avec des périodes calculées en UTC, et les montants actuels des fiches. Les anciennes ventes sans date fiable sont signalées. Les fiches archivées sont exclues. Les tâches sont filtrées par responsable, tous pipelines confondus. Le rapport n’est pas un suivi des factures ou encaissements.",
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
          "Vos droits sont vérifiés à chaque recherche. Les notes privées d’un autre membre restent exclues. Au maximum 25 résultats sont affichés par catégorie ; les comptes complets vous indiquent quand affiner votre recherche. Essayez un mot présent dans le contenu plutôt qu’une question complète.",
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
          "Les modèles produisent du texte simple. Les séquences permettent des suivis planifiés après aperçu et confirmation : pause, arrêt à la réponse et désabonnement. Leur envoi nécessite un domaine public HTTPS et le service de suivi configuré par votre administrateur.",
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
        title: "Choisir le service",
        paragraphs: [
          "Gmail et Google Calendar se connectent séparément. Outlook et Outlook Calendar aussi. La connexion de la messagerie n’autorise donc pas automatiquement le calendrier.",
        ],
      },
      {
        title: "Connecter un compte",
        paragraphs: [
          "Les messages et événements importés restent privés au compte connecté.",
        ],
        steps: [
          "Ouvrez Intégrations et choisissez Connecter sur le service.",
          "Sélectionnez votre compte Google ou Microsoft et acceptez les permissions.",
          "Revenez dans Relay et vérifiez le compte affiché.",
          "Choisissez Synchroniser puis consultez Messages.",
        ],
      },
      {
        title: "Comprendre la synchronisation",
        paragraphs: [
          "Chaque lot importe jusqu’à 100 éléments. Cliquez sur Continuer l’import tant qu’il reste des pages ; la progression est conservée après une interruption. Le premier import mail couvre les 30 derniers jours, puis les nouveaux messages avec un léger chevauchement qui évite les pertes à la frontière. Les emails montrent un aperçu. Les calendriers restent en lecture et couvrent les 30 prochains jours. La synchronisation automatique est une option à activer pour chacun de vos comptes ; elle fonctionne lorsque le service de synchronisation est actif.",
        ],
      },
      {
        title: "Résoudre un refus",
        paragraphs: [
          "Si Google indique que Relay est en test, demandez à l’administrateur d’autoriser votre adresse. Si les permissions sont refusées ou expirées, reconnectez le service. Si le problème persiste, transmettez le service, l’heure et le message affiché à votre administrateur.",
        ],
      },
      {
        title: "Déconnecter",
        paragraphs: [
          "Utilisez Déconnecter pour arrêter l’utilisation du compte dans Relay. Vous pouvez aussi retirer l’autorisation depuis votre compte Google ou Microsoft ; la déconnexion dans Relay ne remplace pas cette action.",
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
          "Fusionner exige un aperçu et une confirmation. Relay vérifie que les fiches n’ont pas changé et conserve la fusion dans un historique. L’annulation est réservée aux administrateurs ; si les données ont changé depuis la fusion, une restauration pouvant écraser ces changements est refusée.",
        ],
      },
    ],
  },
  {
    id: "securite",
    category: "Votre équipe",
    title: "Inviter l’équipe et choisir les droits",
    description: "Invitations, rôles, réattribution et retrait d’accès.",
    href: "/app/settings#equipe",
    sections: [
      {
        title: "Comprendre les rôles",
        paragraphs: [
          "Le propriétaire gère l’espace et les administrateurs. Les administrateurs configurent l’espace et gèrent les membres et lecteurs ; seul le propriétaire peut inviter, nommer ou modifier un administrateur. Les membres créent et modifient les données du CRM. Les lecteurs consultent et peuvent exporter, sans modifier les données.",
          "Ces droits s’appliquent à tout l’espace, sans restriction par département ou par fiche. Les données privées gardent leurs propres restrictions. Les clients externes utilisent un portail, pas un rôle de membre.",
        ],
      },
      {
        title: "Inviter votre équipe",
        paragraphs: [
          "Une invitation expire après 7 jours. L’accès exige un lien personnel valide, une connexion avec exactement l’adresse invitée vérifiée, puis une confirmation sur la page d’invitation. Une simple connexion au CRM ne rejoint pas l’équipe.",
          "Aucun email d’invitation n’est envoyé. Copiez le lien personnel affiché après la création et partagez-le uniquement avec la personne invitée. Pour des raisons de sécurité, il n’est affiché qu’après sa génération ; si vous le perdez, renouvelez-le depuis Invitations.",
        ],
        steps: [
          "Dans Paramètres, ouvrez Équipe et accès puis Inviter.",
          "Renseignez l’adresse exacte, choisissez le rôle et créez l’invitation.",
          "Copiez le lien affiché dans Votre lien d’invitation et partagez-le avec cette personne.",
          "La personne ouvre le lien, se connecte ou crée son compte avec cette adresse, puis vérifie son email. Elle revient sur l’invitation et clique sur Accepter et rejoindre l’espace.",
          "Vérifiez son apparition dans Membres et le statut Acceptée dans Invitations.",
        ],
      },
      {
        title: "Suivre, renouveler ou annuler une invitation",
        paragraphs: [
          "L’onglet Invitations distingue En attente, Expirée, Acceptée et Annulée. Utilisez la recherche, le filtre de rôle et la pagination pour retrouver une adresse.",
          "Renouveler le lien remet l’échéance à 7 jours et invalide immédiatement l’ancien lien. Copiez et partagez le nouveau lien affiché. Attendez au moins une minute entre deux renouvellements. Annuler empêche l’acceptation future ; cela ne retire pas l’accès d’une personne déjà membre. Gérez alors cette personne dans Membres.",
          "Un espace peut avoir 100 invitations actives en attente. Si une limite est atteinte, annulez les invitations inutiles ou attendez avant de recommencer.",
        ],
      },
      {
        title: "Modifier les droits",
        paragraphs: [
          "Dans Membres, choisissez le nouveau rôle puis confirmez. Votre propre accès et celui du propriétaire sont protégés. Un administrateur ne peut pas modifier un autre administrateur. Si le rôle a changé entre-temps, Relay refuse la modification : actualisez la liste et recommencez.",
          "Passer une personne à Lecteur désactive ses connexions Relay, ses synchronisations et ses traitements en attente. Ses séquences actives sont mises en pause. Revenir à Membre ne réactive pas automatiquement ces connexions : la personne devra les reconnecter.",
        ],
      },
      {
        title: "Retirer l’accès sans perdre le travail",
        steps: [
          "Dans Membres, choisissez Retirer l’accès.",
          "Consultez les nombres de fiches, tâches, engagements et réalisations concernés.",
          "Choisissez un responsable actif du même espace : propriétaire, administrateur ou membre.",
          "Confirmez Réattribuer et retirer l’accès.",
        ],
        paragraphs: [
          "La réattribution et le retrait sont réalisés ensemble : en cas d’échec, aucun changement partiel n’est conservé. Les notes, documents et historiques restent en place. L’accès à cet espace, y compris ses éventuels accès aux portails clients de cet espace, est retiré, sans supprimer le compte ni ses accès à d’autres espaces. Au-delà de 10 000 éléments attribués, réattribuez-les par lots avant le retrait.",
          "Relay supprime les identifiants de connexion conservés pour cet espace, désactive ses synchronisations, annule ses jobs actifs et met ses séquences en pause. Un email ou une autre action déjà envoyé au fournisseur externe ne peut pas être rappelé. Cela ne supprime pas les autorisations dans le compte Google ou Microsoft lui-même.",
          "Les changements de rôle, invitations et retraits sont conservés dans l’historique des modifications, visible aux administrateurs et au propriétaire.",
        ],
      },
      {
        title: "Respecter les données privées",
        paragraphs: [
          "Une note privée reste visible par son auteur. Les messages et événements importés restent privés au compte connecté. Les clients consultent seulement les éléments explicitement ajoutés à leur portail.",
        ],
      },
    ],
  },
  {
    id: "vues",
    category: "Votre CRM",
    title: "Filtrer, enregistrer une vue et exporter",
    description: "Retrouver vos sélections sans recommencer vos filtres.",
    href: "/app/people",
    sections: [
      {
        title: "Préparer une sélection",
        paragraphs: [
          "Utilisez la recherche, le tri, les filtres disponibles et le choix des colonnes. Pour vos opportunités, sélectionnez aussi un pipeline.",
        ],
      },
      {
        title: "Enregistrer une vue",
        paragraphs: [
          "Une vue mémorise votre présentation et vos critères : elle ne copie pas les fiches.",
        ],
        steps: [
          "Réglez les filtres et les colonnes utiles.",
          "Enregistrez la vue avec un nom clair, par exemple « Mes prospects ».",
          "Retrouvez-la dans le sélecteur des vues.",
          "Modifiez ou supprimez la vue si votre organisation change.",
        ],
      },
      {
        title: "Exporter",
        paragraphs: [
          "Cliquez sur Exporter dans Entreprises, Personnes ou Opportunités. Choisissez Excel (.xlsx) pour un tableau mis en forme, CSV pour les CRM et Google Sheets, JSON pour des données structurées ou TSV pour un tableau texte. Sélectionnez la vue actuelle (toutes ses pages) ou toutes les fiches actives de cet objet, puis les colonnes de la vue, toutes les propriétés ou une sélection personnalisée. L’identifiant Relay est toujours inclus et la devise accompagne les montants. En CSV, le point-virgule convient à Excel français et la virgule aux CRM internationaux. Pour réimporter, choisissez les identifiants de champs comme en-têtes. Les exports directs sont limités à 10 000 fiches et 4 Mo : affinez les filtres au-delà, aucun fichier partiel n’est téléchargé. Les notes, relations, messages et pièces jointes sont exclus. Les montants affichés dans le tableau concernent la page affichée ; utilisez Rapports pour les totaux.",
        ],
      },
    ],
  },
  {
    id: "listes",
    category: "Votre CRM",
    title: "Créer une liste de contacts ou d’entreprises",
    description: "Regrouper explicitement des fiches existantes.",
    href: "/app/lists",
    sections: [
      {
        title: "Liste ou vue ?",
        paragraphs: [
          "Une liste contient les fiches que vous ajoutez vous-même. Une vue sélectionne des résultats selon des filtres. Une liste convient par exemple aux entreprises rencontrées lors d’un événement.",
        ],
      },
      {
        title: "Remplir votre liste",
        paragraphs: ["Choisissez le type de fiches concerné."],
        steps: [
          "Ouvrez Listes et ajoutez une liste.",
          "Nommez-la et choisissez son type de fiches.",
          "Ouvrez la liste puis ajoutez une fiche existante.",
          "Répétez pour les autres contacts de votre sélection.",
        ],
      },
      {
        title: "Retirer et partager",
        paragraphs: [
          "Retirer de la liste ne supprime pas la fiche du CRM. Une liste privée est réservée à son propriétaire ; une liste partagée est consultable par l’équipe autorisée.",
        ],
      },
    ],
  },
  {
    id: "opportunites",
    category: "Ventes",
    title: "Suivre une opportunité jusqu’à sa clôture",
    description:
      "Préparer la prochaine action et documenter l’issue de la vente.",
    href: "/app/deals",
    sections: [
      {
        title: "Créer votre vente",
        paragraphs: [
          "Renseignez le nom, le pipeline, l’étape, le montant, la devise, le responsable et la clôture prévue. Reliez l’entreprise et vos interlocuteurs depuis la fiche.",
        ],
        steps: [
          "Ouvrez Opportunités et ajoutez une vente.",
          "Choisissez son pipeline et sa première étape.",
          "Enregistrez puis reliez le contact et l’entreprise.",
          "Ajoutez une tâche avec une échéance pour la prochaine action.",
        ],
      },
      {
        title: "Faire avancer le dossier",
        paragraphs: [
          "Changez l’étape depuis le tableau ou le pipeline. Ajustez la date prévue lorsque le calendrier change. Un changement d’étape ne crée pas automatiquement une relance.",
        ],
      },
      {
        title: "Gagner, perdre ou rouvrir",
        paragraphs: [
          "Gagné signifie que la vente est conclue. Perdu demande une raison, par exemple Budget ou Projet reporté. Ces ventes sortent du forecast ouvert. Si le dossier reprend, vous pouvez le replacer dans une étape ouverte ; sa prochaine clôture aura une nouvelle date de résultat.",
        ],
      },
      {
        title: "Préparer la livraison",
        paragraphs: [
          "Après une vente gagnée, créez son dossier dans Réalisation pour reprendre les engagements retenus et les critères de réussite.",
        ],
      },
    ],
  },
  {
    id: "taches",
    category: "Travail quotidien",
    title: "Créer des tâches et suivre vos prochaines actions",
    description: "Attribuer une action, une échéance et une priorité.",
    href: "/app/tasks",
    sections: [
      {
        title: "Créer une tâche",
        paragraphs: [
          "Choisissez un titre qui décrit l’action à faire, par exemple « Confirmer le budget avec le contact ».",
        ],
        steps: [
          "Ouvrez Tâches puis le bouton d’ajout.",
          "Renseignez le titre, la description, l’échéance et la priorité.",
          "Choisissez un responsable et la fiche concernée si nécessaire.",
          "Enregistrez la tâche.",
        ],
      },
      {
        title: "Suivre l’avancement",
        paragraphs: [
          "Passez à En cours quand le travail commence, Réalisé lorsqu’il est terminé ou Annulé s’il n’est plus nécessaire. Une échéance n’entraîne pas l’envoi automatique d’un email de rappel.",
        ],
      },
      {
        title: "Choisir quoi traiter",
        paragraphs: [
          "À traiter rassemble des priorités expliquées, notamment à partir des retards et prochaines actions. Ouvrez la fiche liée pour vérifier le contexte. Le score organise votre travail ; il ne prédit pas une vente.",
        ],
      },
    ],
  },
  {
    id: "notes",
    category: "Travail quotidien",
    title: "Écrire une note et choisir sa visibilité",
    description: "Conserver un compte rendu privé ou partagé avec l’équipe.",
    href: "/app/notes",
    sections: [
      {
        title: "Ajouter une note",
        paragraphs: [
          "Une note conserve une décision, un échange ou une information utile.",
        ],
        steps: [
          "Ouvrez Notes et ajoutez une note.",
          "Renseignez son titre et son contenu.",
          "Reliez la fiche concernée.",
          "Vérifiez l’option de confidentialité puis enregistrez.",
        ],
      },
      {
        title: "Choisir la confidentialité",
        paragraphs: [
          "Une note privée reste visible par son auteur. Une note partagée est accessible aux membres autorisés de l’espace. Vérifiez ce choix avant d’ajouter une information confidentielle.",
        ],
      },
      {
        title: "Retrouver et corriger",
        paragraphs: [
          "La recherche globale retrouve le contenu des notes que vous pouvez lire. Si Relay signale que la note a changé pendant votre édition, rechargez-la avant de reprendre votre correction.",
        ],
      },
    ],
  },
  {
    id: "documents",
    category: "Travail quotidien",
    title: "Joindre et partager des documents",
    description:
      "Rassembler devis, comptes rendus et livrables dans une fiche.",
    href: "/app/companies",
    sections: [
      {
        title: "Ajouter un fichier",
        paragraphs: ["Les documents se gèrent depuis la fiche concernée."],
        steps: [
          "Ouvrez la personne, l’entreprise ou l’opportunité.",
          "Accédez à ses documents et choisissez le fichier.",
          "Vérifiez le nom et attendez la confirmation de l’ajout.",
          "Ouvrez le document depuis la fiche pour le consulter.",
        ],
      },
      {
        title: "Vérifier le fichier",
        paragraphs: [
          "Chaque fichier est limité à 20 Mo. Les formats acceptés comprennent PDF, texte, CSV, Excel .xlsx et images PNG ou JPEG. Si l’ajout échoue, vérifiez le format et la taille.",
        ],
      },
      {
        title: "Partager avec un client",
        paragraphs: [
          "Joindre un fichier à une fiche ne le publie pas automatiquement. Ajoutez un élément dans le portail client et sélectionnez explicitement le document. Si un lien a expiré, rouvrez le fichier dans Relay pour obtenir un lien à jour.",
        ],
      },
    ],
  },
  {
    id: "reunions",
    category: "Communication",
    title: "Conserver un compte rendu de réunion",
    description: "Rattacher un résumé et une transcription à votre client.",
    href: "/app/meetings",
    sections: [
      {
        title: "Ajouter le compte rendu",
        paragraphs: [
          "Relay conserve les informations que vous ajoutez. Il ne rejoint pas vos appels et ne les enregistre pas automatiquement.",
        ],
        steps: [
          "Ouvrez Réunions et ajoutez un compte rendu.",
          "Renseignez le titre, le résumé et les informations disponibles.",
          "Ajoutez la transcription si vous en disposez.",
          "Reliez la fiche concernée puis enregistrez.",
        ],
      },
      {
        title: "Préparer la suite",
        paragraphs: [
          "Créez des tâches pour les prochaines actions et des engagements pour les promesses. Conservez le passage qui confirme une promesse pour pouvoir la retrouver.",
        ],
      },
      {
        title: "Retrouver une réunion",
        paragraphs: [
          "La recherche globale couvre le titre et le résumé. Choisissez un titre explicite pour distinguer premier rendez-vous, négociation et suivi.",
        ],
      },
    ],
  },
  {
    id: "engagements",
    category: "Suivi client",
    title: "Suivre les engagements et leurs preuves",
    description: "Passer d’une promesse à une réalisation vérifiable.",
    href: "/app/commitments",
    sections: [
      {
        title: "Créer une promesse précise",
        paragraphs: [
          "Décrivez ce qui a été promis, son échéance et sa source.",
        ],
        steps: [
          "Ouvrez Engagements et ajoutez un engagement.",
          "Renseignez la promesse, le responsable et la fiche concernée.",
          "Ajoutez le passage source et la date attendue.",
          "Choisissez À confirmer si la promesse doit encore être validée.",
        ],
      },
      {
        title: "Confirmer et réaliser",
        paragraphs: [
          "Passez à Confirmé lorsque l’équipe reconnaît la promesse puis à En cours pendant sa réalisation. Pour passer à Réalisé, ajoutez une preuve : livraison effectuée, livrable ou confirmation du client. Sans preuve, la clôture est refusée.",
        ],
      },
      {
        title: "Reporter ou annuler",
        paragraphs: [
          "Mettez à jour le statut et l’échéance si la promesse change. Conservez une note expliquant la décision. Le changement dans Relay n’informe pas automatiquement le client : prévenez-le si nécessaire.",
        ],
      },
    ],
  },
  {
    id: "contradictions",
    category: "Suivi client",
    title: "Examiner des informations contradictoires",
    description: "Comparer deux sources et conserver votre décision.",
    href: "/app/conflicts",
    sections: [
      {
        title: "Documenter le désaccord",
        paragraphs: [
          "Une contradiction peut concerner deux dates de livraison ou deux montants différents. Renseignez le sujet, la fiche et les deux passages sources.",
        ],
      },
      {
        title: "Décider avec le contexte",
        paragraphs: ["Relay ne décide pas quelle source est correcte."],
        steps: [
          "Ouvrez Contradictions et lisez les deux informations.",
          "Vérifiez leur date et leur contexte dans la fiche client.",
          "Clarifiez avec le responsable ou le client.",
          "Renseignez la résolution et choisissez Résolu ou Écarté.",
        ],
      },
      {
        title: "Mettre à jour le suivi",
        paragraphs: [
          "Corrigez ensuite les fiches, tâches ou engagements concernés. Résoudre un dossier ne corrige pas automatiquement les autres informations et ne remplace pas un échange avec le client.",
        ],
      },
    ],
  },
  {
    id: "realisation",
    category: "Suivi client",
    title: "Préparer la réalisation d’une vente gagnée",
    description: "Transmettre les engagements, le périmètre et les jalons.",
    href: "/app/handovers",
    sections: [
      {
        title: "Créer au bon moment",
        paragraphs: [
          "Le dossier de réalisation nécessite une opportunité Gagnée. Il reprend les engagements retenus au moment de sa création.",
        ],
      },
      {
        title: "Préparer la transmission",
        paragraphs: ["Relisez les promesses avant de créer le dossier."],
        steps: [
          "Ouvrez l’opportunité et vérifiez son statut Gagné.",
          "Vérifiez ses engagements confirmés ou en cours.",
          "Ouvrez Réalisation et créez le dossier lié à cette vente.",
          "Renseignez le périmètre accepté, les exclusions et les jalons, puis suivez le statut du dossier.",
        ],
      },
      {
        title: "Suivre les nouvelles promesses",
        paragraphs: [
          "Le dossier conserve les engagements repris à sa création. Si d’autres promesses apparaissent ensuite, vérifiez-les avec l’équipe et actualisez votre suivi ; ne supposez pas que le dossier s’est mis à jour seul.",
        ],
      },
    ],
  },
  {
    id: "portails",
    category: "Suivi client",
    title: "Partager un portail avec votre client",
    description: "Choisir les informations visibles et les accès autorisés.",
    href: "/app/portals",
    sections: [
      {
        title: "Créer et remplir le portail",
        paragraphs: [
          "Un portail affiche les actualités, étapes, décisions et documents que vous y ajoutez. Il ne partage pas toute la fiche CRM.",
        ],
        steps: [
          "Ouvrez Portails clients et créez un portail lié à la fiche.",
          "Ouvrez-le et ajoutez les éléments à partager.",
          "Pour un fichier, sélectionnez explicitement le document.",
          "Relisez le contenu avant de transmettre le lien.",
        ],
      },
      {
        title: "Autoriser le client",
        paragraphs: ["Les propriétaires et administrateurs gèrent les accès."],
        steps: [
          "Dans le portail, choisissez Autoriser un client.",
          "Renseignez son adresse exacte.",
          "Choisissez les commentaires autorisés et une expiration si nécessaire.",
          "Enregistrez puis transmettez manuellement le lien affiché.",
          "Demandez au client de créer son compte et de confirmer l’adresse invitée.",
        ],
      },
      {
        title: "Modifier ou révoquer",
        paragraphs: [
          "Dans Personnes autorisées, choisissez Modifier pour ajuster l’expiration, les commentaires ou révoquer l’accès. Un lien de fichier déjà ouvert peut rester utilisable brièvement.",
        ],
      },
      {
        title: "Le client ne voit rien",
        paragraphs: [
          "Vérifiez l’adresse confirmée, l’accès et son expiration. Ajoutez des éléments au portail : relier une fiche ne partage pas son activité entière. Aucun email d’invitation n’est envoyé automatiquement.",
        ],
      },
    ],
  },
  {
    id: "automatisations",
    category: "Organisation",
    title: "Utiliser les modèles de processus et les automatisations",
    description: "Préparer des actions puis relire leurs conséquences.",
    href: "/app/playbooks",
    sections: [
      {
        title: "Adapter un guide d’action",
        paragraphs: [
          "Les Modèles de processus proposent des processus commerciaux : ils sont différents des articles de ce centre d’aide.",
        ],
        steps: [
          "Ouvrez Modèles de processus et choisissez un processus.",
          "Cliquez sur Adapter ce modèle.",
          "Ajustez les titres et les délais pour votre équipe.",
          "Enregistrez le workflow préparé puis ouvrez Automatisations.",
        ],
      },
      {
        title: "Simuler puis confirmer",
        paragraphs: [
          "Cliquez sur Simuler et relisez les fiches concernées ainsi que les actions prévues. Aucune tâche n’a encore été créée. Annuler ferme l’aperçu ; Confirmer ces modifications applique les actions proposées.",
        ],
      },
      {
        title: "Recommencer si les données ont changé",
        paragraphs: [
          "Si l’aperçu a expiré ou si des fiches ont changé, relancez une simulation avant de confirmer.",
        ],
      },
      {
        title: "Fonctionnement actuel",
        paragraphs: [
          "Les workflows s’exécutent après aperçu et confirmation, jusqu’à 100 fiches correspondantes. Le formulaire permet de choisir les conditions et actions sans écrire de code. Les déclenchements automatiques de workflows ne sont pas actifs. Les séquences email disposent de leur propre programmation, sous réserve que le service de suivi soit configuré.",
        ],
      },
    ],
  },
  {
    id: "assistant",
    category: "Organisation",
    title: "Utiliser l’assistant IA",
    description:
      "Lire les sources et examiner les propositions avant de les ajouter.",
    href: "/app/assistant",
    sections: [
      {
        title: "Poser une question",
        paragraphs: [
          "L’assistant doit être activé par l’administrateur. Demandez par exemple un résumé client ou des engagements à examiner.",
        ],
        steps: [
          "Ouvrez Assistant IA.",
          "Choisissez une fiche ou conservez le contexte récent de l’espace.",
          "Posez une question précise.",
          "Lisez la réponse et vérifiez ses sources.",
        ],
      },
      {
        title: "Garder le contrôle",
        paragraphs: [
          "Une réponse peut être incomplète ou incorrecte. Vérifiez les échanges originaux. Ajouter pour examen humain crée une proposition à examiner ; cela ne valide pas définitivement une promesse ou une contradiction.",
        ],
      },
      {
        title: "S’il est indisponible",
        paragraphs: [
          "Contactez votre administrateur pour l’activation. Vous pouvez continuer à créer les notes, tâches et engagements manuellement. Ne transmettez pas votre mot de passe.",
        ],
      },
    ],
  },
  {
    id: "personnaliser",
    category: "Votre équipe",
    title: "Personnaliser vos champs et votre espace",
    description: "Adapter les informations suivies à votre activité.",
    href: "/app/settings",
    sections: [
      {
        title: "Modifier l’organisation",
        paragraphs: [
          "Un propriétaire ou administrateur peut modifier le nom de l’espace, le fuseau horaire, la devise par défaut et la préférence de langue. L’interface actuelle reste en français.",
        ],
      },
      {
        title: "Ajouter un champ",
        paragraphs: [
          "Un champ personnalisé peut suivre la taille d’une entreprise, une date de renouvellement ou un type de client.",
        ],
        steps: [
          "Dans Paramètres, ouvrez Objets et attributs puis Ajouter un attribut.",
          "Sélectionnez le type de fiches concerné.",
          "Donnez un nom affiché et un identifiant unique en lettres minuscules.",
          "Choisissez le type de valeur et si le champ est obligatoire.",
          "Pour une sélection, renseignez les options demandées puis enregistrez.",
        ],
      },
      {
        title: "Éviter de bloquer la saisie",
        paragraphs: [
          "Un champ obligatoire peut empêcher l’enregistrement d’une fiche incomplète. Commencez avec les informations réellement nécessaires. Archiver retire un champ de la saisie active ; Réactiver le remet à disposition.",
        ],
      },
      {
        title: "Créer un type de fiche",
        paragraphs: [
          "Créer un objet ajoute un type de fiches pour votre métier. Préparez son nom et ses champs avec l’équipe. Pour simplement regrouper des entreprises existantes, utilisez plutôt une liste.",
        ],
      },
    ],
  },
  {
    id: "depannage",
    category: "Premiers pas",
    title: "Résoudre les problèmes courants",
    description: "Les premières actions à essayer avant de demander de l’aide.",
    href: "/app/companies",
    sections: [
      {
        title: "Un bouton est désactivé",
        paragraphs: [
          "Vérifiez votre rôle. Un lecteur ne peut pas modifier les données et certaines actions sont réservées aux administrateurs. Attendez aussi la fin d’un enregistrement en cours.",
        ],
      },
      {
        title: "Une fiche ou une information manque",
        paragraphs: [
          "Vérifiez l’espace, les filtres, la vue, le pipeline et la recherche. Les fiches archivées ne sont pas dans les résultats actifs. Les notes privées d’un autre membre ne sont pas visibles.",
        ],
      },
      {
        title: "Un enregistrement est refusé",
        paragraphs: [
          "Relisez le message. Une vente Perdue demande une raison ; un engagement Réalisé demande une preuve. Complétez les champs obligatoires. Si la fiche a changé, rechargez-la avant de reprendre la correction.",
        ],
      },
      {
        title: "Un email ou un import échoue",
        paragraphs: [
          "Reconnectez le compte mail si ses permissions ont expiré. Pour l’import, vérifiez le format, la taille, les colonnes et les erreurs d’aperçu. En cas d’envoi incertain, vérifiez votre boîte de messages envoyés avant de recommencer.",
        ],
      },
      {
        title: "Demander de l’aide",
        paragraphs: [
          "Transmettez à votre administrateur la page, l’action, l’heure et le message exact. Masquez les informations confidentielles d’une capture. Ne communiquez jamais votre mot de passe.",
        ],
      },
    ],
  },
  {
    id: "notifications",
    category: "Organisation",
    title: "Suivre vos notifications et échéances",
    description: "Retrouver les actions attribuées et les échéances à venir.",
    href: "/app/tasks",
    sections: [
      {
        title: "Ouvrir vos rappels",
        paragraphs: [
          "La cloche en haut de votre espace indique le nombre de notifications non lues. Vous recevez une notification lorsqu’une tâche ou un engagement vous est attribué. Un rappel apparaît dans les 24 heures précédant l’échéance ; les rappels sont calculés toutes les cinq minutes, et la cloche se rafraîchit chaque minute.",
        ],
      },
      {
        title: "Traiter une action",
        paragraphs: [
          "Cliquez sur Ouvrir pour retrouver la tâche ou l’engagement concerné. Une notification lue ne termine pas votre tâche : changez son statut dans sa fiche. Les rappels restent dans votre historique ; une notification ancienne peut concerner une tâche déjà terminée ou retirée.",
        ],
      },
      {
        title: "Organiser votre journée",
        paragraphs: [
          "Dans Tâches ou Engagements, filtrez par responsable, statut et période. La recherche porte sur les données autorisées, au-delà de la page affichée. Utilisez Précédent et Suivant pour parcourir les résultats. Terminer une tâche conserve aussi la date réelle de réalisation.",
        ],
      },
      {
        title: "Travail en équipe",
        paragraphs: [
          "Si un collègue modifie une tâche, un engagement ou une contradiction pendant votre édition, Relay refuse d’écraser sa version. Rouvrez l’élément, comparez ses changements puis enregistrez votre modification.",
        ],
      },
    ],
  },
  {
    id: "sequences-suivi",
    category: "Relations clients",
    title: "Créer une séquence de suivi commercial",
    description: "Planifier des messages avec contrôle et arrêt à la réponse.",
    href: "/app/sequences",
    sections: [
      {
        title: "Préparer les messages",
        steps: [
          "Créez une séquence, nommez-la et choisissez son fuseau horaire.",
          "Ajoutez vos objets et messages, puis le délai en jours pour chaque étape. Le premier délai part de l’inscription ; les suivants partent du message précédent.",
          "Utilisez {{display_name}}, {{email}} ou {{domain}} pour personnaliser le texte. Une information manquante bloque la préparation.",
          "Enregistrez puis activez la séquence.",
        ],
        paragraphs: [
          "Les envois ont lieu du lundi au vendredi entre 9 h et 17 h dans le fuseau choisi. Un envoi prévu en dehors de cette plage est reporté.",
        ],
      },
      {
        title: "Inscrire un contact",
        steps: [
          "Ouvrez Contacts et historique.",
          "Choisissez une personne et votre compte Gmail ou Outlook connecté.",
          "Préparez l’aperçu et vérifiez chaque message et le destinataire.",
          "Confirmez explicitement l’inscription et les envois.",
        ],
        paragraphs: [
          "Les messages et l’adresse sont figés pour cette inscription. Modifier la séquence concerne les nouvelles inscriptions. Un contact ne peut être inscrit qu’une fois dans la même séquence.",
        ],
      },
      {
        title: "Contrôler le suivi",
        paragraphs: [
          "Vous pouvez mettre votre inscription en pause, la reprendre ou l’arrêter. Mettre toute la séquence en pause suspend également ses envois. Relay vérifie les réponses du contact avant chaque message et arrête le suivi s’il détecte une réponse depuis le début de ce suivi.",
        ],
      },
      {
        title: "Respecter les demandes du contact",
        paragraphs: [
          "Chaque message contient un lien permettant au contact de confirmer son désabonnement. Son adresse rejoint les exclusions de l’espace. Vous pouvez aussi ajouter une exclusion manuellement. Un message déjà transmis au fournisseur ne peut pas être rappelé.",
        ],
      },
      {
        title: "Comprendre un arrêt ou une erreur",
        paragraphs: [
          "Consultez l’historique d’envoi du contact. Transmis signifie accepté par Gmail ou Outlook, et ne garantit pas la remise dans la boîte de réception. À vérifier signifie que l’envoi est incertain : Relay bloque le suivi et ne renvoie pas automatiquement le message. Vérifiez votre boîte d’envoi avant de décider de la suite.",
        ],
      },
      {
        title: "Configuration nécessaire",
        paragraphs: [
          "Les séquences utilisent un domaine public HTTPS et un service de suivi actif. Si la confirmation indique que la configuration manque, votre administrateur doit terminer le déploiement. En local, vous pouvez préparer et relire les séquences ; la confirmation des envois reste bloquée tant que ce domaine public n’est pas configuré.",
        ],
      },
    ],
  },
];
