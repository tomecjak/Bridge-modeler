/**
 * Vlastné ikony rozhrania (ADR 0016, štýl podľa ADR 0025): mriežka 24 × 24, kresba v poli 3–21, ťah 1,5 px,
 * zaoblené konce, bez výplní, farba podľa textu.
 *
 * Mostné prvky sú dvojtónové: samotný prvok plnou farbou (`d`), okolie — NK, zem, podpera — slabšie (`context`),
 * aby bolo hneď vidno, ktorú časť mosta ikona označuje.
 */
interface IconPaths {
  d: string;
  /** okolie prvku kreslené na {@link CONTEXT_OPACITY} */
  context?: string;
}

const CONTEXT_OPACITY = 0.38;

/** pilier: NK nad ním a zem pod ním */
const PIER_CONTEXT = 'M2 4h20M2 21h20';

const ICONS = {
  // --- projekt a úpravy ---
  newFile: { d: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6' },
  open: { d: 'M3 7V5h6l2 2h10v12H3zM3 11h18' },
  save: { d: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6' },
  import: { d: 'M12 3v12M8 11l4 4 4-4M4 15v5h16v-5' },
  export: { d: 'M12 15V3M8 7l4-4 4 4M4 15v5h16v-5' },
  undo: { d: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3' },
  redo: { d: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3' },
  parameters: { d: 'M4 7h16M4 12h16M4 17h16M9 5v4M15 10v4M7 15v4' },
  /** priebeh parametra po staničení */
  stationFunction: { d: 'M3 20h18M3 16h5c2 0 3-8 4-8s2 8 4 8h5' },
  expression: { d: 'M10 4c-2 0-3 1-3.5 4L5 20M3 10h6M13 10l6 8M19 10l-6 8' },
  /** kontroly: podložka so zaškrtnutím */
  checks: { d: 'M9 3h6v3H9zM8 4.5H5V21h14V4.5h-3M8.5 13.5l2.5 2.5 4.5-5' },
  library: { d: 'M4 4h4v16H4zM10 4h4v16h-4zM15.5 5.5l3.5-1 3 14.5-3.5 1z' },
  duplicate: { d: 'M8 8h12v12H8zM16 8V4H4v12h4' },
  rename: { d: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4' },
  trash: { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6' },
  info: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7.5v.5' },
  ok: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M8 12l3 3 5-6' },
  warning: { d: 'M12 4l9 16H3zM12 10v4M12 17v.5' },
  error: { d: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9 9l6 6M15 9l-6 6' },
  folder: { d: 'M3 7V5h6l2 2h10v12H3z' },
  /** otvoriť v samostatnom okne */
  popOut: { d: 'M14 4h6v6M20 4l-8 8M18 14v6H4V6h6' },
  close: { d: 'M6 6l12 12M18 6 6 18' },
  chevronDown: { d: 'm6 9 6 6 6-6' },
  chevronRight: { d: 'm9 6 6 6-6 6' },
  themeSystem: { d: 'M3 4h18v12H3zM8 20h8M12 16v4' },
  themeLight: {
    d: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  },
  themeDark: { d: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z' },

  // --- most (dvojtónové) ---
  deck: { d: 'M2 8h20v4H2z', context: 'M6 12v9M18 12v9M2 21h20' },
  twinDeck: {
    d: 'M2 8h9v2.5H8.5l-.8 5.5H5.3l-.8-5.5H2zM13 8h9v2.5h-2.5l-.8 5.5h-2.4l-.8-5.5H13z',
    context: 'M12 4v16',
  },
  /** rímsa: ležiace L s nosom nadol na vonkajšej strane */
  edgeBeam: { d: 'M4 7h16v5H9v6H4z' },
  section: { d: 'M3 7h18v3h-5l-1 7H9l-1-7H3z', context: 'M12 3v18' },
  haunch: { d: 'M2 10h5c2.5 0 3.5 4 5 4s2.5-4 5-4h5', context: 'M2 6h20M12 14v7' },
  bearingLine: { d: 'M12 3v3M12 9v2M12 14v2M12 19v2', context: 'M2 6h20v12H2z' },
  spans: {
    d: 'M3 15h8M13 15h8M5 13l-2 2 2 2M9 13l2 2-2 2M15 13l-2 2 2 2M19 13l2 2-2 2',
    context: 'M2 6h20v3H2zM2 9v12M12 9v12M22 9v12',
  },
  bearing: { d: 'M7 9.5h10v5H7zM7 12h10', context: 'M3 4h18v3H3zM5 17h14v3H5z' },
  pier: { d: 'M5 7h14v3H5zM8.5 10v11M15.5 10v11', context: PIER_CONTEXT },
  wallPier: { d: 'M5 7h14v3H5zM8 10h8v11H8z', context: PIER_CONTEXT },
  singleColumn: { d: 'M6 7h12v3H6zM12 10v11', context: PIER_CONTEXT },
  abutment: { d: 'M3 4h4v5h4v12H3z', context: 'M7 6h15v3H7zM2 21h20' },
  foundation: { d: 'M4 13h16v4H4zM7 17v4M12 17v4M17 17v4', context: 'M9 3v10M15 3v10' },
  /** šikmosť: uhol */
  skew: { d: 'M4 20h16M4 20 14 6M10 20a6 6 0 0 0-2.5-4.9' },

  // --- osi a podklady ---
  /** os cesty: oblúk so značkami staničenia */
  axis: { d: 'M3 18c6 0 8-11 18-11M7 15l1.5 1.5M11 10.5l1.5 1.5M15 8l1.5 1.5' },
  bridgeAxis: { d: 'M3 12h3M9 12h2M14 12h2M19 12h2M5 8v8M19 8v8' },
  profile: { d: 'M3 20h18M3 13c5-4 11-4 18-2M7 20v-8M12 20v-9M17 20v-9' },
  stationEquation: { d: 'M3 12h7M14 12h7M10 8v8M14 8v8' },
  area: { d: 'M4 4v16M20 4v16M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3' },
  terrain: { d: 'M3 19h18M3 19l5-8 4 5 3-4 6 7' },
  dmr: { d: 'M3 20l5-8 4 5 3-4 6 7M17 3v6M14 6l3 3 3-3' },
  survey: { d: 'M12 3a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 7v5M12 12l-5 9M12 12l5 9M12 12v9' },
  obstacle: { d: 'M3 20h18M7 20l3-13h4l3 13M8.5 13.5h7' },
  clearance: { d: 'M5 20V11a7 7 0 0 1 14 0v9M3 20h18M12 9v7M10 11l2-2 2 2' },
  line: { d: 'M4 18l5-8 5 4 6-9M4 16.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3' },
  landxml: { d: 'M6 3h8l4 4v14H6zM14 3v4h4M9 17c2-5 4 0 6-4' },
  terrainFile: { d: 'M6 3h8l4 4v14H6zM14 3v4h4M8.5 17l2.5-3 2 2 2.5-3' },
  basemap: { d: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14' },

  // --- pohľady a nástroje ---
  cube: { d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5' },
  /** 2D výkresy: pôdorys hore, pozdĺžny a priečny rez dole */
  view2d: { d: 'M4 4h16v7H4zM4 13h10v7H4zM16 13h4v7h-4z' },
  plan: { d: 'M3 18c6 0 8-11 18-11M7 15l1.5 1.5M11 10.5l1.5 1.5M15 8l1.5 1.5' },
  cut: { d: 'M4 8h11l5 4v6H9l-5-4zM12 3v18' },
  fit: { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
  wholeAxis: { d: 'M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3M9 10v4M15 10v4' },
  goTo: { d: 'M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14M12 2v3M12 19v3M2 12h3M19 12h3M12 11v2' },
  measure: { d: 'M4 17 17 4l3 3L7 20zM8 13l2 2M11 10l2 2M14 7l2 2' },
  dimensions: { d: 'M4 7v10M20 7v10M4 12h16M7 10l-3 2 3 2M17 10l3 2-3 2' },
  exaggeration: { d: 'M12 3v18M9 6l3-3 3 3M9 18l3 3 3-3M4 12h4M16 12h4' },
  pointer: { d: 'M6 3l12 8-5.5 1.5L10 18z' },
  addPoint: { d: 'M7 15a2 2 0 1 0 0 4a2 2 0 1 0 0-4M9 15l7-7M17 3v6M14 6h6' },
  loop: { d: 'M5 6l8-2 6 5-3 10H6z' },
  layers: { d: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5' },
} satisfies Record<string, IconPaths>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  const icon: IconPaths = ICONS[name];
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon.context && <path d={icon.context} opacity={CONTEXT_OPACITY} />}
      <path d={icon.d} />
    </svg>
  );
}
