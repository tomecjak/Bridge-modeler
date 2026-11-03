/**
 * Farebná téma rozhrania (ADR 0025): podľa systému, svetlá alebo tmavá.
 * Voľba je nastavenie prehliadača (localStorage), nie súčasť modelu projektu.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bridge-modeler.theme';

/** Udalosť na `window` po zmene témy (napr. 3D scéna si prečíta nové farby). */
export const THEME_CHANGE_EVENT = 'bridge-theme-change';

const ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Ďalšia voľba pri prepínaní tlačidlom: systém → svetlá → tmavá → systém. */
export function nextTheme(current: ThemePreference): ThemePreference {
  return ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system';
}

/** Uložená hodnota → voľba; neznáma alebo chýbajúca hodnota je „podľa systému“. */
export function parseTheme(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function readStoredTheme(): ThemePreference {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system'; // úložisko nedostupné (súkromné okno, zakázané)
  }
}

/** Nastaví tému na `<html data-theme>` a uloží ju; „podľa systému“ atribút odstráni. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
  try {
    if (preference === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // voľba platí aspoň do zatvorenia stránky
  }
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}
