"use client";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Table2,
  LayoutGrid,
  ChevronDown,
  Filter,
  ArrowDownUp,
  Search,
  X,
  Plus,
  Upload,
  Check,
  Zap,
  Sparkles,
} from "lucide-react";
import type { ViewConfig } from "@/lib/domain/views";
import type { Row } from "@/lib/domain/types";
import { str } from "../ui/display";
import type { ContactColumn } from "./contacts-model";
import styles from "./contacts.module.css";
export function ContactsToolbar({
  config,
  onChange,
  mode,
  onMode,
  columns,
  members,
  readonly,
  onCreate,
  onImport,
  exportControl,
  viewControl,
}: {
  config: ViewConfig;
  onChange: (config: ViewConfig) => void;
  mode: string;
  onMode: (mode: string) => void;
  columns: ContactColumn[];
  members: Row[];
  readonly: boolean;
  onCreate: () => void;
  onImport: () => void;
  exportControl: ReactNode;
  viewControl: ReactNode;
}) {
  const [searching, setSearching] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const label =
    config.owner === "me"
      ? "Mes contacts"
      : config.owner === "unassigned"
        ? "Sans responsable"
        : config.owner
          ? "Contacts filtrés"
          : "Tous les contacts";
  const filters = config.filters ?? [];
  return (
    <div className={styles.toolbar}>
      <Popover.Root>
        <Popover.Trigger className={styles.viewTab} aria-label="Choisir la vue des contacts">
          <Table2 size={16} />
          <span>{label}</span>
          <ChevronDown size={12} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className={styles.menu} align="start" sideOffset={6}>
            <strong>Vues des contacts</strong>
            {[
              { value: "", label: "Tous les contacts" },
              { value: "me", label: "Mes contacts" },
              { value: "unassigned", label: "Sans responsable" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange({ ...config, owner: item.value })}
              >
                {item.label}
                {config.owner === item.value && <Check size={14} />}
              </button>
            ))}
            <hr />
            <strong>Disposition</strong>
            <div className={styles.layouts}>
              {[
                { value: "table", label: "Table", icon: Table2 },
                { value: "cards", label: "Galerie", icon: LayoutGrid },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={mode === value}
                  onClick={() => onMode(value)}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <div className={styles.commands}>
        {(searching || config.search) && (
          <label className={styles.search}>
            <input
              type="search"
              ref={search}
              autoFocus
              aria-label="Rechercher les contacts"
              placeholder="Rechercher…"
              value={config.search}
              onChange={(event) => onChange({ ...config, search: event.target.value })}
            />
            <button
              type="button"
              aria-label="Effacer la recherche des contacts"
              onClick={() => {
                onChange({ ...config, search: "" });
                setSearching(false);
              }}
            >
              <X size={13} />
            </button>
          </label>
        )}
        <Popover.Root>
          <Popover.Trigger
            className={styles.icon}
            aria-label="Filtrer les contacts"
            title="Filtrer"
            data-active={!!filters.length || !!config.owner}
          >
            <Filter size={16} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className={styles.menu + " " + styles.filterMenu}
              align="end"
              sideOffset={6}
            >
              <strong>Filtrer les contacts</strong>
              <label>
                Responsable
                <select
                  aria-label="Filtrer les contacts par responsable"
                  value={config.owner}
                  onChange={(e) => onChange({ ...config, owner: e.target.value })}
                >
                  <option value="">Tous les responsables</option>
                  <option value="me">Moi</option>
                  <option value="unassigned">Sans responsable</option>
                  {members.map((member) => (
                    <option key={member.id} value={str(member.user_id)}>
                      {str(member.display_name) || "Membre"}
                    </option>
                  ))}
                </select>
              </label>
              {filters.map((filter, index) => (
                <div className={styles.filterRow} key={index}>
                  <select
                    aria-label={`Propriété du filtre ${index + 1}`}
                    value={filter.field}
                    onChange={(event) =>
                      onChange({
                        ...config,
                        filters: filters.map((item, i) =>
                          i === index ? { field: event.target.value, operator: "exists" } : item,
                        ),
                      })
                    }
                  >
                    {columns.map((column) => (
                      <option
                        key={column.key}
                        value={
                          column.key.startsWith("attr_")
                            ? "attributes." + column.key.slice(5)
                            : column.key
                        }
                      >
                        {column.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`Condition du filtre ${index + 1}`}
                    value={filter.operator}
                    onChange={(event) =>
                      onChange({
                        ...config,
                        filters: filters.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                operator: event.target.value as typeof filter.operator,
                                value: item.value ?? "",
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    {[
                      { key: "contains", label: "Contient" },
                      { key: "equals", label: "Est" },
                      { key: "not_equals", label: "N’est pas" },
                      { key: "exists", label: "Est renseigné" },
                      { key: "not_exists", label: "Est vide" },
                    ].map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  {!["exists", "not_exists"].includes(filter.operator) && (
                    <input
                      aria-label={`Valeur du filtre ${index + 1}`}
                      value={filter.value ?? ""}
                      onChange={(event) =>
                        onChange({
                          ...config,
                          filters: filters.map((item, i) =>
                            i === index ? { ...item, value: event.target.value } : item,
                          ),
                        })
                      }
                    />
                  )}
                  <button
                    type="button"
                    aria-label={`Retirer le filtre ${index + 1}`}
                    onClick={() =>
                      onChange({ ...config, filters: filters.filter((_, i) => i !== index) })
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={filters.length >= 20}
                onClick={() =>
                  onChange({
                    ...config,
                    filters: [...filters, { field: "email", operator: "exists" }],
                  })
                }
              >
                <Plus size={14} />
                Ajouter un filtre
              </button>
              {(filters.length > 0 || config.owner) && (
                <button
                  type="button"
                  onClick={() => onChange({ ...config, owner: "", filters: [] })}
                >
                  Effacer les filtres
                </button>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Popover.Root>
          <Popover.Trigger className={styles.icon} aria-label="Trier les contacts" title="Trier">
            <ArrowDownUp size={16} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content className={styles.menu} align="end" sideOffset={6}>
              <strong>Trier les contacts</strong>
              <label>
                Propriété
                <select
                  aria-label="Propriété du tri des contacts"
                  value={config.sort}
                  onChange={(event) =>
                    onChange({ ...config, sort: event.target.value as ViewConfig["sort"] })
                  }
                >
                  <option value="display_name">Nom</option>
                  <option value="updated_at">Dernière modification</option>
                  <option value="created_at">Date de création</option>
                </select>
              </label>
              <label>
                Ordre
                <select
                  aria-label="Ordre du tri des contacts"
                  value={config.direction}
                  onChange={(event) =>
                    onChange({ ...config, direction: event.target.value as "asc" | "desc" })
                  }
                >
                  <option value="asc">Croissant</option>
                  <option value="desc">Décroissant</option>
                </select>
              </label>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Link
          href="/app/workflows"
          className={styles.icon}
          aria-label="Automatisations des contacts"
          title="Automatisations"
        >
          <Zap size={16} />
        </Link>
        <Link
          href="/app/assistant"
          className={styles.icon}
          aria-label="Assistant CRM"
          title="Assistant CRM"
        >
          <Sparkles size={16} />
        </Link>
        <button
          className={styles.icon}
          type="button"
          title="Chercher"
          aria-label="Chercher dans les contacts"
          onClick={() => {
            setSearching(true);
            search.current?.focus();
          }}
        >
          <Search size={16} />
        </button>
        {viewControl}
        {exportControl}
        <div className={styles.newButton}>
          <button type="button" disabled={readonly} onClick={onCreate}>
            Nouveau
          </button>
          <Dropdown.Root>
            <Dropdown.Trigger type="button" aria-label="Options d’ajout de contacts">
              <ChevronDown size={13} />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content className="sb-dropdown" align="end" sideOffset={6}>
                <Dropdown.Item className="sb-dropdown-item" disabled={readonly} onSelect={onCreate}>
                  <Plus size={15} />
                  Nouveau contact
                </Dropdown.Item>
                <Dropdown.Item className="sb-dropdown-item" disabled={readonly} onSelect={onImport}>
                  <Upload size={15} />
                  Importer des contacts
                </Dropdown.Item>
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
        </div>
      </div>
    </div>
  );
}
