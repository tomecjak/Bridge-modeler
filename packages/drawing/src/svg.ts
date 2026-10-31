import { ACI_RGB, LAYER_ORDER, LAYERS, LINETYPE_PATTERN } from './layers.ts';
import { type Drawing, drawingBounds } from './model.ts';

export interface SvgOptions {
  /** okraj okolo obsahu [mm na papieri] */
  padding?: number;
}

/** Hrúbka čiar [mm na papieri]. */
const STROKE_MM = 0.25;

/**
 * Výkres ako samostatné SVG v mierke výkresu (šírka a výška v mm na papieri, `viewBox` v metroch modelu, os y
 * otočená). Každá hladina je skupina `<g id="NÁZOV">` s farbou a vzorom čiar; texty sa nedeformujú. Deterministické.
 */
export function toSvg(drawing: Drawing, options: SvgOptions = {}): string {
  const scale = drawing.scale;
  const m = (paperMm: number) => (paperMm * scale) / 1000;
  const b = drawingBounds(drawing) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  const pad = m(options.padding ?? 10);
  const x0 = b.minX - pad;
  const y0 = -(b.maxY + pad);
  const w = b.maxX - b.minX + 2 * pad;
  const h = b.maxY - b.minY + 2 * pad;
  const paper = (v: number) => num((v * 1000) / scale);

  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${paper(w)}mm" height="${paper(h)}mm" viewBox="${num(x0)} ${num(y0)} ${num(w)} ${num(h)}">`,
  ];
  for (const id of LAYER_ORDER) {
    const entities = drawing.entities.filter((e) => e.layer === id);
    if (entities.length === 0) continue;
    const layer = LAYERS[id];
    const color = ACI_RGB[layer.color] ?? '#000000';
    const dash = LINETYPE_PATTERN[layer.linetype].map((v) => num(m(v))).join(' ');
    out.push(
      `<g id="${layer.name}" stroke="${color}" fill="none" stroke-width="${num(m(STROKE_MM))}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}>`,
    );
    for (const e of entities) {
      if (e.kind === 'polyline') {
        const pts = e.points.map((p) => `${num(p.x)},${num(-p.y)}`).join(' ');
        out.push(`<${e.closed ? 'polygon' : 'polyline'} points="${pts}"/>`);
      } else {
        const anchor = { left: 'start', center: 'middle', right: 'end' }[e.align];
        const deg = (-e.rotation * 180) / Math.PI;
        const x = num(e.at.x);
        const y = num(-e.at.y);
        const rotate = Math.abs(deg) > 1e-9 ? ` transform="rotate(${num(deg)} ${x} ${y})"` : '';
        out.push(
          `<text x="${x}" y="${y}" font-size="${num(e.height)}" font-family="Arial, sans-serif" text-anchor="${anchor}" fill="${color}" stroke="none"${rotate}>${escapeXml(e.text)}</text>`,
        );
      }
    }
    out.push('</g>');
  }
  out.push('</svg>', '');
  return out.join('\n');
}

/** Číslo na 0,1 mm bez zbytočných núl. */
function num(v: number): string {
  const r = Math.round(v * 1e4) / 1e4;
  return String(r === 0 ? 0 : r);
}

function escapeXml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}
