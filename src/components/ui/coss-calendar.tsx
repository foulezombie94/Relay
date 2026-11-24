"use client";

// Port of the coss ui Calendar and Date Picker (https://coss.com/ui, MIT): DayPicker in
// a Base UI popover, with quick dates, styled with CSS modules and the Zyliad tokens.
import { useState, type ComponentProps } from "react";
import { DayPicker } from "react-day-picker";
import { Popover } from "@base-ui/react/popover";
import { addDays, format, isValid, parse } from "date-fns";
import { fr } from "date-fns/locale";
import { fr as dayPickerFr } from "react-day-picker/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./coss-calendar.module.css";

/** coss Calendar: French, weeks from Monday, outside days shown. */
export function Calendar({ className, ...props }: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      locale={dayPickerFr}
      weekStartsOn={1}
      showOutsideDays
      data-slot="calendar"
      className={cn(styles.calendar, className)}
      classNames={{
        months: styles.months,
        month: styles.month,
        month_caption: styles.caption,
        caption_label: styles.captionLabel,
        dropdowns: styles.dropdowns,
        dropdown_root: styles.dropdownRoot,
        dropdown: styles.dropdown,
        nav: styles.nav,
        button_previous: styles.navButton,
        button_next: styles.navButton,
        month_grid: styles.grid,
        weekdays: styles.weekdays,
        weekday: styles.weekday,
        week: styles.week,
        day: styles.day,
        day_button: styles.dayButton,
        selected: styles.selected,
        today: styles.today,
        outside: styles.outside,
        disabled: styles.disabled,
        hidden: styles.hidden,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft size={16} aria-hidden="true" />
          ) : orientation === "right" ? (
            <ChevronRight size={16} aria-hidden="true" />
          ) : (
            <ChevronsUpDown size={14} aria-hidden="true" />
          ),
      }}
      formatters={{
        formatMonthDropdown: (month) => format(month, "LLL", { locale: fr }),
      }}
      {...(props as ComponentProps<typeof DayPicker>)}
    />
  );
}

const valueFormat = (withTime: boolean) => (withTime ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd");
function parseValue(value: string | undefined, withTime: boolean) {
  if (!value) return undefined;
  const parsed = parse(value, valueFormat(withTime), new Date());
  return isValid(parsed) ? parsed : undefined;
}

/**
 * coss Date Picker with quick dates and an optional time. The value is submitted
 * through a hidden input in the same format as a native date or datetime-local field.
 */
export function DatePicker({
  name,
  label = "Date",
  defaultValue,
  withTime = false,
  disabled,
  required,
  placeholder = "Choisir une date",
  onValueChange,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  withTime?: boolean;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  onValueChange?: (value: string) => void;
}) {
  const [selected, setSelected] = useState(() => parseValue(defaultValue, withTime));
  const [month, setMonth] = useState(() => selected ?? new Date());
  const [open, setOpen] = useState(false);
  const value = selected ? format(selected, valueFormat(withTime)) : "";
  const commit = (next: Date | undefined) => {
    setSelected(next);
    if (next) setMonth(next);
    onValueChange?.(next ? format(next, valueFormat(withTime)) : "");
  };
  const pick = (day: Date | undefined) => {
    if (!day) return;
    const next = new Date(day);
    if (withTime) next.setHours(selected?.getHours() ?? 9, selected?.getMinutes() ?? 0, 0, 0);
    commit(next);
    if (!withTime) setOpen(false);
  };
  const today = new Date();
  const presets: [string, number][] = [
    ["Aujourd’hui", 0],
    ["Demain", 1],
    ["Dans 3 jours", 3],
    ["Dans une semaine", 7],
  ];
  return (
    <>
      <input type="hidden" name={name} value={value} required={required} />
      <Popover.Root open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
        <Popover.Trigger
          className={styles.trigger}
          disabled={disabled}
          aria-label={
            label + " : " + (selected ? format(selected, "PPPp", { locale: fr }) : "aucune date")
          }
          data-placeholder={selected ? undefined : ""}
        >
          <CalendarIcon size={15} aria-hidden="true" />
          <span className={styles.triggerText}>
            {selected
              ? format(selected, withTime ? "d MMM yyyy 'à' HH:mm" : "d MMMM yyyy", { locale: fr })
              : placeholder}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className={styles.positioner} sideOffset={6} align="start">
            <Popover.Popup className={styles.popup} aria-label={label}>
              <div className={styles.body}>
                <div className={styles.presets}>
                  {presets.map(([text, days]) => (
                    <button
                      key={text}
                      type="button"
                      className={styles.preset}
                      onClick={() => pick(addDays(today, days))}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                {/* coss p-calendar-4: month and year menus in the header. */}
                <Calendar
                  mode="single"
                  captionLayout="dropdown"
                  startMonth={new Date(today.getFullYear() - 10, 0)}
                  endMonth={new Date(today.getFullYear() + 10, 11)}
                  month={month}
                  onMonthChange={setMonth}
                  selected={selected}
                  onSelect={pick}
                />
              </div>
              <div className={styles.footer}>
                {withTime && (
                  <label className={styles.time}>
                    Heure
                    {/* Uncontrolled while typing (a half-typed time is not a value);
                        a new day re-mounts it with that day's time. */}
                    <input
                      key={selected ? format(selected, "yyyy-MM-dd") : "none"}
                      type="time"
                      aria-label="Heure"
                      disabled={!selected}
                      defaultValue={selected ? format(selected, "HH:mm") : ""}
                      onChange={(event) => {
                        if (!selected || !event.target.value) return;
                        const [h, m] = event.target.value.split(":").map(Number);
                        const next = new Date(selected);
                        next.setHours(h, m, 0, 0);
                        commit(next);
                      }}
                    />
                  </label>
                )}
                <div className={styles.footerActions}>
                  {selected && (
                    <button
                      type="button"
                      className={styles.clear}
                      onClick={() => {
                        commit(undefined);
                        setOpen(false);
                      }}
                    >
                      <X size={13} aria-hidden="true" />
                      Effacer
                    </button>
                  )}
                  <button type="button" className={styles.done} onClick={() => setOpen(false)}>
                    Valider
                  </button>
                </div>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
