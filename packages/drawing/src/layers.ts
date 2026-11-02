/** Hladina výkresu. Firemný štandard zatiaľ nie je, názvy a farby sú predpoklad (ADR 0012, PLAN.md). */
export interface Layer {
  /** názov hladiny v DXF a id skupiny v SVG */
  name: string;
  /** farba AutoCAD Color Index */
  color: number;
  linetype: 'CONTINUOUS' | 'DASHED' | 'CENTER';
}

export const LAYERS = {
  roadAxis: { name: 'OS_CESTY', color: 1, linetype: 'CENTER' },
  bridgeAxis: { name: 'OS_MOSTA', color: 6, linetype: 'CENTER' },
  supportAxis: { name: 'OS_PODPERY', color: 1, linetype: 'CENTER' },
  stationing: { name: 'STANICENIE', color: 7, linetype: 'CONTINUOUS' },
  deck: { name: 'NK', color: 4, linetype: 'CONTINUOUS' },
  deckVoid: { name: 'NK_DUTINY', color: 4, linetype: 'CONTINUOUS' },
  /** rímsy (ADR 0023) */
  edgeBeam: { name: 'RIMSY', color: 8, linetype: 'CONTINUOUS' },
  support: { name: 'PODPERY', color: 3, linetype: 'CONTINUOUS' },
  footing: { name: 'ZAKLADY', color: 8, linetype: 'CONTINUOUS' },
  bearing: { name: 'LOZISKA', color: 5, linetype: 'CONTINUOUS' },
  terrain: { name: 'TEREN', color: 30, linetype: 'CONTINUOUS' },
  grade: { name: 'NIVELETA', color: 1, linetype: 'CONTINUOUS' },
  label: { name: 'POPIS', color: 7, linetype: 'CONTINUOUS' },
  planLine: { name: 'CIARY', color: 2, linetype: 'DASHED' },
  /** os prekážky a zvislica kríženia v profile (ADR 0020) */
  obstacle: { name: 'PREKAZKY', color: 210, linetype: 'DASHED' },
  /** voľný (priechodný) prierez prekážky */
  clearance: { name: 'VOLNY_PRIEREZ', color: 140, linetype: 'CONTINUOUS' },
  /** meračka: čiary a značky bodov (ADR 0021) */
  survey: { name: 'MERACKA', color: 8, linetype: 'CONTINUOUS' },
  /** výšky bodov meračky */
  surveyText: { name: 'MERACKA_VYSKY', color: 8, linetype: 'CONTINUOUS' },
} as const satisfies Record<string, Layer>;

export type LayerId = keyof typeof LAYERS;

/** Poradie hladín vo výstupe (spodné sa kreslia prvé). */
export const LAYER_ORDER = Object.keys(LAYERS) as LayerId[];

/** Farby ACI použitých hladín pre SVG (7 = čierna na bielom papieri). */
export const ACI_RGB: Record<number, string> = {
  1: '#ff0000',
  2: '#b09000',
  3: '#00a000',
  4: '#00a0c0',
  5: '#0000ff',
  6: '#c000c0',
  7: '#000000',
  8: '#808080',
  30: '#ff7f00',
  140: '#0080c0',
  210: '#c00080',
};

/** Vzor čiar v mm na papieri (čiara, medzera, …). */
export const LINETYPE_PATTERN: Record<Layer['linetype'], readonly number[]> = {
  CONTINUOUS: [],
  DASHED: [6, 3],
  CENTER: [12, 3, 3, 3],
};
