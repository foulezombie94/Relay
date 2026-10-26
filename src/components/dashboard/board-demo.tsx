"use client";
import { useEffect, useState } from "react";
import { Moon, Sun, Plus, Pencil, RefreshCw } from "lucide-react";
import { DashboardHeader, DashboardEditNotice, matchesWidgetSearch } from "./dashboard-header";
import { DashboardWidget } from "./widget";
import { WidgetLibrary } from "./widget-library";
import { WidgetMenu } from "./widget-menu";
import { Modal } from "../ui";
import {
  dashboardTemplate,
  moveTile,
  type DashboardEntry,
  type DashboardTileResult,
} from "@/lib/domain/dashboards";
import { tileFromPreset } from "@/lib/domain/dashboard-widgets";
import styles from "./dashboard.module.css";
import board from "./board.module.css";

const opportunities: DashboardEntry[] = [
  { id: "1", title: "Studio Rivage · Identité de marque", stage: "Qualification", amount: "12500" },
  { id: "2", title: "Maison Atlas · Site e-commerce", stage: "Proposition", amount: "24000" },
  { id: "3", title: "Nova Conseil · Accompagnement", stage: "Négociation", amount: "18500" },
  { id: "4", title: "Atelier Lumière · Campagne été", stage: "Qualification", amount: "6800" },
  { id: "5", title: "Collectif Azur · Lancement", stage: "Proposition", amount: "15200" },
  { id: "6", title: "Éditions du Parc · Refonte", stage: "Nouveau", amount: "9000" },
].map((entry, index) => ({
  ...entry,
  record_id: entry.id,
  status: null,
  currency: "EUR",
  occurred_at: `2026-10-${26 - index}T10:00:00Z`,
}));
const tasks: DashboardEntry[] = [
  "Envoyer la proposition à Maison Atlas",
  "Préparer le rendez-vous Studio Rivage",
  "Relancer Nova Conseil",
  "Valider le brief du Collectif Azur",
].map((title, i) => ({
  id: `task-${i}`,
  title,
  record_id: null,
  stage: null,
  status: i === 1 ? "in_progress" : "open",
  amount: null,
  currency: null,
  occurred_at: `2026-10-${26 + i}T10:00:00Z`,
}));
const emails = [
  "Nouveau brief · Studio Rivage",
  "Retour sur la proposition · Maison Atlas",
  "Compte rendu de notre échange · Nova Conseil",
].map((title, i) => ({
  ...tasks[i],
  id: `email-${i}`,
  title,
  status: null,
  occurred_at: `2026-10-${26 - i}T10:00:00Z`,
}));
const groups = [
  { label: "Nouveau", value: "9000", count: 1 },
  { label: "Qualification", value: "19300", count: 2 },
  { label: "Proposition", value: "39200", count: 2 },
  { label: "Négociation", value: "18500", count: 1 },
].map((group) => ({ ...group, dimension: group.label, currency: "EUR", sample_size: group.count }));
const aggregate = {
  data: groups,
  totals: [
    { dimension: null, label: "Total", value: "86000", count: 6, currency: "EUR", sample_size: 6 },
  ],
  total: 6,
  partial: false,
  missing_history: 0,
  coverage: "Données fictives",
};
const initial: DashboardTileResult[] = dashboardTemplate("management").config.map((tile, i) => ({
  tile: { ...tile, id: `demo-${i}` },
  ...(i === 0
    ? { current: aggregate }
    : {
        entries: {
          data: i === 1 ? opportunities : i === 2 ? tasks : emails,
          total: i === 1 ? 6 : i === 2 ? 4 : 3,
          next_cursor: null,
          partial: false,
        },
      }),
}));

