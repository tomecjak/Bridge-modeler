import type { ReactNode } from 'react';

/**
 * Vlastné ikony rozhrania (ADR 0016): obrys 24 × 24, ťah 1,5 px, farba podľa textu. Ikony mostných prvkov
 * (NK, pilier, oblasť) v bežných knižniciach nie sú, preto sú všetky kreslené rovnakým štýlom tu.
 */
const PATHS = {
  save: (
    <>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v5h7V3M8 21v-7h8v7" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  newFile: (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M15 2v5h5M13 11v6M10 14h6" />
    </>
  ),
  open: <path d="M3 6h6l2 2h10v12H3z" />,
  export: <path d="M12 15V3M8 7l4-4 4 4M4 15v6h16v-6" />,
  deck: <path d="M2 7h20v2h-3l-2 8H7L5 9H2z" />,
  pier: (
    <>
      <path d="M6 3h12v3H6z" />
      <path d="M10 6v12M14 6v12M5 18h14v3H5z" />
    </>
  ),
  area: <path d="M4 5v14M20 5v14M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3" />,
  line: (
    <>
      <path d="m4 18 5-8 5 4 6-9" />
      <circle cx="4" cy="18" r="1.5" />
      <circle cx="9" cy="10" r="1.5" />
      <circle cx="14" cy="14" r="1.5" />
      <circle cx="20" cy="5" r="1.5" />
    </>
  ),
  landxml: (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M15 2v5h5M8.5 18c2.5-6 4.5 1 8-5" />
    </>
  ),
  terrainFile: (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M15 2v5h5M8 18l3-4 2 2 2-3 2 5" />
    </>
  ),
  dmr: <path d="m2 20 6-9 4 5 3-4 7 8M17 2v7M14 6l3 3 3-3" />,
  library: <path d="M4 4h4v16H4zM10 4h4v16h-4zM15.5 5.5l3.5-1 3 14.5-3.5 1z" />,
  twinDeck: <path d="M2 8h9M3.5 8l1.5 7h3l1.5-7M13 8h9M14.5 8l1.5 7h3l1.5-7" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  rename: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  duplicate: (
    <>
      <path d="M8 8h12v12H8z" />
      <path d="M16 8V4H4v12h4" />
    </>
  ),
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  wholeAxis: <path d="M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3M9 10v4M15 10v4" />,
  goTo: (
    <>
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  cut: (
    <>
      <path d="M4 8h12l4 4v6H8l-4-4z" />
      <path d="M12 3v18" strokeDasharray="2 2" />
    </>
  ),
  terrain: <path d="M2 19h20M3 19l6-9 4 5 3-4 5 8" />,
  basemap: <path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5" />,
  cube: <path d="m12 2 9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12 3 7" />,
  plan: <path d="M3 19c6 0 7-13 18-13M6 17l1.5 1.5M10 13l1.5 1.5M14 9l1.5 1.5" />,
  section: <path d="M2 6h20v2h-3l-1 10H6L5 8H2zM8 9h8l-1 6H9z" />,
  measure: <path d="M3 16 16 3l5 5L8 21zM7 12l2 2M10 9l2 2M13 6l2 2" />,
  profile: <path d="M2 20h20M2 13c4-3 8-4 11-3s6 0 9-3M6 20v-8.5M12 20v-9.8M18 20v-11" />,
  parameters: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  axis: <path d="M2 12h4M9 12h2M14 12h4M21 12h1" />,
  abutment: (
    <>
      <path d="M3 5h9v4h-3v9H3z" />
      <path d="M12 9h9M2 21h12" />
    </>
  ),
  folder: <path d="M3 6h6l2 2h10v11H3z" />,
  pointer: <path d="m5 3 13 8-6 1.5L9 19z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
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
      {PATHS[name]}
    </svg>
  );
}
