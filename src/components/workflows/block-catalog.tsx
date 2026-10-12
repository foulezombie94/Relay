"use client";
import { useState } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";
import type { WorkflowAction } from "@/lib/domain/types";
import { workflowActionTypes } from "@/lib/domain/workflow-templates";
import { blockMeta } from "./block-meta";
import styles from "./canvas.module.css";
export function BlockCatalog({
  branch = false,
  onSelect,
  onClose,
}: {
  branch?: boolean;
  onSelect: (type: WorkflowAction["type"]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const types = (Object.keys(blockMeta) as WorkflowAction["type"][]).filter(
    (type) =>
      (!branch || type !== "branch") &&
      `${workflowActionTypes[type]} ${blockMeta[type].category} ${blockMeta[type].description}`
        .toLocaleLowerCase("fr")
        .includes(search.toLocaleLowerCase("fr")),
  );
  const groups = [...new Set(types.map((type) => blockMeta[type].category))];
  return (
    <div className={styles.catalog}>
      <div className={styles.panelHeading}>
        <button
          type="button"
          className="icon-button"
          aria-label="Fermer la bibliothèque de blocs"
          onClick={onClose}
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <strong>Ajouter un bloc</strong>
          <small>Choisissez la prochaine étape</small>
        </div>
      </div>
      <label className={styles.search}>
        <Search size={15} />
        <input
          autoFocus
          aria-label="Rechercher un bloc"
          placeholder="Rechercher un bloc…"
          maxLength={120}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {groups.map((group) => (
        <section key={group}>
          <h4>{group}</h4>
          {types
            .filter((type) => blockMeta[type].category === group)
            .map((type) => {
              const meta = blockMeta[type],
                Icon = meta.icon;
              return (
                <button
                  type="button"
                  className={styles.catalogItem}
                  key={type}
                  onClick={() => onSelect(type)}
                >
                  <span data-color={meta.color} className={styles.blockIcon}>
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{workflowActionTypes[type]}</strong>
                    <small>{meta.description}</small>
                  </span>
                  <Plus size={14} />
                </button>
              );
            })}
        </section>
      ))}
      {!types.length && <p className={styles.hint}>Aucun bloc ne correspond à votre recherche.</p>}
    </div>
  );
}
