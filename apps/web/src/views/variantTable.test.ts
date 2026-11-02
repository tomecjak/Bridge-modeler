import { describe, expect, it } from 'vitest';
import type { ComparedVariant } from '../store/variants.ts';
import { comparisonCsv, comparisonRows, formatIndicator } from './variantTable.ts';

const variant = (name: string, indicators: ComparedVariant['indicators']): ComparedVariant => ({
  id: name,
  name,
  active: false,
  model: undefined,
  indicators,
});

describe('variant table', () => {
  it('formats numbers, ranges, spans and ratios in Slovak notation', () => {
    expect(formatIndicator({ unit: 'm2' }, { kind: 'number', value: 877.8 })).toBe('877,8');
    expect(formatIndicator({ unit: 'm2' }, { kind: 'number', value: 924, partial: true })).toBe(
      '924,0 *',
    );
    expect(formatIndicator({ unit: 'angle' }, { kind: 'number', value: Math.PI / 3 })).toBe('60,0');
    expect(formatIndicator({ unit: 'm' }, { kind: 'range', min: 16.5, max: 16.504 })).toBe('16,50');
    expect(formatIndicator({ unit: 'm' }, { kind: 'range', min: 12, max: 13.5 })).toBe(
      '12,00 – 13,50',
    );
    expect(formatIndicator({ unit: 'm' }, { kind: 'spans', decks: [[16, 23, 16], [55]] })).toBe(
      '16,00 + 23,00 + 16,00 | 55,00',
    );
    expect(formatIndicator({ unit: 'ratio' }, { kind: 'ratios', values: [0.6957, 0.7] })).toBe(
      '0,70 / 0,70',
    );
    expect(formatIndicator({ unit: 'eur', decimals: 0 }, { kind: 'number', value: 1228920 })).toBe(
      '1 228 920',
    );
    expect(formatIndicator({ unit: 'm' }, undefined)).toBe('—');
  });

  it('groups rows, labels them and marks the best variant', () => {
    const groups = comparisonRows([
      variant('A', {
        piers: { kind: 'number', value: 2 },
        deckVolume: { kind: 'number', value: 600 },
      }),
      variant('B', {
        piers: { kind: 'number', value: 0 },
        deckVolume: { kind: 'number', value: 650 },
      }),
    ]);
    expect(groups.map((g) => g.title)).toEqual([
      'Dispozícia',
      'Plochy a objemy',
      'Podpery',
      'Kontroly',
      'Cena',
    ]);
    const row = (key: string) => groups.flatMap((g) => g.rows).find((r) => r.def.key === key);
    expect(row('piers')).toMatchObject({ label: 'Piliere', cells: ['2', '0'], best: [1] });
    expect(row('deckVolume')).toMatchObject({ cells: ['600,0', '650,0'], best: [0] });
    expect(row('deckVolume')?.hint).toContain('∫A·dL');
  });

  it('exports CSV for Excel with a BOM, semicolons and decimal commas', () => {
    const csv = comparisonCsv([
      variant('A; 3 polia', { deckVolume: { kind: 'number', value: 1234.56 } }),
      variant('B', {
        deckVolume: { kind: 'number', value: 650 },
        cost: { kind: 'number', value: 1e6 },
      }),
    ]);
    expect(csv.startsWith(`${String.fromCharCode(0xfeff)}Ukazovateľ;"A; 3 polia";B\r\n`)).toBe(
      true,
    );
    expect(csv).toContain('\r\nObjem NK [m³];1234,6;650,0\r\n');
    expect(csv).toContain('\r\nOrientačná cena [€] (zástupné ceny);—;1000000\r\n');
    expect(csv).toContain('\r\nDispozícia\r\n');
  });

  it('treats values equal in the shown precision as a tie', () => {
    const [layout, areas] = comparisonRows([
      variant('A', { bridgeArea: { kind: 'number', value: 866.1004 } }),
      variant('B', { bridgeArea: { kind: 'number', value: 866.0996 } }),
    ]);
    expect(layout?.rows.length).toBeGreaterThan(0);
    expect(areas?.rows.find((r) => r.def.key === 'bridgeArea')?.best).toEqual([]);
  });
});
