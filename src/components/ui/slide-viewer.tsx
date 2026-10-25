"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import styles from "./slide-viewer.module.css";
export type WorkspaceSlide = {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
};
export function SlideViewer({
  open,
  slides,
  index,
  onIndexChange,
  onClose,
  label = "Présentation",
}: {
  open: boolean;
  slides: WorkspaceSlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  label?: string;
}) {
  const current = Math.max(0, Math.min(slides.length - 1, index));
  const slide = slides[current];
  useEffect(() => {
    if (!open || !slides.length) return;
    function key(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input,textarea,select,[contenteditable="true"],[role="menu"],[role="listbox"],[role="combobox"],[role="slider"],[role="application"],[role="grid"],[data-radix-popper-content-wrapper]',
        )
      )
        return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        onIndexChange(
          Math.max(0, Math.min(slides.length - 1, current + (event.key === "ArrowRight" ? 1 : -1))),
        );
      }
      if (event.key === "Home") {
        event.preventDefault();
        onIndexChange(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        onIndexChange(slides.length - 1);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, slides.length, current, onIndexChange]);
  return (
    <Dialog.Root
      open={open && !!slide}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.viewer} data-relay-presentation>
          <header className={styles.topbar}>
            <span>{label}</span>
            <div className={styles.counter} aria-live="polite">
              {current + 1} / {slides.length}
            </div>
            <Dialog.Close className="icon-button" aria-label="Quitter la présentation">
              <X size={18} />
            </Dialog.Close>
          </header>
          {slide && (
            <div className={styles.viewport} key={slide.id}>
              <div className={styles.title}>
                <Dialog.Title>{slide.title}</Dialog.Title>
                <Dialog.Description>
                  {slide.description || "Consultez les informations de cette diapositive."}
                </Dialog.Description>
              </div>
              <div className={styles.content}>{slide.content}</div>
            </div>
          )}
          <footer className={styles.footer}>
            <span>← → pour naviguer · Échap pour fermer</span>
            <div className={styles.navigation}>
              <button
                type="button"
                className="button"
                aria-label="Diapositive précédente"
                disabled={current === 0}
                onClick={() => onIndexChange(current - 1)}
              >
                <ChevronLeft size={16} />
                <span>Précédente</span>
              </button>
              <button
                type="button"
                className="button"
                aria-label="Diapositive suivante"
                disabled={current === slides.length - 1}
                onClick={() => onIndexChange(current + 1)}
              >
                <span>Suivante</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
