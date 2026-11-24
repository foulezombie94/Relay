"use client";

// Ports of coss ui components (https://coss.com/ui, MIT) on Base UI primitives,
// restyled with CSS modules and the Zyliad tokens instead of Tailwind.
import type { ComponentProps, ReactNode } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./coss.module.css";

export type Option = { value: string; label: string };

/**
 * coss Select. "" stands for "no value" (a filter's "all" entry or an empty form
 * field); with `name`, Base UI submits the value through a hidden input.
 */
export function Select({
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = "Choisir…",
  name,
  required,
  disabled,
  "aria-label": ariaLabel,
  size = "default",
  className,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: Option[];
  placeholder?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const items = options.map((o) => ({ value: o.value === "" ? null : o.value, label: o.label }));
  const toInner = (v: string | undefined) => (v === undefined ? undefined : v === "" ? null : v);
  return (
    <SelectPrimitive.Root
      items={items}
      value={toInner(value)}
      defaultValue={toInner(defaultValue)}
      onValueChange={(next) => onValueChange?.(next == null ? "" : String(next))}
      name={name}
      required={required}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn(styles.trigger, size === "sm" && styles.triggerSm, className)}
        aria-label={ariaLabel}
        data-slot="select-trigger"
      >
        <SelectPrimitive.Value className={styles.value} placeholder={placeholder} />
        <SelectPrimitive.Icon className={styles.triggerIcon}>
          <ChevronsUpDown size={15} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          className={styles.positioner}
          sideOffset={4}
          alignItemWithTrigger={false}
        >
          <SelectPrimitive.Popup className={styles.popup} data-slot="select-popup">
            <SelectPrimitive.List className={styles.list}>
              {items.map((item) => (
                <SelectPrimitive.Item
                  key={String(item.value)}
                  value={item.value}
                  className={styles.item}
                >
                  <SelectPrimitive.ItemIndicator className={styles.itemIndicator}>
                    <Check size={14} />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** coss Dialog: backdrop, centred popup, header, scrollable body and footer. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    // A click outside never discards a form: pickers render some menus outside the
    // popup. Escape, the close button and the footer still close it.
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      disablePointerDismissal
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className={styles.backdrop} />
        <DialogPrimitive.Viewport className={styles.viewport}>
          <DialogPrimitive.Popup className={cn(styles.dialog, className)} data-slot="dialog">
            <div className={styles.dialogHeader}>
              <DialogPrimitive.Title className={styles.dialogTitle}>{title}</DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className={styles.dialogDescription}>
                  {description}
                </DialogPrimitive.Description>
              )}
              <DialogPrimitive.Close className={styles.dialogClose} aria-label="Fermer">
                <X size={16} />
              </DialogPrimitive.Close>
            </div>
            <div className={styles.dialogBody}>{children}</div>
            {footer && <div className={styles.dialogFooter}>{footer}</div>}
          </DialogPrimitive.Popup>
        </DialogPrimitive.Viewport>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** coss Checkbox, optionally round (task completion). */
export function Checkbox({
  round = false,
  className,
  ...props
}: CheckboxPrimitive.Root.Props & { round?: boolean }) {
  return (
    <CheckboxPrimitive.Root
      className={cn(styles.checkbox, round && styles.checkboxRound, className)}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator className={styles.checkboxIndicator}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export type BadgeVariant = "outline" | "secondary" | "info" | "success" | "warning" | "error";
/** coss Badge with its status variants. */
export function Badge({
  variant = "secondary",
  dot = false,
  className,
  children,
  ...props
}: ComponentProps<"span"> & { variant?: BadgeVariant; dot?: boolean }) {
  return (
    <span className={cn(styles.badge, styles[variant], className)} data-slot="badge" {...props}>
      {dot && <i className={styles.badgeDot} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** coss Segmented control: one pressed item, keyboard reachable buttons. */
export function SegmentedControl({
  value,
  onValueChange,
  options,
  "aria-label": ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: (Option & { count?: number })[];
  "aria-label": string;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.segment}
          aria-pressed={value === option.value}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
          {option.count != null && <span className={styles.segmentCount}>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** coss Field: label, control, description and error laid out together. */
export function Field({
  label,
  description,
  required,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  description?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn(styles.field, className)} data-slot="field">
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      {children}
      {description && <p className={styles.fieldDescription}>{description}</p>}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(styles.input, className)} data-slot="input" {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(styles.textarea, className)} data-slot="textarea" {...props} />;
}

/** coss Empty: stacked icon, title, description and an action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty} data-slot="empty">
      <div className={styles.emptyMedia} aria-hidden="true">
        <span className={styles.emptyBack} />
        <span className={styles.emptyIcon}>{icon}</span>
      </div>
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyDescription}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn(styles.skeleton, className)} aria-hidden="true" {...props} />;
}
