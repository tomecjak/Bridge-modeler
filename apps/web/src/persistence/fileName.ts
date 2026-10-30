/** Názov súboru projektu z názvu projektu (bez znakov, ktoré systémy súborov nepovoľujú). */
export function projectFileName(name: string): string {
  const safe = name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return `${safe || 'projekt'}.bridge.json`;
}
