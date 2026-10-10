"use client";
import { useState } from "react";
import { Sun, Moon, Monitor, Check, Sparkles, Rows3, LayoutList } from "lucide-react";
import { useAppearance } from "../providers/appearance-provider";
import { accentColors, type Appearance } from "@/lib/domain/appearance";
import styles from "./settings.module.css";

const themes = [
  { id: "light", label: "Clair", icon: Sun },
  { id: "dark", label: "Sombre", icon: Moon },
  { id: "system", label: "Système", icon: Monitor },
] as const;
function ThemePreview({ theme }: { theme: string }) {
  return (
    <div className={styles.themePreview} data-preview={theme} aria-hidden="true">
      <div className={styles.previewSidebar}>
        <span className={styles.previewBrand} />
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className={styles.previewMain}>
        <div className={styles.previewTop}>
          <i />
          <i />
        </div>
        <div className={styles.previewToolbar}>
          <i />
          <i />
        </div>
        <div className={styles.previewTable}>
          {Array.from({ length: 20 }, (_, i) => (
            <i key={i} data-highlight={i === 5 || undefined} />
          ))}
        </div>
      </div>
    </div>
  );
}
export function SettingsAppearance() {
  const { appearance, resolvedTheme, update } = useAppearance();
  const [saved, setSaved] = useState(true);
  function choose(values: Partial<Appearance>) {
    setSaved(update(values));
  }
  return (
    <>
      <section className={styles.settingSection}>
        <div className={styles.sectionCopy}>
          <h2>Thème</h2>
          <p>Choisissez l’ambiance dans laquelle vous aimez travailler.</p>
        </div>
        <div className={styles.themeGrid} role="group" aria-label="Thème de l’interface">
          {themes.map(({ id, label, icon: Icon }) => (
            <label className={styles.themeChoice} key={id} data-selected={appearance.theme === id}>
              <input
                className="sr-only"
                type="radio"
                name="relay-theme"
                value={id}
                checked={appearance.theme === id}
                onChange={() => choose({ theme: id })}
              />
              <ThemePreview theme={id} />
              <span className={styles.themeName}>
                <Icon size={16} />
                {label}
              </span>
              {appearance.theme === id && (
                <span className={styles.themeCheck}>
                  <Check size={12} />
                </span>
              )}
            </label>
          ))}
        </div>
        {appearance.theme === "system" && (
          <p className={styles.systemHint}>
            Suit votre appareil · thème {resolvedTheme === "dark" ? "sombre" : "clair"}{" "}
            actuellement.
          </p>
        )}
      </section>
      <section className={styles.settingRow}>
        <div className={styles.sectionCopy}>
          <h2>Couleur d’accent</h2>
          <p>Une touche de couleur, partout où elle compte.</p>
        </div>
        <div className={styles.accentPalette} role="group" aria-label="Couleur d’accent">
          {accentColors.map((color) => (
            <button
              key={color.id}
              type="button"
              className={styles.accentChoice}
              style={{ "--swatch": color.value } as React.CSSProperties}
              aria-label={color.label}
              aria-pressed={appearance.accent === color.id}
              title={color.label}
              onClick={() => choose({ accent: color.id })}
            >
              <span />
              {appearance.accent === color.id && <Check size={12} />}
            </button>
          ))}
        </div>
      </section>
      <section className={styles.settingRow}>
        <div className={styles.sectionCopy}>
          <h2>Densité d’affichage</h2>
          <p>Plus d’espace, ou plus d’informations en un regard.</p>
        </div>
        <div className={styles.densityPicker} role="group" aria-label="Densité de l’interface">
          <button
            type="button"
            aria-pressed={appearance.density === "comfortable"}
            onClick={() => choose({ density: "comfortable" })}
          >
            <Rows3 size={15} />
            Confortable
          </button>
          <button
            type="button"
            aria-pressed={appearance.density === "compact"}
            onClick={() => choose({ density: "compact" })}
          >
            <LayoutList size={15} />
            Compacte
          </button>
        </div>
      </section>
      <div className={styles.appearanceNote}>
        <div className={styles.noteIcon}>
          <Sparkles size={18} />
        </div>
        <div>
          <strong>Votre Zyliad, à votre image.</strong>
          <p>Ces préférences sont personnelles et ne changent pas l’interface de votre équipe.</p>
        </div>
      </div>
      <p className={styles.savedNote} role="status">
        <Check size={13} />
        {saved
          ? "Enregistré automatiquement dans ce navigateur."
          : "Appliqué pour cette session. Le navigateur a bloqué l’enregistrement."}
      </p>
    </>
  );
}
