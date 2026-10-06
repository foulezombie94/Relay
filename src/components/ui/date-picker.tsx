"use client";

import { useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import { DayPicker } from "react-day-picker";
import { addDays, format, isValid, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  X,
} from "lucide-react";
import "react-day-picker/style.css";
import styles from "./date-picker.module.css";

function TimePart({
  value,
  label,
  count,
  onChange,
}: {
  value: string;
  label: string;
  count: number;
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        type="button"
        className={styles.timeTrigger}
        aria-label={label}
      >
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={13} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={5}
          className={styles.timeMenu}
        >
          <Select.ScrollUpButton className={styles.scrollButton}>
            <ChevronLeft size={12} />
          </Select.ScrollUpButton>
          <Select.Viewport>
            {Array.from({ length: count }, (_, i) =>
              String(i).padStart(2, "0"),
            ).map((item) => (
              <Select.Item value={item} key={item} className={styles.timeItem}>
                <Select.ItemText>{item}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={12} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className={styles.scrollButton}>
            <ChevronDown size={12} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export function DatePicker({
  name,
  label,
  defaultValue = "",
  withTime = false,
  required = false,
  disabled = false,
  onValueChange,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  withTime?: boolean;
  required?: boolean;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}) {
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<Date | undefined>(() => {
    const parsed = defaultValue ? parseISO(defaultValue) : undefined;
    return parsed && isValid(parsed) ? parsed : undefined;
  });
  const [month, setMonth] = useState(selected ?? new Date());
  const [open, setOpen] = useState(false);
  const value = selected
    ? format(selected, withTime ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd")
    : "";
  const display = selected
    ? format(selected, withTime ? "d MMM yyyy 'à' HH:mm" : "d MMMM yyyy", {
        locale: fr,
      })
    : "Choisir une date";

  function choose(day: Date | undefined) {
    if (!day) return;
    const next = new Date(day);
    if (withTime)
      next.setHours(
        selected?.getHours() ?? 9,
        selected?.getMinutes() ?? 0,
        0,
        0,
      );
    setSelected(next);
    onValueChange?.(
      format(next, withTime ? "yyyy-MM-dd\u0027T\u0027HH:mm" : "yyyy-MM-dd"),
    );
    setMonth(next);
    if (!withTime) setOpen(false);
  }
  function changeTime(part: "hours" | "minutes", next: string) {
    if (!selected) return;
    const updated = new Date(selected);
    if (part === "hours") updated.setHours(Number(next));
    else updated.setMinutes(Number(next));
    setSelected(updated);
    onValueChange?.(
      format(updated, withTime ? "yyyy-MM-dd\u0027T\u0027HH:mm" : "yyyy-MM-dd"),
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <input type="hidden" name={name} value={value} disabled={disabled} />
      <Popover.Trigger asChild>
        <button
          type="button"
          ref={triggerRef}
          className={`${styles.trigger} ${selected ? "" : styles.empty}`}
          disabled={disabled}
          aria-label={`${label} : ${display}`}
          aria-required={required || undefined}
        >
          <CalendarDays size={16} />
          <span>{display}</span>
          <ChevronDown size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Portal
        container={
          triggerRef.current?.closest<HTMLElement>("[role=dialog]") ?? undefined
        }
      >
        <Popover.Content
          sideOffset={8}
          collisionPadding={14}
          collisionBoundary={
            triggerRef.current?.closest<HTMLElement>("[role=dialog]") ??
            undefined
          }
          align="start"
          className={styles.content}
          aria-labelledby={headingId}
        >
          <div className={styles.heading}>
            <div>
              <span className={styles.eyebrow}>
                {withTime ? "DATE ET HEURE" : "CALENDRIER"}
              </span>
              <h3 id={headingId}>{label}</h3>
            </div>
            <Popover.Close
              className={styles.close}
              aria-label="Fermer le calendrier"
            >
              <X size={16} />
            </Popover.Close>
          </div>
          <div className={styles.shortcuts}>
            {[
              { text: "Aujourd’hui", days: 0 },
              { text: "Demain", days: 1 },
              { text: "+ 7 jours", days: 7 },
            ].map(({ text, days }) => (
              <button
                key={days}
                type="button"
                onClick={() => choose(addDays(new Date(), days))}
              >
                {text}
              </button>
            ))}
          </div>
          <DayPicker
            className={styles.calendar}
            mode="single"
            locale={fr}
            weekStartsOn={1}
            fixedWeeks
            showOutsideDays
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={choose}
            components={{
              Chevron: ({ orientation, ...props }) =>
                orientation === "left" ? (
                  <ChevronLeft {...props} size={16} />
                ) : (
                  <ChevronRight {...props} size={16} />
                ),
            }}
          />
          {withTime && (
            <div className={styles.timeRow}>
              <span>
                <Clock3 size={16} /> Heure locale
              </span>
              {selected ? (
                <div>
                  <TimePart
                    label={`Heures · ${label}`}
                    count={24}
                    value={format(selected, "HH")}
                    onChange={(v) => changeTime("hours", v)}
                  />
                  <span>:</span>
                  <TimePart
                    label={`Minutes · ${label}`}
                    count={60}
                    value={format(selected, "mm")}
                    onChange={(v) => changeTime("minutes", v)}
                  />
                </div>
              ) : (
                <small>Choisissez une date</small>
              )}
            </div>
          )}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.clear}
              disabled={!selected || required}
              onClick={() => {
                setSelected(undefined);
                onValueChange?.("");
                setOpen(false);
              }}
            >
              Effacer
            </button>
            {withTime ? (
              <button
                type="button"
                className={styles.apply}
                disabled={!selected}
                onClick={() => setOpen(false)}
              >
                Confirmer <Check size={14} />
              </button>
            ) : (
              <span>
                {selected
                  ? format(selected, "d MMM yyyy", { locale: fr })
                  : "Sélectionnez un jour"}
              </span>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
