"use client";
import { Fragment, useState, type ReactNode } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { BlockIcon } from "./block-icons";
import { blockKinds, safeBlockUrl, type SkillBlock } from "./blocks";
import styles from "./block-editor.module.css";

export function InlineBlockText({ text }: { text: string }) {
  // Only these three inline markers are interpreted. HTML stays escaped by React.
  const parts: ReactNode[] = [];
  const pattern =
    /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|@\[([^\]\n]{1,100})\]\(record:([0-9a-f-]{36})\)|\{\{([a-z][a-z0-9_.]{0,79})\}\}/g;
  let end = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    parts.push(text.slice(end, match.index));
    parts.push(
      match[1] ? (
        <strong key={match.index}>{match[1]}</strong>
      ) : match[2] ? (
        <em key={match.index}>{match[2]}</em>
      ) : match[3] ? (
        <code key={match.index}>{match[3]}</code>
      ) : match[4] ? (
        <span className={styles.inlineMention} title="Fiche CRM référencée" key={match.index}>
          @{match[4]}
        </span>
      ) : (
        <span className={styles.inlineVariable} key={match.index}>{`{{${match[6]}}}`}</span>
      ),
    );
    end = pattern.lastIndex;
  }
  parts.push(text.slice(end));
  return <>{parts}</>;
}
export function TableBlock({
  block,
  disabled,
  onChange,
}: {
  block: SkillBlock;
  disabled: boolean;
  onChange: (patch: Partial<SkillBlock>) => void;
}) {
  const rows = block.rows?.length ? block.rows : [["", ""]];
  const columns = Math.max(1, ...rows.map((row) => row.length));
  return (
    <div className={styles.tableBlock}>
      <div className={styles.tableScroll}>
        <table>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {Array.from({ length: columns }, (_, c) => (
                  <td key={c}>
                    <input
                      aria-label={`Ligne ${r + 1}, colonne ${c + 1}`}
                      disabled={disabled}
                      value={row[c] ?? ""}
                      maxLength={2000}
                      placeholder={r === 0 ? `Colonne ${c + 1}` : ""}
                      onChange={(event) =>
                        onChange({
                          rows: rows.map((item, i) =>
                            i === r
                              ? Array.from({ length: columns }, (_, j) =>
                                  j === c ? event.target.value : (item[j] ?? ""),
                                )
                              : item,
                          ),
                        })
                      }
                    />
                  </td>
                ))}
                {!disabled && (
                  <td className={styles.tableDelete}>
                    <button
                      type="button"
                      aria-label={`Supprimer la ligne ${r + 1}`}
                      disabled={rows.length <= 1}
                      onClick={() => onChange({ rows: rows.filter((_, i) => i !== r) })}
                    >
                      <X size={12} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <div className={styles.tableActions}>
          <button
            type="button"
            disabled={rows.length >= 30}
            onClick={() => onChange({ rows: [...rows, Array.from({ length: columns }, () => "")] })}
          >
            <Plus size={12} /> Ligne
          </button>
          <button
            type="button"
            disabled={columns >= 8}
            onClick={() =>
              onChange({
                rows: rows.map((row) => [
                  ...Array.from({ length: columns }, (_, i) => row[i] ?? ""),
                  "",
                ]),
              })
            }
          >
            <Plus size={12} /> Colonne
          </button>
          <button
            type="button"
            disabled={columns <= 1}
            onClick={() => onChange({ rows: rows.map((row) => row.slice(0, -1)) })}
          >
            Retirer la dernière colonne
          </button>
        </div>
      )}
    </div>
  );
}
export function LinkBlockFields({
  block,
  disabled,
  onChange,
}: {
  block: SkillBlock;
  disabled: boolean;
  onChange: (patch: Partial<SkillBlock>) => void;
}) {
  return (
    <div className={styles.linkFields}>
      <input
        type="url"
        aria-label={`URL du bloc ${blockKinds.find((item) => item.kind === block.kind)?.label}`}
        placeholder="Coller un lien https://…"
        disabled={disabled}
        value={block.detail ?? ""}
        maxLength={3000}
        onChange={(event) => onChange({ detail: event.target.value })}
      />
      {block.detail && !safeBlockUrl(block.detail) && (
        <small role="status">Saisissez une URL complète http ou https.</small>
      )}
      <MediaReference key={`${block.id}-${block.detail}`} block={block} />
    </div>
  );
}
export function MediaReference({ block }: { block: SkillBlock }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = safeBlockUrl(block.detail ?? "");
  const kind = blockKinds.find((item) => item.kind === block.kind);
  if (!url) return null;
  const media = ["image", "audio", "video"].includes(block.kind);
  return (
    <div className={styles.mediaReference}>
      <div>
        <BlockIcon kind={block.kind} />
        <span>
          <strong>{block.text || kind?.label}</strong>
          <small>{url}</small>
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Ouvrir le lien">
          <ExternalLink size={15} />
        </a>
      </div>
      {media && !loaded && (
        <button type="button" onClick={() => setLoaded(true)}>
          Afficher{" "}
          {block.kind === "image"
            ? "l’image"
            : block.kind === "video"
              ? "la vidéo"
              : "le lecteur audio"}
        </button>
      )}
      {loaded && !failed && (
        <div className={styles.loadedMedia}>
          {block.kind === "image" ? (
            <img
              src={url}
              alt={block.text || "Illustration de la méthode"}
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          ) : block.kind === "audio" ? (
            <audio controls preload="none" src={url} onError={() => setFailed(true)} />
          ) : (
            <video controls preload="none" src={url} onError={() => setFailed(true)} />
          )}
        </div>
      )}
      {failed && (
        <small>Ce média ne peut pas être affiché ici. Utilisez le lien pour l’ouvrir.</small>
      )}
    </div>
  );
}
export function TableOfContents({
  blocks,
  onNavigate,
}: {
  blocks: SkillBlock[];
  onNavigate: (id: string) => void;
}) {
  const headings = blocks.filter(
    (block) => block.kind.startsWith("heading") || block.kind.startsWith("toggleHeading"),
  );
  return (
    <nav className={styles.toc} aria-label="Table des matières">
      {headings.length ? (
        headings.map((block) => (
          <button
            type="button"
            key={block.id}
            style={{ paddingLeft: `${Math.max(0, Number(block.kind.slice(-1)) - 1) * 14 + 8}px` }}
            onClick={() => onNavigate(block.id)}
          >
            {block.text || "Sans titre"}
          </button>
        ))
      ) : (
        <span>Ajoutez des titres pour construire la table des matières.</span>
      )}
    </nav>
  );
}
export function BlockSample({ kind }: { kind: SkillBlock["kind"] }) {
  if (kind === "table")
    return (
      <div className={styles.sampleTable}>
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    );
  if (kind === "todo")
    return (
      <div>
        ☑ Vérifier le contexte
        <br />☐ Préparer la synthèse
      </div>
    );
  if (kind === "bullet" || kind === "number")
    return (
      <div>
        {kind === "bullet" ? "•" : "1."} Identifier le client
        <br />
        {kind === "bullet" ? "•" : "2."} Examiner les échanges
        <br />
        {kind === "bullet" ? "•" : "3."} Proposer les étapes
      </div>
    );
  if (kind === "divider") return <hr />;
  if (kind === "code") return <code>const méthode = « claire »;</code>;
  return (
    <Fragment>
      <BlockIcon kind={kind} size={26} />
      <span>
        {kind.startsWith("heading")
          ? "Une méthode claire"
          : "Les informations utiles, au bon endroit."}
      </span>
    </Fragment>
  );
}
