export type BlockKind =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "bullet"
  | "number"
  | "todo"
  | "toggle"
  | "callout"
  | "quote"
  | "table"
  | "divider"
  | "link"
  | "image"
  | "video"
  | "audio"
  | "code"
  | "file"
  | "bookmark"
  | "toc"
  | "toggleHeading1"
  | "toggleHeading2"
  | "toggleHeading3";
export type SkillBlock = {
  id: string;
  kind: BlockKind;
  text: string;
  checked?: boolean;
  detail?: string;
  language?: string;
  rows?: string[][];
};
export type BlockDefinition = {
  kind: BlockKind;
  label: string;
  description: string;
  group: "Blocs de base" | "Média" | "Blocs avancés";
  shortcut?: string;
  aliases?: string;
};
export const blockKinds: BlockDefinition[] = [
  {
    kind: "paragraph",
    label: "Texte",
    description: "Un paragraphe pour décrire votre méthode.",
    group: "Blocs de base",
    aliases: "text paragraph",
  },
  {
    kind: "heading1",
    label: "Titre 1",
    description: "Un grand titre pour structurer les sections.",
    group: "Blocs de base",
    shortcut: "#",
  },
  {
    kind: "heading2",
    label: "Titre 2",
    description: "Un titre intermédiaire pour les sous-sections.",
    group: "Blocs de base",
    shortcut: "##",
  },
  {
    kind: "heading3",
    label: "Titre 3",
    description: "Un petit titre pour les détails de la méthode.",
    group: "Blocs de base",
    shortcut: "###",
  },
  {
    kind: "heading4",
    label: "Titre 4",
    description: "Un repère discret dans une section.",
    group: "Blocs de base",
    shortcut: "####",
  },
  {
    kind: "bullet",
    label: "Liste à puces",
    description: "Présenter plusieurs points sans ordre particulier.",
    group: "Blocs de base",
    shortcut: "-",
    aliases: "bullet list",
  },
  {
    kind: "number",
    label: "Liste numérotée",
    description: "Présenter des étapes dans un ordre précis.",
    group: "Blocs de base",
    shortcut: "1.",
    aliases: "numbered list",
  },
  {
    kind: "todo",
    label: "Liste de tâches",
    description: "Ajouter un point à vérifier avec une case à cocher.",
    group: "Blocs de base",
    shortcut: "[]",
    aliases: "checkbox todo case à cocher",
  },
  {
    kind: "toggle",
    label: "Menu dépliant",
    description: "Replier les détails sous un titre cliquable.",
    group: "Blocs de base",
    shortcut: ">",
    aliases: "toggle",
  },
  {
    kind: "callout",
    label: "Encadré",
    description: "Faire ressortir une règle ou une information importante.",
    group: "Blocs de base",
    aliases: "callout",
  },
  {
    kind: "quote",
    label: "Citation",
    description: "Mettre un passage en évidence avec une bordure.",
    group: "Blocs de base",
    shortcut: '"',
  },
  {
    kind: "table",
    label: "Tableau",
    description: "Organiser des informations en lignes et colonnes.",
    group: "Blocs de base",
    aliases: "table",
  },
  {
    kind: "divider",
    label: "Séparateur",
    description: "Séparer deux sections par une ligne fine.",
    group: "Blocs de base",
    shortcut: "---",
  },
  {
    kind: "link",
    label: "Lien vers une page",
    description: "Insérer un lien vers une fiche ou une page.",
    group: "Blocs de base",
    aliases: "page relation",
  },
  {
    kind: "image",
    label: "Image",
    description: "Référencer une image par son URL et choisir de l’afficher.",
    group: "Média",
    aliases: "photo",
  },
  {
    kind: "video",
    label: "Vidéo",
    description: "Référencer un fichier vidéo avec lecture à la demande.",
    group: "Média",
    aliases: "video",
  },
  {
    kind: "audio",
    label: "Audio",
    description: "Référencer un fichier audio avec lecture à la demande.",
    group: "Média",
  },
  {
    kind: "code",
    label: "Code",
    description: "Écrire un exemple de code sans l’exécuter.",
    group: "Média",
    shortcut: "```",
  },
  {
    kind: "file",
    label: "Fichier",
    description: "Conserver un lien vers un document existant.",
    group: "Média",
    aliases: "document pdf",
  },
  {
    kind: "bookmark",
    label: "Aperçu de lien Web",
    description: "Présenter un lien sous forme de carte, sans charger le site.",
    group: "Média",
    aliases: "bookmark url web",
  },
  {
    kind: "toc",
    label: "Table des matières",
    description: "Naviguer dans les titres de cette méthode.",
    group: "Blocs avancés",
    aliases: "sommaire",
  },
  {
    kind: "toggleHeading1",
    label: "Titre dépliant 1",
    description: "Un grand titre avec des détails repliables.",
    group: "Blocs avancés",
    shortcut: "# >",
  },
  {
    kind: "toggleHeading2",
    label: "Titre dépliant 2",
    description: "Un titre intermédiaire avec des détails repliables.",
    group: "Blocs avancés",
    shortcut: "## >",
  },
  {
    kind: "toggleHeading3",
    label: "Titre dépliant 3",
    description: "Un petit titre avec des détails repliables.",
    group: "Blocs avancés",
    shortcut: "### >",
  },
];
export const isToggleBlock = (kind: BlockKind) =>
  kind === "toggle" || kind.startsWith("toggleHeading");
