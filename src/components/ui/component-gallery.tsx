"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  Plus,
  Ellipsis,
  SlidersHorizontal,
  Copy,
  ExternalLink,
  Presentation,
  Columns3,
  LayoutGrid,
  List,
  BarChart3,
  ChartLine,
  ChartPie,
  CalendarDays,
  ChevronRight,
  Component,
  Check,
  Moon,
  Sun,
} from "lucide-react";
import { Modal, Drawer, SearchBox, Badge } from "../ui";
import { DatePicker } from "./date-picker";
import { Toggle, VisualPicker } from "./controls";
import { ViewButtons } from "./view-buttons";
import { MonthCalendar } from "./month-calendar";
import { SlideViewer } from "./slide-viewer";
import { DashboardChart } from "../dashboard/chart";
import { defaultTile, type DashboardDatum } from "@/lib/domain/dashboards";
import { TasksDemo } from "../tasks/tasks-demo";
import styles from "./component-gallery.module.css";
const values: DashboardDatum[] = [
  {
    dimension: "qualification",
    label: "Qualification",
    currency: "EUR",
    count: 8,
    value: "18000",
    sample_size: 8,
  },
  {
    dimension: "proposition",
    label: "Proposition",
    currency: "EUR",
    count: 6,
    value: "32000",
    sample_size: 6,
  },
  {
    dimension: "negociation",
    label: "Négociation",
    currency: "EUR",
    count: 4,
    value: "24000",
    sample_size: 4,
  },
  { dimension: "gagne", label: "Gagné", currency: "EUR", count: 5, value: "41000", sample_size: 5 },
];
export function ComponentGallery() {
  const [status, setStatus] = useState(""),
    [modal, setModal] = useState(false),
    [drawer, setDrawer] = useState(false),
    [slides, setSlides] = useState(false),
    [index, setIndex] = useState(0);
  const [query, setQuery] = useState(""),
    [layout, setLayout] = useState("table"),
    [date, setDate] = useState("2026-10-25"),
    [enabled, setEnabled] = useState(true),
    [range, setRange] = useState(2);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const previous = document.documentElement.dataset.relayTheme;
    document.documentElement.dataset.relayTheme = dark ? "dark" : "light";
    return () => {
      if (previous) document.documentElement.dataset.relayTheme = previous;
      else delete document.documentElement.dataset.relayTheme;
    };
  }, [dark]);
  const [chart, setChart] = useState<"columns" | "line" | "donut">("columns");
  const rows = [
    { name: "Studio Rivage", stage: "Gagné", amount: "41 000 €" },
    { name: "Maison Atlas", stage: "Proposition", amount: "32 000 €" },
    { name: "Équipe Nova", stage: "Qualification", amount: "18 000 €" },
  ].filter((row) => row.name.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")));
  const chartView = (visual: typeof chart) => (
    <DashboardChart
      tile={{
        ...defaultTile({ kind: "record" }),
        title: "Pipeline de démonstration",
        visual,
        metric: "amount",
        color: "blue",
      }}
      rows={values}
      currency="EUR"
      onDetails={(row) => setStatus("Exemple sélectionné : " + row.label)}
    />
  );
  return (
    <main data-relay-ui className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/demo">Relay · Démonstration</Link>
        <ChevronRight size={14} />
        <span>Composants</span>
        <button
          type="button"
          className="icon-button"
          aria-label={dark ? "Afficher le thème clair" : "Afficher le thème sombre"}
          onClick={() => setDark(!dark)}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <Link href="/login" className="button">
          Ouvrir mon espace
        </Link>
      </header>
      <div className={styles.body}>
        <div className={styles.pageIcon}>
          <Component size={38} />
        </div>
        <h1>Les composants de votre espace</h1>
        <p className={styles.intro}>
          Boutons, vues et blocs de données, avec la même cohérence dans chaque onglet.
        </p>
        <div className={styles.notice}>
          Démonstration interactive · Données fictives · Les actions restent dans cet aperçu.
        </div>
        <nav className={styles.anchors} aria-label="Familles de composants">
          {[
            ["taches", "Tâches"],
            ["commandes", "Commandes"],
            ["proprietes", "Propriétés"],
            ["vues", "Vues"],
            ["graphiques", "Graphiques"],
            ["presentation", "Diaporama"],
          ].map(([id, label]) => (
            <a key={id} href={"#" + id}>
              {label}
            </a>
          ))}
        </nav>
        <section id="taches">
          <h2>Tâches</h2>
          <p>Filtres, liste à cocher, échéances et création, avec les composants coss ui.</p>
          <div className={styles.surface}>
            <TasksDemo onMessage={setStatus} />
          </div>
        </section>
        <section id="commandes">
          <h2>Commandes</h2>
          <p>Actions principales, boutons discrets et menus contextuels.</p>
          <div className={styles.surface}>
            <div className={styles.row}>
              <button className="button primary" onClick={() => setModal(true)}>
                <Plus size={15} />
                Nouveau
              </button>
              <button className="button" onClick={() => setModal(true)}>
                Modifier
              </button>
              <button
                className="button ghost"
                onClick={() => setStatus("Les filtres sont disponibles dans vos vues CRM.")}
              >
                <SlidersHorizontal size={15} />
                Filtrer
              </button>
              <button className="button" disabled>
                Indisponible
              </button>
              <button
                className="icon-button"
                aria-label="Ouvrir les réglages de démonstration"
                onClick={() => setDrawer(true)}
              >
                <SlidersHorizontal size={16} />
              </button>
              <Dropdown.Root>
                <Dropdown.Trigger className="icon-button" aria-label="Actions de démonstration">
                  <Ellipsis size={16} />
                </Dropdown.Trigger>
                <Dropdown.Portal>
                  <Dropdown.Content className="sb-dropdown" align="start" sideOffset={5}>
                    <Dropdown.Item
                      className="sb-dropdown-item"
                      onSelect={() => setStatus("Copie de démonstration préparée")}
                    >
                      <Copy size={16} />
                      Dupliquer
                    </Dropdown.Item>
                    <Dropdown.Item className="sb-dropdown-item" onSelect={() => setDrawer(true)}>
                      <ExternalLink size={16} />
                      Ouvrir dans un panneau
                    </Dropdown.Item>
                    <Dropdown.Separator className="sb-separator" />
                    <Dropdown.Item
                      className="sb-dropdown-item"
                      onSelect={() => {
                        setIndex(0);
                        setSlides(true);
                      }}
                    >
                      <Presentation size={16} />
                      Présenter
                    </Dropdown.Item>
                  </Dropdown.Content>
                </Dropdown.Portal>
              </Dropdown.Root>
            </div>
            <div className={styles.row}>
              <Badge value="Gagné" />
              <Badge value="Nouveau" />
              <Badge value="Perdu" />
              <span className="pill">4 propriétés</span>
            </div>
          </div>
        </section>
        <section id="proprietes">
          <h2>Propriétés et réglages</h2>
          <p>Champs compacts, dates, interrupteurs et curseurs.</p>
          <div className={styles.twoColumns}>
            <div className={styles.surface}>
              <label>
                Nom
                <input placeholder="Nom de votre vue" defaultValue="Suivi commercial" />
              </label>
              <label>
                Équipe
                <select defaultValue="commercial">
                  <option value="commercial">Équipe commerciale</option>
                  <option value="delivery">Équipe réalisation</option>
                </select>
              </label>
              <label>
                Date
                <DatePicker
                  defaultValue={date}
                  onValueChange={setDate}
                  label="Date de démonstration"
                  name="date-example"
                />
              </label>
            </div>
            <div className={styles.surface}>
              <Toggle
                checked={enabled}
                onChange={setEnabled}
                label="Afficher les propriétés"
                description="Un réglage disponible dans votre présentation."
              />
              <label className={styles.range}>
                Largeur du bloc
                <input
                  type="range"
                  aria-label="Largeur du bloc de démonstration"
                  min={0}
                  max={3}
                  value={range}
                  onChange={(event) => setRange(Number(event.target.value))}
                />
                <span>{["¼ de ligne", "⅓ de ligne", "½ ligne", "Ligne entière"][range]}</span>
              </label>
              <details className={styles.disclosure}>
                <summary>Options avancées</summary>
                <p>Les paramètres restent accessibles sans encombrer le contenu.</p>
              </details>
            </div>
          </div>
        </section>
        <section id="vues">
          <h2>Vues de vos onglets</h2>
          <p>Un sélecteur commun pour les tableaux, les galeries, les listes et les graphiques.</p>
          <div className={styles.databaseToolbar}>
            <ViewButtons
              label="Présentation de la démonstration"
              value={layout}
              options={[
                { value: "table", label: "Liste", icon: List },
                { value: "board", label: "Kanban", icon: Columns3 },
                { value: "calendar", label: "Calendrier", icon: CalendarDays },
                { value: "gallery", label: "Galerie", icon: LayoutGrid },
                { value: "chart", label: "Graphique", icon: BarChart3 },
              ]}
              onChange={setLayout}
            />
            <span />
            <SearchBox value={query} onChange={setQuery} />
            <button className="button primary" onClick={() => setModal(true)}>
              <Plus size={14} />
              Nouveau
            </button>
          </div>
          {layout === "chart" ? (
            chartView(chart)
          ) : layout === "calendar" ? (
            <MonthCalendar
              label="Calendrier de démonstration"
              initialMonth={new Date(2026, 8, 1)}
              note="Dates de clôture · Données fictives"
              items={rows.map((row, index) => ({
                id: row.name,
                title: row.name,
                status: row.stage,
                detail: row.amount,
                date: ["2026-09-22", "2026-09-24", "2026-09-30"][index],
              }))}
              onOpen={() => setDrawer(true)}
            />
          ) : layout === "board" ? (
            <div className={styles.board}>
              {["Qualification", "Proposition", "Gagné"].map((stage) => (
                <div key={stage}>
                  <header>
                    <Badge value={stage} />
                  </header>
                  {rows
                    .filter((row) => row.stage === stage)
                    .map((row) => (
                      <button key={row.name} onClick={() => setDrawer(true)}>
                        <strong>{row.name}</strong>
                        <span>{row.amount}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          ) : layout === "gallery" ? (
            <div className={styles.gallery}>
              {rows.map((row) => (
                <button key={row.name} onClick={() => setDrawer(true)}>
                  <span className={styles.cardCover} />
                  <div>
                    <strong>{row.name}</strong>
                    <Badge value={row.stage} />
                    <span>{row.amount}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    {layout !== "list" && <th>Statut</th>}
                    <th>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.name}
                      tabIndex={0}
                      onClick={() => setDrawer(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setDrawer(true);
                      }}
                    >
                      <td>{row.name}</td>
                      {layout !== "list" && (
                        <td>
                          <Badge value={row.stage} />
                        </td>
                      )}
                      <td>{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section id="graphiques">
          <h2>Graphiques</h2>
          <p>
            Les graphiques des dashboards conservent leurs filtres, leurs devises et l’accès aux
            données source.
          </p>
          <div className={styles.surface}>
            <div className={styles.row}>
              <strong>Pipeline de démonstration</strong>
              <span />
              <VisualPicker
                label="Type de graphique"
                value={chart}
                options={[
                  { value: "columns", label: "Colonnes", icon: BarChart3 },
                  { value: "line", label: "Courbe", icon: ChartLine },
                  { value: "donut", label: "Anneau", icon: ChartPie },
                ]}
                onChange={setChart}
              />
              <button
                className="icon-button"
                aria-label="Agrandir le graphique de démonstration"
                onClick={() => {
                  setIndex(0);
                  setSlides(true);
                }}
              >
                <ExternalLink size={16} />
              </button>
            </div>
            {chartView(chart)}
          </div>
        </section>
        <section id="presentation">
          <h2>Diaporama</h2>
          <p>Présentez les widgets du dashboard un par un avec les flèches du clavier.</p>
          <div className={styles.presentation}>
            <div>
              <Presentation size={28} />
              <h3>Vos chiffres, en grand</h3>
              <p>Une présentation sobre, avec vos blocs existants.</p>
            </div>
            <button
              className="button primary"
              onClick={() => {
                setIndex(0);
                setSlides(true);
              }}
            >
              <Presentation size={16} />
              Lancer la démonstration
            </button>
          </div>
        </section>
        <p role="status" className={styles.status}>
          {status}
        </p>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Nouvelle fiche"
          description="Exemple de formulaire. Aucune donnée CRM n’est enregistrée."
        >
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              setModal(false);
              setStatus("Aperçu validé — aucune fiche créée.");
            }}
          >
            <label>
              Nom
              <input required placeholder="Nom de l’entreprise" />
            </label>
            <label>
              Statut
              <select>
                <option>Nouveau</option>
                <option>Qualification</option>
              </select>
            </label>
            <div className="dialog-footer">
              <button type="button" className="button" onClick={() => setModal(false)}>
                Annuler
              </button>
              <button className="button primary">
                <Check size={14} />
                Valider l’aperçu
              </button>
            </div>
          </form>
        </Modal>
        <Drawer open={drawer} onClose={() => setDrawer(false)} title="Studio Rivage">
          <div className={styles.drawerContent}>
            <Badge value="Gagné" />
            <h2>Tout le contexte, au même endroit.</h2>
            <p>Une fiche fictive pour examiner le panneau latéral.</p>
            <dl>
              <dt>Responsable</dt>
              <dd>Équipe commerciale</dd>
              <dt>Montant</dt>
              <dd>41 000 €</dd>
            </dl>
          </div>
        </Drawer>
        <SlideViewer
          open={slides}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setSlides(false)}
          label="Démonstration · données fictives"
          slides={[
            {
              id: "chart",
              title: "Votre pipeline",
              description: "Données fictives pour cet aperçu",
              content: chartView("columns"),
            },
            {
              id: "distribution",
              title: "Répartition des opportunités",
              description: "Les données réelles restent soumises aux permissions du workspace.",
              content: chartView("donut"),
            },
            {
              id: "summary",
              title: "Une vue claire pour votre équipe",
              description: "Exemple de bloc de synthèse",
              content: (
                <div className={styles.slideSummary}>
                  <strong>115 000 €</strong>
                  <p>4 étapes · 23 opportunités fictives</p>
                  <Badge value="Gagné" />
                </div>
              ),
            },
          ]}
        />
      </div>
    </main>
  );
}
