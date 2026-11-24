"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import styles from "./password-input.module.css";

const LEVELS = [
  { label: "Faible", color: "#FF3B30" },
  { label: "Moyen", color: "#FF9500" },
  { label: "Bon", color: "#FFCC00" },
  { label: "Fort", color: "#34C759" },
] as const;

const LID_OPEN = { top: 5.5, bottom: 18.5 };
const LID_CLOSED = { top: 17, bottom: 17 };
const LASHES = ["M4.4 14.6 3 16.4", "M9 16.6 8.5 19", "M15 16.6l.5 2.4", "M19.6 14.6l1.4 1.8"];

const INSTANT: Transition = { duration: 0 };
const SPRING: Transition = { type: "spring", stiffness: 520, damping: 32 };
const LID_SPRING: Transition = { type: "spring", stiffness: 500, damping: 34 };
const SWAP: Transition = { duration: 0.12, ease: "easeOut" };
const REVEAL: Transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] };
const BLINK: Transition = {
  duration: 1.1,
  times: [0, 0.5, 0.5, 1],
  repeat: Infinity,
  ease: "linear",
};

const corner = (y: number) => 12 + (y - 12) * 0.64;

const eyePath = ({ top, bottom }: { top: number; bottom: number }) =>
  `M2 12C4 ${corner(top)} 7.5 ${top} 12 ${top}C16.5 ${top} 20 ${corner(top)} 22 12C20 ${corner(bottom)} 16.5 ${bottom} 12 ${bottom}C7.5 ${bottom} 4 ${corner(bottom)} 2 12Z`;

/** 0 when empty, otherwise 1 (faible) to 4 (fort) from length and character variety. */
export function passwordStrength(value: string) {
  if (!value) return 0;
  const score = [
    value.length >= 8,
    value.length >= 12,
    /[a-z]/.test(value) && /[A-Z]/.test(value),
    /\d/.test(value),
    /[^a-zA-Z0-9]/.test(value),
  ].filter(Boolean).length;
  return Math.min(Math.max(score, 1), LEVELS.length);
}

function Glyph({
  char,
  visible,
  reduceMotion,
}: {
  char: string;
  visible: boolean;
  reduceMotion: boolean;
}) {
  const transition = reduceMotion ? INSTANT : SWAP;
  return (
    <span className={styles.glyph}>
      <motion.span
        data-slot="password-input-dot"
        initial={false}
        animate={{ opacity: visible ? 0 : 1 }}
        transition={transition}
        className={styles.dot}
      />
      <motion.span
        data-slot="password-input-char"
        initial={false}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={transition}
        className={styles.char}
      >
        {char}
      </motion.span>
    </span>
  );
}

function Eye({ open, reduceMotion }: { open: boolean; reduceMotion: boolean }) {
  const clipId = useId();
  const lid = { d: eyePath(open ? LID_OPEN : LID_CLOSED) };
  const transition = reduceMotion ? INSTANT : LID_SPRING;
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.eye}
    >
      <clipPath id={clipId}>
        <motion.path initial={false} animate={lid} transition={transition} />
      </clipPath>
      <circle cx={12} cy={12} r={3} clipPath={`url(#${clipId})`} />
      <motion.path initial={false} animate={lid} transition={transition} />
      {LASHES.map((d) => (
        <motion.path
          key={d}
          d={d}
          initial={false}
          animate={{ pathLength: open ? 0 : 1, opacity: open ? 0 : 1 }}
          transition={reduceMotion ? INSTANT : { duration: 0.2, delay: open ? 0 : 0.08 }}
        />
      ))}
    </svg>
  );
}

export type PasswordInputProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "size"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  defaultVisible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  /** Shows the strength meter (new passwords). Off for a sign-in field. */
  strength?: boolean;
  inputClassName?: string;
};