export const isLinkBlock = (kind: BlockKind) =>
  ["link", "image", "video", "audio", "file", "bookmark"].includes(kind);
export const normalizeBlockSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function safeBlockUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function initialBlock(kind: BlockKind, id: string, text = ""): SkillBlock {
  return {
    id,
    kind,
    text,
    ...(kind === "table"
      ? {
          rows: [
            ["Colonne 1", "Colonne 2"],
            ["", ""],
            ["", ""],
          ],
        }
      : {}),
    ...(isToggleBlock(kind) || isLinkBlock(kind) ? { detail: "" } : {}),
    ...(kind === "code" ? { language: "text" } : {}),
  };
}
const extendedKinds = new Set<BlockKind>([
  "toggle",
  "callout",
  "link",
  "image",
  "video",
  "audio",
  "file",
  "bookmark",
  "toc",
  "table",
  "toggleHeading1",
  "toggleHeading2",
  "toggleHeading3",
]);
function fence(content: string, language: string) {
  const longest = Math.max(2, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const delimiter = "`".repeat(longest + 1);
  return `${delimiter}${language}\n${content}\n${delimiter}`;
}
// Markdown remains the persisted contract. Extended blocks use inert fenced JSON,
// never HTML; unknown or malformed fences remain ordinary visible code.
export function parseSkillBlocks(value: string): SkillBlock[] {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const result: SkillBlock[] = [];
  let paragraph: string[] = [];
  const add = (kind: BlockKind, text: string, extra: Partial<SkillBlock> = {}) =>
    result.push({ id: `block_${result.length}`, kind, text, ...extra });
  const flush = () => {
    if (paragraph.length) {
      add("paragraph", paragraph.join("\n"));
      paragraph = [];
    }
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const opening = /^(`{3,})([^`]*)$/.exec(line);
    if (opening) {
      let end = index + 1;
      while (end < lines.length && lines[end] !== opening[1]) end++;
      if (end < lines.length) {
        flush();
        const content = lines.slice(index + 1, end).join("\n");
        const language = opening[2].trim();
        let parsed = false;
        if (language.startsWith("zyliad-")) {
          const kind = language.slice(7) as BlockKind;
          if (extendedKinds.has(kind))
            try {
              const data: unknown = JSON.parse(content);
              if (data && typeof data === "object" && !Array.isArray(data)) {
                const item = data as Record<string, unknown>;
                if (
                  typeof item.text === "string" &&
                  (item.detail === undefined || typeof item.detail === "string") &&
                  (kind !== "table" ||
                    (Array.isArray(item.rows) &&
                      item.rows.length <= 30 &&
                      item.rows.every(
                        (row) =>
                          Array.isArray(row) &&
                          row.length <= 8 &&
                          row.every((cell) => typeof cell === "string"),
                      )))
                ) {
                  add(kind, item.text, {
                    ...(typeof item.detail === "string" ? { detail: item.detail } : {}),
                    ...(kind === "table" ? { rows: item.rows as string[][] } : {}),
                  });
                  parsed = true;
                }
              }
            } catch {
              /* Keep malformed data visible instead of dropping it. */
            }
        }
        if (!parsed) add("code", content, { language });
        index = end;
        continue;
      }
    }
    if (
      line.startsWith("  ") &&
      !paragraph.length &&
      result.length &&
      result.at(-1)?.kind !== "paragraph"
    ) {
      result[result.length - 1].text += "\n" + line.slice(2);
      continue;
    }
    const match =
      /^(#{1,4}) (.*)$|^[-*] \[([ xX])\] (.*)$|^[-*] (.*)$|^\d+[.)] (.*)$|^> ?(.*)$|^(---|\*\*\*)$/.exec(
        line,
      );
    if (!line.trim()) {
      flush();
      continue;
    }
    if (!match) {
      paragraph.push(line);
      continue;
    }
    flush();
    if (match[1]) add(`heading${match[1].length}` as BlockKind, match[2]);
    else if (match[3] !== undefined)
      add("todo", match[4], { checked: match[3].toLowerCase() === "x" });
    else if (match[5] !== undefined) add("bullet", match[5]);
    else if (match[6] !== undefined) add("number", match[6]);
    else if (match[7] !== undefined) add("quote", match[7]);
    else add("divider", "");
  }
  flush();
  return result.length ? result : [initialBlock("paragraph", "block_0")];
}
export function serializeSkillBlocks(blocks: SkillBlock[]) {
  let number = 0;
  return blocks
    .map((block) => {
      number = block.kind === "number" ? number + 1 : 0;
      if (block.kind === "code")
        return fence(block.text, (block.language ?? "text").replace(/[^\w+-]/g, "").slice(0, 30));
      if (extendedKinds.has(block.kind))
        return fence(
          JSON.stringify({
            text: block.text,
            ...(block.detail !== undefined ? { detail: block.detail } : {}),
            ...(block.rows ? { rows: block.rows } : {}),
          }),
          `zyliad-${block.kind}`,
        );
      if (block.kind === "divider") return "---";
      const prefixes: Partial<Record<BlockKind, string>> = {
        paragraph: "",
        heading1: "# ",
        heading2: "## ",
        heading3: "### ",
        heading4: "#### ",
        bullet: "- ",
        number: `${number}. `,
        todo: block.checked ? "- [x] " : "- [ ] ",
        quote: "> ",
      };
      return (
        (prefixes[block.kind] ?? "") +
        (block.kind === "paragraph" ? block.text : block.text.replace(/\n/g, "\n  "))
      );
    })
    .join("\n\n");
}
