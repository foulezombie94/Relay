"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  accentColors,
  appearanceKey,
  parseAppearance,
  type Appearance,
} from "@/lib/domain/appearance";

const eventName = "relay:appearance";
const memory = new Map<string, string>();
const AppearanceContext = createContext<{
  appearance: Appearance;
  resolvedTheme: "light" | "dark";
  update: (values: Partial<Appearance>) => boolean;
} | null>(null);
function read(key: string) {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function systemSubscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
function systemSnapshot() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
export function AppearanceProvider({ user, children }: { user: string; children: ReactNode }) {
  const key = appearanceKey(user);
  const subscribe = useMemo(
    () => (listener: () => void) => {
      const local = () => listener();
      const crossTab = (event: StorageEvent) => {
        if (event.key === key || event.key === null) {
          memory.delete(key);
          listener();
        }
      };
      window.addEventListener(eventName, local);
      window.addEventListener("storage", crossTab);
      return () => {
        window.removeEventListener(eventName, local);
        window.removeEventListener("storage", crossTab);
      };
    },
    [key],
  );
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => "",
  );
  const systemDark = useSyncExternalStore(systemSubscribe, systemSnapshot, () => false);
  const appearance = useMemo(() => parseAppearance(raw), [raw]);
  const resolvedTheme =
    appearance.theme === "system" ? (systemDark ? "dark" : "light") : appearance.theme;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.relayTheme = resolvedTheme;
    root.dataset.relayDensity = appearance.density;
    root.style.setProperty(
      "--relay-accent",
      accentColors.find((c) => c.id === appearance.accent)!.value,
    );
    return () => {
      delete root.dataset.relayTheme;
      delete root.dataset.relayDensity;
      root.style.removeProperty("--relay-accent");
    };
  }, [resolvedTheme, appearance.accent, appearance.density]);
  function update(values: Partial<Appearance>) {
    const next = JSON.stringify(parseAppearance(JSON.stringify({ ...appearance, ...values })));
    memory.set(key, next);
    let persisted = true;
    try {
      localStorage.setItem(key, next);
    } catch {
      persisted = false;
    }
    window.dispatchEvent(new Event(eventName));
    return persisted;
  }
  return (
    <AppearanceContext.Provider value={{ appearance, resolvedTheme, update }}>
      {children}
    </AppearanceContext.Provider>
  );
}
export function useAppearance() {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("Appearance provider missing");
  return value;
}
