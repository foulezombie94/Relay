"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FileText, Plus, Repeat2, Settings2 } from "lucide-react";
import type { StudioConfig } from "@/lib/domain/record-studio";
import styles from "./studio.module.css";
export function TemplateMenu({
  label = "Nouveau",
  readonly,
  templates,
  onCreate,
  onTemplate,
  onManage,
  canManage,
}: {
  label?: string;
  readonly: boolean;
  templates: StudioConfig[];
  onCreate: () => void;
  onTemplate: (template: Extract<StudioConfig, { kind: "template" }>) => void;
  onManage: () => void;
  canManage: boolean;
}) {
  return (
    <div className={styles.newButton}>
      <button type="button" disabled={readonly} onClick={onCreate}>
        {label}
      </button>
      <Dropdown.Root>
        <Dropdown.Trigger disabled={readonly} aria-label="Créer depuis un modèle">
          <ChevronDown size={13} />
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content
            className={"sb-dropdown " + styles.templateMenu}
            align="end"
            sideOffset={6}
          >
            <Dropdown.Label className={styles.menuLabel}>Créer une fiche</Dropdown.Label>
            <Dropdown.Item className="sb-dropdown-item" onSelect={onCreate}>
              <Plus size={15} /> Fiche vide
            </Dropdown.Item>
            <Dropdown.Separator className={styles.separator} />
            <Dropdown.Label className={styles.menuLabel}>Modèles</Dropdown.Label>
            {templates
              .filter(
                (t): t is Extract<StudioConfig, { kind: "template" }> => t.kind === "template",
              )
              .map((t) => (
                <Dropdown.Item
                  key={t.id}
                  className="sb-dropdown-item"
                  onSelect={() => onTemplate(t)}
                >
                  <FileText size={15} />
                  <span className={styles.grow}>{t.name}</span>
                  {t.config.repeat !== "none" && <Repeat2 size={13} />}
                </Dropdown.Item>
              ))}
            {!templates.length && <p className={styles.menuHelp}>Aucun modèle pour le moment.</p>}
            {canManage && (
              <>
                <Dropdown.Separator className={styles.separator} />
                <Dropdown.Item className="sb-dropdown-item" onSelect={onManage}>
                  <Settings2 size={15} /> Gérer les modèles
                </Dropdown.Item>
              </>
            )}
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  );
}
