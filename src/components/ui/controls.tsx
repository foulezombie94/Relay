"use client";
import { useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Search, Check, type LucideIcon } from "lucide-react";
import styles from "./controls.module.css";
export type VisualOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  preview?: ReactNode;
};
export function VisualPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  searchable = false,
}: {
  label: string;
  value: T;
  options: VisualOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = options.find((option) => option.value === value);
  const Icon = selected?.icon;
  const visible = options.filter((option) =>
    option.label.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")),
  );
  function navigate(event: KeyboardEvent, index: number) {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 3,
      ArrowUp: -3,
    };
    if (event.key in steps || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? visible.length - 1
            : Math.max(0, Math.min(visible.length - 1, index + steps[event.key]));
      refs.current[next]?.focus();
    }
  }
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger
        type="button"
        className={styles.pickerTrigger}
        aria-label={label}
        disabled={disabled}
      >
        {Icon && <Icon size={16} />}
        <span>{selected?.label ?? label}</span>
        <ChevronDown size={13} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.picker}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
        >
          <div className={styles.pickerHeading}>{label}</div>
          {searchable && (
            <label className={styles.pickerSearch}>
              <Search size={14} />
              <input
                aria-label={"Rechercher : " + label}
                placeholder="Rechercher une présentation…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          )}
          <div className={styles.visualGrid} role="group" aria-label={"Choix : " + label}>
            {visible.map((option, index) => {
              const OptionIcon = option.icon;
              return (
                <button
                  type="button"
                  key={option.value}
                  ref={(element) => {
                    refs.current[index] = element;
                  }}
                  aria-pressed={option.value === value}
                  className={styles.visualOption}
                  onKeyDown={(event) => navigate(event, index)}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {option.preview ?? (OptionIcon && <OptionIcon size={20} />)}
                  <span>{option.label}</span>
                  {option.value === value && <Check size={10} className={styles.visualCheck} />}
                </button>
              );
            })}
          </div>
          {!visible.length && <p className={styles.pickerEmpty}>Aucune présentation trouvée.</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={styles.toggleRow}>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className={styles.toggle}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </label>
  );
}
