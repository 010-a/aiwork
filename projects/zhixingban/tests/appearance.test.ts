import { describe, expect, it } from 'vitest';
import { APPEARANCE_STORAGE_KEY, DEFAULT_APPEARANCE, initializeAppearance, normalizeAppearance, parseAppearanceCache, persistAppearance, readAppearance, resolveAppearance, resolveTheme } from '../src/appearance';
import type { Accent, AppearanceStorage, Density, ThemeMode } from '../src/appearance';

function memoryStorage(): AppearanceStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('appearance preference normalization', () => {
  it('starts with a fresh safe default when no valid settings exist', () => {
    for (const value of [undefined, null, true, 'dark', [], 42, {}]) expect(normalizeAppearance(value)).toEqual(DEFAULT_APPEARANCE);
    const first = normalizeAppearance(undefined);
    first.accent = 'rose';
    expect(normalizeAppearance(undefined).accent).toBe('blue');
    expect(DEFAULT_APPEARANCE.accent).toBe('blue');
  });
  it('accepts every supported setting value', () => {
    for (const mode of ['system', 'light', 'dark'] satisfies ThemeMode[]) {
      for (const accent of ['blue', 'purple', 'green', 'rose', 'orange', 'graphite'] satisfies Accent[]) {
        for (const density of ['comfortable', 'compact'] satisfies Density[]) {
          const input = { mode, accent, density, reduceMotion: true };
          expect(normalizeAppearance(input)).toEqual(input);
        }
      }
    }
  });
  it('preserves valid fields while replacing unknown enums and nonboolean flags', () => {
    expect(normalizeAppearance({ mode: 'dark', accent: 'url(javascript:alert(1))', density: 'tiny', reduceMotion: 'false', unexpected: '<script>' })).toEqual({ mode: 'dark', accent: 'blue', density: 'comfortable', reduceMotion: false });
    expect(normalizeAppearance({ mode: 'LIGHT', accent: 'green', density: 'compact', reduceMotion: false })).toEqual({ mode: 'system', accent: 'green', density: 'compact', reduceMotion: false });
  });
  it('ignores inherited settings and handles malformed getters', () => {
    expect(normalizeAppearance(Object.create({ mode: 'dark', accent: 'orange' }))).toEqual(DEFAULT_APPEARANCE);
    const malformed = Object.defineProperty({}, 'mode', { get() { throw new Error('denied'); } });
    expect(() => normalizeAppearance(malformed)).not.toThrow();
    expect(normalizeAppearance(malformed)).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('local appearance persistence', () => {
  it('round-trips whitelisted settings under the dedicated key', () => {
    const storage = memoryStorage();
    const preferences = { mode: 'dark', accent: 'purple', density: 'compact', reduceMotion: true } as const;
    expect(readAppearance(storage)).toEqual({ preferences: { ...DEFAULT_APPEARANCE } });
    expect(persistAppearance(preferences, storage)).toEqual({});
    expect(storage.values.size).toBe(1);
    expect(storage.values.has(APPEARANCE_STORAGE_KEY)).toBe(true);
    expect(readAppearance(storage)).toEqual({ preferences });
  });
  it('sanitizes data before saving so arbitrary fields cannot reach storage or styles', () => {
    const storage = memoryStorage();
    const preferences = { ...DEFAULT_APPEARANCE, accent: 'red; color: transparent', css: '*{display:none}' };
    persistAppearance(preferences as unknown as Parameters<typeof persistAppearance>[0], storage);
    expect(JSON.parse(storage.values.get(APPEARANCE_STORAGE_KEY)!)).toEqual(DEFAULT_APPEARANCE);
  });
  it('falls back safely for broken JSON and partially malformed caches', () => {
    expect(parseAppearanceCache('{broken')).toMatchObject({ preferences: DEFAULT_APPEARANCE, error: expect.any(String) });
    expect(parseAppearanceCache('null')).toEqual({ preferences: { ...DEFAULT_APPEARANCE } });
    expect(parseAppearanceCache('{"mode":"light","accent":"unknown","reduceMotion":true}')).toEqual({ preferences: { ...DEFAULT_APPEARANCE, mode: 'light', reduceMotion: true } });
    expect(parseAppearanceCache(null)).toEqual({ preferences: { ...DEFAULT_APPEARANCE } });
  });
  it('reports denied reads and writes while keeping preferences usable in memory', () => {
    const denied: AppearanceStorage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
    expect(readAppearance(denied)).toMatchObject({ preferences: DEFAULT_APPEARANCE, error: expect.stringContaining('无法读取') });
    const selected = normalizeAppearance({ mode: 'dark', accent: 'green' });
    expect(persistAppearance(selected, denied)).toEqual({ error: expect.stringContaining('当前选择仍然生效') });
    expect(selected).toEqual({ ...DEFAULT_APPEARANCE, mode: 'dark', accent: 'green' });
  });
});

describe('theme and accessibility resolution', () => {
  it('follows system theme only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('honors system reduced motion even when the explicit preference is off', () => {
    expect(resolveAppearance({ ...DEFAULT_APPEARANCE }, { dark: true, reduceMotion: true })).toEqual({ resolvedTheme: 'dark', reduceMotion: true });
    expect(resolveAppearance({ ...DEFAULT_APPEARANCE, mode: 'light', reduceMotion: true }, { dark: true, reduceMotion: false })).toEqual({ resolvedTheme: 'light', reduceMotion: true });
    expect(resolveAppearance({ ...DEFAULT_APPEARANCE }, { dark: false, reduceMotion: false })).toEqual({ resolvedTheme: 'light', reduceMotion: false });
  });
  it('can initialize without DOM or browser storage', () => {
    expect(() => initializeAppearance()).not.toThrow();
    expect(initializeAppearance()).toEqual({ preferences: { ...DEFAULT_APPEARANCE }, resolvedTheme: 'light' });
  });
});
