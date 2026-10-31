/** Názov bez znakov, ktoré systémy súborov nepovoľujú (diakritika ostáva). */
function safeName(name: string, fallback: string): string {
  const safe = name
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return safe || fallback;
}

/** Názov súboru projektu z názvu projektu. */
export function projectFileName(name: string): string {
  return `${safeName(name, 'projekt')}.bridge.json`;
}

/** Názov exportovaného výkresu: `<projekt> – <pohľad>.<prípona>`. */
export function drawingFileName(project: string, view: string, extension: 'dxf' | 'svg'): string {
  return `${safeName(project, 'projekt')} – ${safeName(view, 'výkres')}.${extension}`;
}
