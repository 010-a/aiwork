import { useCallback, useEffect, useRef, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type Accent =
  "blue" | "purple" | "green" | "rose" | "orange" | "graphite";
export type Density = "comfortable" | "compact";
export type FontSize = "small" | "standard" | "large" | "extra-large";
export type ResolvedTheme = "light" | "dark";

export interface AppearancePreferences {
  mode: ThemeMode;
  accent: Accent;
  density: Density;
  fontSize: FontSize;
  reduceMotion: boolean;
}

export const APPEARANCE_STORAGE_KEY = "zhixingban-appearance-v1";
export const DEFAULT_APPEARANCE: Readonly<AppearancePreferences> =
  Object.freeze({
    mode: "system",
    accent: "blue",
    density: "comfortable",
    fontSize: "standard",
    reduceMotion: false,
  });

export interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AppearanceReadResult {
  preferences: AppearancePreferences;
  error?: string;
}

export interface SystemAppearance {
  dark: boolean;
  reduceMotion: boolean;
}

/** Only these literal values reach the DOM; cached text can never become CSS or HTML. */
export function normalizeAppearance(value: unknown): AppearancePreferences {
  const result: AppearancePreferences = { ...DEFAULT_APPEARANCE };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  try {
    const record = value as Record<string, unknown>;
    const own = (key: string): unknown =>
      Object.prototype.hasOwnProperty.call(record, key)
        ? record[key]
        : undefined;
    const mode = own("mode"),
      accent = own("accent"),
      density = own("density"),
      fontSize = own("fontSize"),
      reduceMotion = own("reduceMotion");
    if (mode === "system" || mode === "light" || mode === "dark")
      result.mode = mode;
    if (
      accent === "blue" ||
      accent === "purple" ||
      accent === "green" ||
      accent === "rose" ||
      accent === "orange" ||
      accent === "graphite"
    )
      result.accent = accent;
    if (density === "comfortable" || density === "compact")
      result.density = density;
    if (
      fontSize === "small" ||
      fontSize === "standard" ||
      fontSize === "large" ||
      fontSize === "extra-large"
    )
      result.fontSize = fontSize;
    if (typeof reduceMotion === "boolean") result.reduceMotion = reduceMotion;
  } catch {
    // Malformed objects/getters should be as harmless as a malformed JSON cache.
    return { ...DEFAULT_APPEARANCE };
  }
  return result;
}

export function parseAppearanceCache(
  source: string | null,
): AppearanceReadResult {
  if (source === null) return { preferences: { ...DEFAULT_APPEARANCE } };
  try {
    return { preferences: normalizeAppearance(JSON.parse(source)) };
  } catch {
    return {
      preferences: { ...DEFAULT_APPEARANCE },
      error: "外观设置缓存无法读取，已使用默认外观。重新选择即可保存。",
    };
  }
}

function browserStorage(): AppearanceStorage | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

export function readAppearance(
  storage?: Pick<AppearanceStorage, "getItem">,
): AppearanceReadResult {
  try {
    const target = storage ?? browserStorage();
    return parseAppearanceCache(
      target ? target.getItem(APPEARANCE_STORAGE_KEY) : null,
    );
  } catch {
    return {
      preferences: { ...DEFAULT_APPEARANCE },
      error: "无法读取本机外观设置；当前选择仍可在本次使用中生效。",
    };
  }
}

export function persistAppearance(
  preferences: AppearancePreferences,
  storage?: Pick<AppearanceStorage, "setItem">,
): { error?: string } {
  try {
    const target = storage ?? browserStorage();
    if (target)
      target.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify(normalizeAppearance(preferences)),
      );
    return {};
  } catch {
    return { error: "外观设置暂未保存到本机，当前选择仍然生效。" };
  }
}

export function resolveTheme(
  mode: ThemeMode,
  systemDark: boolean,
): ResolvedTheme {
  return mode === "dark" || (mode === "system" && systemDark)
    ? "dark"
    : "light";
}

export function readSystemAppearance(): SystemAppearance {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return { dark: false, reduceMotion: false };
  try {
    return {
      dark: window.matchMedia("(prefers-color-scheme: dark)").matches,
      reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches,
    };
  } catch {
    return { dark: false, reduceMotion: false };
  }
}

export function resolveAppearance(
  preferences: AppearancePreferences,
  system: SystemAppearance,
): { resolvedTheme: ResolvedTheme; reduceMotion: boolean } {
  return {
    resolvedTheme: resolveTheme(preferences.mode, system.dark),
    reduceMotion: preferences.reduceMotion || system.reduceMotion,
  };
}

function applyAppearance(
  preferences: AppearancePreferences,
  system: SystemAppearance,
): ResolvedTheme {
  const { resolvedTheme, reduceMotion } = resolveAppearance(
    preferences,
    system,
  );
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.accent = preferences.accent;
    root.dataset.density = preferences.density;
    root.dataset.fontSize = preferences.fontSize;
    root.dataset.reduceMotion = String(reduceMotion);
  }
  return resolvedTheme;
}

/** Optional pre-render boot entry; index.html uses the same defaults and whitelist to avoid a flash. */
export function initializeAppearance(): AppearanceReadResult & {
  resolvedTheme: ResolvedTheme;
} {
  const result = readAppearance();
  return {
    ...result,
    resolvedTheme: applyAppearance(result.preferences, readSystemAppearance()),
  };
}

export function useAppearance(): {
  preferences: AppearancePreferences;
  resolvedTheme: ResolvedTheme;
  updatePreferences: (patch: Partial<AppearancePreferences>) => void;
  error: string;
} {
  const [initial] = useState(readAppearance);
  const [preferences, setPreferences] = useState(initial.preferences);
  const preferencesRef = useRef(preferences);
  const [system, setSystem] = useState(readSystemAppearance);
  const [error, setError] = useState(initial.error ?? "");
  const resolvedTheme = resolveTheme(preferences.mode, system.dark);

  const updatePreferences = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      const next = normalizeAppearance({ ...preferencesRef.current, ...patch });
      preferencesRef.current = next;
      setPreferences(next);
      setError(persistAppearance(next).error ?? "");
    },
    [],
  );

  useEffect(() => {
    applyAppearance(preferences, system);
  }, [preferences, system]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    let dark: MediaQueryList, motion: MediaQueryList;
    try {
      dark = window.matchMedia("(prefers-color-scheme: dark)");
      motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    } catch {
      return;
    }
    const updateSystem = () =>
      setSystem({ dark: dark.matches, reduceMotion: motion.matches });
    const subscribe = (query: MediaQueryList) => {
      if (typeof query.addEventListener === "function")
        query.addEventListener("change", updateSystem);
      else query.addListener(updateSystem);
    };
    const unsubscribe = (query: MediaQueryList) => {
      if (typeof query.removeEventListener === "function")
        query.removeEventListener("change", updateSystem);
      else query.removeListener(updateSystem);
    };
    updateSystem();
    subscribe(dark);
    subscribe(motion);
    return () => {
      unsubscribe(dark);
      unsubscribe(motion);
    };
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea && event.storageArea !== window.localStorage)
          return;
      } catch {
        return;
      }
      const result = parseAppearanceCache(
        event.key === null ? null : event.newValue,
      );
      preferencesRef.current = result.preferences;
      setPreferences(result.preferences);
      setError(result.error ?? "");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return { preferences, resolvedTheme, updatePreferences, error };
}
