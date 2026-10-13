"use client";
import { useState } from "react";
import { ArrowLeft, Plus, Search } from "lucide-react";
import type { WorkflowAction } from "@/lib/domain/types";
import { workflowActionTypes } from "@/lib/domain/workflow-templates";
import { blockPresets, createPreset } from "./block-presets";
import { newWorkflowAction } from "@/lib/domain/workflow-templates";
import { blockMeta } from "./block-meta";
import styles from "./canvas.module.css";
export function BlockCatalog({
  branch = false,
  onSelect,
  onClose,
}: {
  branch?: boolean;
  onSelect: (action: WorkflowAction) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const entries = [
    ...(Object.keys(blockMeta) as WorkflowAction["type"][]).map((type) => ({
      id: type,
      type,
      name: workflowActionTypes[type],
      description: blockMeta[type].description,
      create: () => newWorkflowAction(type),
    })),
    ...blockPresets.map((p) => ({ ...p, create: () => createPreset(p.id)! })),
  ].filter((entry) => !branch || entry.type !== "branch");
  const categories = ["Tous", ...new Set(entries.map((entry) => blockMeta[entry.type].category))];
  const matches = entries.filter(
    (entry) =>
      (category === "Tous" || blockMeta[entry.type].category === category) &&
      normalize(`${entry.name} ${blockMeta[entry.type].category} ${entry.description}`).includes(
        normalize(search),
      ),
  );
  const groups = [...new Set(matches.map((entry) => blockMeta[entry.type].category))];
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
      <div className={styles.categories} aria-label="Catégories de blocs">
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className={styles.hint} role="status">
        {matches.length} bloc(s) disponible(s)
      </p>
      {groups.map((group) => (
        <section key={group}>
          <h4>{group}</h4>
          {matches
            .filter((entry) => blockMeta[entry.type].category === group)
            .map((entry) => {
              const meta = blockMeta[entry.type],
                Icon = meta.icon;
              return (
                <button
                  type="button"
                  className={styles.catalogItem}
                  key={entry.id}
                  onClick={() => onSelect(entry.create())}
                >
                  <span data-color={meta.color} className={styles.blockIcon}>
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{entry.name}</strong>
                    <small>{entry.description}</small>
                  </span>
                  <Plus size={14} />
                </button>
              );
            })}
        </section>
      ))}
      {!matches.length && (
        <p className={styles.hint}>Aucun bloc ne correspond à votre recherche.</p>
      )}
    </div>
  );
}
