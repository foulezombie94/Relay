"use client";
import { useRef } from "react";
import type { VisualOption } from "./controls";
import styles from "./view-buttons.module.css";

export function ViewButtons<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: VisualOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="group" aria-label={label} className={styles.views}>
      {options.map(({ value: key, label: text, icon: Icon }, index) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          aria-pressed={value === key}
          ref={(element) => {
            refs.current[index] = element;
          }}
          onClick={() => onChange(key)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : (index + (event.key === "ArrowRight" ? 1 : -1) + options.length) %
                    options.length;
            refs.current[next]?.focus();
          }}
        >
          {Icon && <Icon size={15} strokeWidth={1.6} />}
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