export function PasswordInput({
  value,
  defaultValue = "",
  onChange,
  defaultVisible = false,
  onVisibleChange,
  strength = true,
  placeholder,
  disabled,
  autoComplete = "current-password",
  className,
  inputClassName,
  onFocus,
  onBlur,
  ...props
}: PasswordInputProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const [visible, setVisible] = useState(defaultVisible);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0, scroll: 0 });
  const input = useRef<HTMLInputElement>(null);
  const frame = useRef(0);
  const reduceMotion = useReducedMotion() ?? false;

  const password = value ?? uncontrolled;
  const chars = Array.from(password);
  const level = passwordStrength(password);
  const animated = (transition: Transition) => (reduceMotion ? INSTANT : transition);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const read = () => {
    const el = input.current;
    if (!el) return;
    // Selection offsets count UTF-16 units; the glyphs count code points.
    const start = Array.from(el.value.slice(0, el.selectionStart ?? 0)).length;
    const end = Array.from(el.value.slice(0, el.selectionEnd ?? 0)).length;
    const scroll = el.scrollLeft;
    setSelection((current) =>
      current.start === start && current.end === end && current.scroll === scroll
        ? current
        : { start, end, scroll },
    );
  };

  // Read now so the caret moves with the keystroke, then again once scrollLeft settles.
  const sync = () => {
    read();
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(read);
  };

  const toggle = () => {
    const el = input.current;
    const start = el?.selectionStart ?? null;
    const end = el?.selectionEnd ?? null;
    setVisible(!visible);
    onVisibleChange?.(!visible);
    // Switching the input type drops the selection in some browsers.
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (el && start !== null && end !== null && document.activeElement === el)
        el.setSelectionRange(start, end);
      read();
    });
  };

  return (
    <div
      data-slot="password-input"
      data-visible={visible}
      className={cn(styles.root, disabled && styles.disabled, className)}
    >
      <div data-slot="password-input-field" className={styles.field} data-focused={focused}>
        <div className={styles.area}>
          <input
            ref={input}
            {...props}
            type={visible ? "text" : "password"}
            value={password}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete={autoComplete}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-slot="password-input-control"
            onChange={(event) => {
              if (value === undefined) setUncontrolled(event.target.value);
              onChange?.(event.target.value);
              sync();
            }}
            onSelect={sync}
            onScroll={sync}
            onFocus={(event) => {
              setFocused(true);
              sync();
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            className={cn(styles.control, inputClassName)}
          />

          <div aria-hidden data-slot="password-input-display" className={styles.display}>
            {!password && placeholder && <span className={styles.placeholder}>{placeholder}</span>}
            <div
              className={styles.track}
              style={{ transform: `translateX(${-selection.scroll}px)` }}
            >
              {focused && selection.end > selection.start && (
                <span
                  className={styles.selection}
                  style={{
                    left: `${selection.start}ch`,
                    width: `${selection.end - selection.start}ch`,
                  }}
                />
              )}
              {chars.map((char, index) => (
                <Glyph key={index} char={char} visible={visible} reduceMotion={reduceMotion} />
              ))}
              {focused && selection.start === selection.end && (
                <motion.span
                  // Remounting restarts the blink, so the caret stays solid while typing.
                  key={`${selection.end}:${chars.length}`}
                  data-slot="password-input-caret"
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={reduceMotion ? INSTANT : BLINK}
                  style={{ left: `${selection.end}ch` }}
                  className={styles.caret}
                />
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          data-slot="password-input-toggle"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          disabled={disabled}
          onPointerDown={(event) => event.preventDefault()}
          onClick={toggle}
          className={styles.toggle}
        >
          <Eye open={visible} reduceMotion={reduceMotion} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {strength && level > 0 && (
          <motion.div
            data-slot="password-input-strength"
            data-level={level}
            // Fades in place: a measured "auto" height clipped the meter mid-animation.
            initial={{ opacity: 0, y: -4, filter: "blur(2px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
            transition={animated(REVEAL)}
            className={styles.strength}
          >
            <div className={styles.meter}>
              <div className={styles.bars}>
                {LEVELS.map((entry, index) => (
                  <span key={entry.label} className={styles.bar}>
                    <motion.span
                      initial={{ scaleX: 0 }}
                      animate={{
                        scaleX: index < level ? 1 : 0,
                        backgroundColor: LEVELS[level - 1].color,
                      }}
                      transition={animated({ ...SPRING, delay: index * 0.04 })}
                      className={styles.fill}
                    />
                  </span>
                ))}
              </div>
              <div className={styles.legend}>
                <span className={styles.legendLabel}>Robustesse du mot de passe</span>
                <span aria-live="polite" className={styles.level}>
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span
                      key={level}
                      initial={{ y: "100%", opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: "-100%", opacity: 0 }}
                      transition={animated(SPRING)}
                    >
                      {LEVELS[level - 1].label}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default PasswordInput;
