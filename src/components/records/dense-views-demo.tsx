"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Columns3, Moon, Sun } from "lucide-react";
import { MonthCalendar } from "../ui/month-calendar";
import { ViewButtons } from "../ui/view-buttons";
import { money } from "../ui";
import { RecordQuickPeek } from "./quick-peek";
import { RecordBoard } from "./board";
import type { CrmRecord } from "@/lib/domain/types";
import styles from "./dense-views-demo.module.css";
const records: CrmRecord[] = Array.from({ length: 47 }, (_, i) => ({
  id: `demo-${i + 1}`,
  workspace_id: "demo",
  created_at: "2026-10-01T12:00:00Z",
  object_id: "demo-deals",
  display_name: `Projet de démonstration ${i + 1} · Studio Rivage`,
  email: null,
  domain: null,
  stage: "Qualification",
  amount: 2500 + i * 100,
  currency: "EUR",
  owner_id: null,
  attributes: {},
  archived: false,
  version: 1,
  close_date: "2026-10-06",
}));
export function DenseViewsDemo() {
  const [view, setView] = useState("calendar"),
    [selected, setSelected] = useState<CrmRecord | null>(null),
    [dark, setDark] = useState(false);
  useEffect(() => {
    const previous = document.documentElement.dataset.relayTheme;
    document.documentElement.dataset.relayTheme = dark ? "dark" : "light";
    return () => {
      if (previous) document.documentElement.dataset.relayTheme = previous;
      else delete document.documentElement.dataset.relayTheme;
    };
  }, [dark]);
  return (
    <main className={styles.page} data-relay-ui>
      <header className={styles.header}>
        <Link href="/demo/components">Zyliad · Démonstration</Link>
        <button
          type="button"
          className="icon-button"
          aria-label={dark ? "Afficher le thème clair" : "Afficher le thème sombre"}
          onClick={() => setDark(!dark)}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>
      <div className={styles.body}>
        <h1>Des vues lisibles, même avec 47 fiches</h1>
        <p>
          47 opportunités fictives à la même date et dans la même étape. Ouvrez « + 45 autres » ou
          faites défiler la colonne Qualification.
        </p>
        <ViewButtons
          label="Vue de démonstration"
          value={view}
          onChange={setView}
          options={[
            { value: "calendar", label: "Calendrier", icon: CalendarDays },
            { value: "kanban", label: "Kanban", icon: Columns3 },
          ]}
        />
        {view === "calendar" ? (
          <MonthCalendar
            label="Calendrier avec 47 fiches"
            initialMonth={new Date(2026, 9, 1)}
            items={records.map((r) => ({
              id: r.id,
              title: r.display_name,
              date: r.close_date,
              status: r.stage,
              detail: money(r.amount, r.currency),
            }))}
            onOpen={(id) => setSelected(records.find((r) => r.id === id) ?? null)}
          />
        ) : (
          <RecordBoard
            rows={records}
            members={[]}
            readonly
            busy={false}
            onOpen={setSelected}
            onCreate={() => {}}
            onMove={async () => {}}
          />
        )}
      </div>
      {selected && <RecordQuickPeek record={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}