export function BoardDemo() {
  const [dark, setDark] = useState(false),
    [search, setSearch] = useState(""),
    [editing, setEditing] = useState(false);
  const [tiles, setTiles] = useState(initial),
    [library, setLibrary] = useState(false);
  const [expanded, setExpanded] = useState<DashboardTileResult | null>(null),
    [entry, setEntry] = useState<DashboardEntry | null>(null);
  const [configuring, setConfiguring] = useState<number | null>(null);
  useEffect(() => {
    const previous = document.documentElement.dataset.relayTheme;
    document.documentElement.dataset.relayTheme = dark ? "dark" : "light";
    return () => {
      if (previous) document.documentElement.dataset.relayTheme = previous;
      else delete document.documentElement.dataset.relayTheme;
    };
  }, [dark]);
  return (
    <main
      className={`${styles.page} ${board.canvas} ${board.demo}`}
      data-relay-dashboard
      data-editing={editing}
    >
      <DashboardHeader
        editing={editing}
        title="Tableau de bord"
        search={search}
        onSearch={setSearch}
      >
        <div className={styles.actions}>
          <button
            className="icon-button"
            aria-label={dark ? "Mode clair" : "Mode sombre"}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className="button"
            onClick={() => {
              setEditing(true);
              setLibrary(true);
            }}
          >
            <Plus size={14} /> Ajouter un widget
          </button>
          <button className="button" onClick={() => setEditing(!editing)}>
            <Pencil size={14} />
            {editing ? "Terminer" : "Personnaliser"}
          </button>
        </div>
      </DashboardHeader>
      {editing && <DashboardEditNotice />}
      <div className={board.demoCaption}>
        <span>Vue d’ensemble</span>
        <small>Démonstration · données fictives · modifications locales</small>
      </div>
      <div className={`${styles.grid} ${board.grid}`}>
        {tiles.map((result, i) => (
          <section
            className={styles.slot}
            data-size={result.tile.size}
            key={result.tile.id}
            hidden={!matchesWidgetSearch(result.tile.title, search)}
          >
            <DashboardWidget
              result={result}
              onEntry={setEntry}
              onDetails={() => setExpanded(result)}
              actions={
                <>
                  <button
                    className="icon-button"
                    aria-label={"Actualiser " + result.tile.title}
                    onClick={() => setTiles([...tiles])}
                  >
                    <RefreshCw size={14} />
                  </button>
                  <WidgetMenu
                    editing={editing}
                    canEdit
                    canDuplicate={tiles.length < 24}
                    canRemove={tiles.length > 1}
                    first={i === 0}
                    last={i === tiles.length - 1}
                    onEdit={() => {
                      setEditing(true);
                      setConfiguring(i);
                    }}
                    onExpand={() => setExpanded(result)}
                    onDuplicate={() =>
                      setTiles([
                        ...tiles.slice(0, i + 1),
                        { ...result, tile: { ...result.tile, id: crypto.randomUUID() } },
                        ...tiles.slice(i + 1),
                      ])
                    }
                    onRemove={() => setTiles(tiles.filter((_, n) => n !== i))}
                    onMove={(amount) => setTiles(moveTile(tiles, i, i + amount))}
                  />
                </>
              }
            />
          </section>
        ))}
        {tiles.every((result) => !matchesWidgetSearch(result.tile.title, search)) && (
          <p className={board.searchEmpty}>Aucun widget ne correspond à « {search} ».</p>
        )}
      </div>
      {library && (
        <WidgetLibrary
          onClose={() => setLibrary(false)}
          onSelect={(preset) => {
            const tile = { ...tileFromPreset(preset, []), id: crypto.randomUUID() };
            setTiles([
              ...tiles,
              {
                tile,
                current: aggregate,
                entries: { data: opportunities, total: 6, next_cursor: null, partial: false },
              },
            ]);
            setLibrary(false);
          }}
        />
      )}
      {expanded && (
        <Modal open title={expanded.tile.title} onClose={() => setExpanded(null)}>
          <DashboardWidget result={expanded} onDetails={() => {}} onEntry={setEntry} />
        </Modal>
      )}
      {entry && (
        <Modal open title={entry.title} onClose={() => setEntry(null)}>
          <p>{entry.stage ?? entry.status ?? "Échange"}</p>
          <p>Fiche fictive de démonstration.</p>
        </Modal>
      )}
      {configuring !== null && (
        <Modal open title="Configurer le widget" onClose={() => setConfiguring(null)}>
          <label>
            Titre
            <input
              aria-label="Titre du widget"
              value={tiles[configuring].tile.title}
              onChange={(event) =>
                setTiles(
                  tiles.map((result, i) =>
                    i === configuring
                      ? { ...result, tile: { ...result.tile, title: event.target.value } }
                      : result,
                  ),
                )
              }
            />
          </label>
          <button className="button" onClick={() => setConfiguring(null)}>
            Terminer
          </button>
        </Modal>
      )}
    </main>
  );
}
