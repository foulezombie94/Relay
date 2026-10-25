"use client";
import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfWeek,
  endOfMonth,
  format,
  isSameMonth,
  isToday,
  parseISO,
  isValid,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";
import styles from "./month-calendar.module.css";

export type CalendarItem = {
  id: string;
  title: string;
  date: string | null;
  detail?: string;
  status?: string;
};
const visiblePerDay = 2;
function CalendarCard({ item, onOpen }: { item: CalendarItem; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      className={styles.event}
      title={item.title}
      onClick={() => onOpen(item.id)}
    >
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.content}>
        <strong>{item.title}</strong>
        {(item.status || item.detail) && (
          <span className={styles.metadata}>
            {item.status && <small>{item.status}</small>}
            {item.detail && <span>{item.detail}</span>}
          </span>
        )}
      </span>
    </button>
  );
}
function DayOverflow({
  items,
  day,
  onOpen,
}: {
  items: CalendarItem[];
  day: Date;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const openingRecord = useRef(false);
  const dayLabel = format(day, "d MMMM yyyy", { locale: fr });
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");
  const visible = items.filter((item) =>
    normalize([item.title, item.status, item.detail].filter(Boolean).join(" ")).includes(
      normalize(search.trim()),
    ),
  );
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <Popover.Trigger
        type="button"
        className={styles.more}
        aria-label={`Afficher les ${items.length} éléments du ${dayLabel}`}
      >
        + {items.length - visiblePerDay} autres
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.dayPopover}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={`Éléments du ${dayLabel}`}
          onCloseAutoFocus={(event) => {
            if (openingRecord.current) {
              event.preventDefault();
              openingRecord.current = false;
            }
          }}
        >
          <header>
            <div>
              <strong>{dayLabel}</strong>
              <span>{items.length} éléments</span>
            </div>
            <Popover.Close className={styles.closeDay} aria-label="Fermer la journée">
              <X size={16} />
            </Popover.Close>
          </header>
          <label className={styles.daySearch}>
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              aria-label="Rechercher dans cette journée"
              placeholder="Rechercher une fiche…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {search && (
            <p className={styles.searchCount} role="status">
              {visible.length} résultat{visible.length > 1 ? "s" : ""} sur {items.length}
            </p>
          )}
          <div
            className={styles.dayList}
            role="region"
            aria-label={`Liste du ${dayLabel}`}
            tabIndex={0}
          >
            {visible.map((item) => (
              <CalendarCard
                key={item.id}
                item={item}
                onOpen={(id) => {
                  openingRecord.current = true;
                  setOpen(false);
                  setSearch("");
                  onOpen(id);
                }}
              />
            ))}
            {!visible.length && (
              <p className={styles.noMatches}>Aucune fiche ne correspond à votre recherche.</p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function calendarDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parseISO(value);
  return isValid(date) && format(date, "yyyy-MM-dd") === value ? date : null;
}
export function MonthCalendar({
  items,
  onOpen,
  initialMonth,
  label = "Calendrier",
  note,
}: {
  items: CalendarItem[];
  onOpen: (id: string) => void;
  initialMonth?: Date;
  label?: string;
  note?: string;
}) {
  const [month, setMonth] = useState(() => startOfMonth(initialMonth ?? new Date()));
  const [picker, setPicker] = useState(false);
  const days = eachDayOfInterval({
    start: startOfWeek(month, { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const dated = items.filter((item) => calendarDate(item.date));
  const unscheduled = items.length - dated.length;
  return (
    <section className={styles.calendar} aria-label={label}>
      <div className={styles.toolbar}>
        <span className={styles.note}>{note}</span>
        <div className={styles.navigation} role="group" aria-label="Navigation du calendrier">
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label="Mois précédent"
          >
            <ChevronLeft size={16} />
          </button>
          <Popover.Root open={picker} onOpenChange={setPicker}>
            <Popover.Trigger className={styles.month} type="button" aria-label="Choisir le mois">
              <span aria-live="polite">{format(month, "MMMM yyyy", { locale: fr })}</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className={styles.monthPicker} align="end" sideOffset={6}>
                <label>
                  Afficher le mois
                  <input
                    type="month"
                    aria-label="Mois affiché"
                    value={format(month, "yyyy-MM")}
                    onChange={(event) => {
                      const next = calendarDate(event.target.value + "-01");
                      if (next) {
                        setMonth(next);
                        setPicker(false);
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setMonth(startOfMonth(new Date()));
                    setPicker(false);
                  }}
                >
                  Ce mois-ci
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button
            type="button"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label="Mois suivant"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className={styles.scroll}>
        <table className={styles.grid} aria-label={format(month, "MMMM yyyy", { locale: fr })}>
          <thead>
            <tr>
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
                <th scope="col" key={day}>
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: days.length / 7 }, (_, week) => (
              <tr key={week}>
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayItems = dated.filter((item) => item.date === key);
                  return (
                    <td key={key} data-outside={!isSameMonth(day, month)}>
                      <div className={styles.dayCell}>
                        <time dateTime={key} className={styles.day} data-today={isToday(day)}>
                          {day.getDate() === 1 && !isSameMonth(day, month)
                            ? format(day, "d MMM", { locale: fr })
                            : day.getDate()}
                        </time>
                        <div className={styles.events}>
                          {dayItems.slice(0, visiblePerDay).map((item) => (
                            <CalendarCard key={item.id} item={item} onOpen={onOpen} />
                          ))}
                        </div>
                        {dayItems.length > visiblePerDay && (
                          <DayOverflow
                            key={key + ":" + dayItems.map((item) => item.id).join(",")}
                            items={dayItems}
                            day={day}
                            onOpen={onOpen}
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unscheduled > 0 && (
        <p className={styles.unscheduled}>
          {unscheduled} élément{unscheduled > 1 ? "s" : ""} sans date valide dans cette sélection.
        </p>
      )}
    </section>
  );
}
