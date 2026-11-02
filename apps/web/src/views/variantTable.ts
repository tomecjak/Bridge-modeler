import { formatNumber } from '../format/number.ts';
import { sk } from '../i18n/sk.ts';
import {
  bestVariants,
  type ComparedVariant,
  INDICATORS,
  type IndicatorDef,
  type IndicatorGroup,
  type IndicatorUnit,
  type IndicatorValue,
} from '../store/variants.ts';

/** Desatinné miesta podľa jednotky (ukazovateľ ich môže zmeniť). */
const DECIMALS: Record<IndicatorUnit, number> = {
  count: 0,
  m: 2,
  m2: 1,
  m3: 1,
  angle: 1,
  ratio: 2,
  eur: 0,
};

type NumberFormat = (value: number, decimals: number) => string;

/** Číslo pre CSV: bez oddeľovača tisícov, desatinná čiarka (slovenský Excel). */
const csvNumber: NumberFormat = (value, decimals) => value.toFixed(decimals).replace('.', ',');

const decimalsOf = (def: Pick<IndicatorDef, 'unit' | 'decimals'>) =>
  def.decimals ?? DECIMALS[def.unit];

/** Číslo v zobrazovanej jednotke (uhly z rad na °). */
const shown = (def: Pick<IndicatorDef, 'unit'>, v: number) =>
  def.unit === 'angle' ? (v * 180) / Math.PI : v;

/** Hodnota ukazovateľa ako text: uhly v °, rozsah „min – max“, rozpätia po NK, * = hodnota len z časti. */
export function formatIndicator(
  def: Pick<IndicatorDef, 'unit' | 'decimals'>,
  value: IndicatorValue | undefined,
  format: NumberFormat = formatNumber,
): string {
  if (!value) return '—';
  const n = (v: number) => format(shown(def, v), decimalsOf(def));
  switch (value.kind) {
    case 'number':
      return value.partial ? `${n(value.value)} *` : n(value.value);
    case 'range': {
      const [min, max] = [n(value.min), n(value.max)];
      return min === max ? min : `${min} – ${max}`;
    }
    case 'spans':
      return value.decks.map((d) => (d.length > 0 ? d.map(n).join(' + ') : '—')).join(' | ');
    case 'ratios':
      return value.values.map(n).join(' / ');
  }
}

export interface ComparisonRow {
  def: IndicatorDef;
  label: string;
  hint: string;
  /** hodnoty po variantoch */
  cells: string[];
  /** indexy variantov s najlepšou hodnotou */
  best: number[];
}

/** Riadky porovnania po skupinách (ADR 0024), v poradí `INDICATORS`; prázdne skupiny vynechá. */
export function comparisonRows(
  variants: readonly ComparedVariant[],
  format: NumberFormat = formatNumber,
): { group: IndicatorGroup; title: string; rows: ComparisonRow[] }[] {
  const groups = [...new Set(INDICATORS.map((d) => d.group))];
  return groups.map((group) => ({
    group,
    title: sk.variants.groups[group],
    rows: INDICATORS.filter((d) => d.group === group).map((def: IndicatorDef) => {
      const key = def.key as (typeof INDICATORS)[number]['key'];
      const values = variants.map((v) => v.indicators[key]);
      return {
        def,
        label: sk.variants.indicators[key].label,
        hint: sk.variants.indicators[key].hint,
        cells: values.map((v) => formatIndicator(def, v, format)),
        // lepšia hodnota v zobrazenej presnosti: rozdiel vzorkovania pod poslednou cifrou nie je rozdiel variantov
        best: bestVariants(
          values.map((v) =>
            v?.kind === 'number'
              ? { ...v, value: Number(shown(def, v.value).toFixed(decimalsOf(def))) }
              : v,
          ),
          def.better,
        ),
      };
    }),
  }));
}

/** Značka poradia bajtov UTF-8, podľa ktorej Excel spozná kódovanie. */
const BOM = String.fromCharCode(0xfeff);

/** Pole CSV v úvodzovkách, ak obsahuje oddeľovač, úvodzovky alebo koniec riadku. */
const field = (text: string) => (/[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/**
 * Porovnanie variantov ako CSV pre slovenský Excel (ADR 0024): UTF-8 s BOM, oddeľovač `;`, desatinná čiarka; riadok
 * skupiny, potom ukazovatele (pri cene štítok zástupných cien).
 */
export function comparisonCsv(variants: readonly ComparedVariant[]): string {
  const lines = [[sk.variants.indicator, ...variants.map((v) => v.name)]];
  for (const g of comparisonRows(variants, csvNumber)) {
    lines.push([g.title]);
    for (const r of g.rows) {
      const label =
        r.def.key === 'cost' ? `${r.label} (${sk.variants.placeholderPrices})` : r.label;
      lines.push([label, ...r.cells]);
    }
  }
  return `${BOM}${lines.map((l) => l.map(field).join(';')).join('\r\n')}\r\n`;
}
