import type { Vec2 } from '@bridge/geom';

/**
 * Normalizovaná os (ADR 0002): serializovateľná do JSON, nezávislá od LandXML.
 * Súradnice sú absolútne v EPSG:5514 (`x` = E, `y` = N), dĺžky v m, uhly v rad.
 * Polomer `null` znamená nekonečno.
 */
export interface AlignmentData {
  name: string;
  /** zobrazované staničenie začiatku osi [m] */
  staStart: number;
  /** dĺžka osi podľa LandXML [m] */
  length: number;
  horizontal: HorizontalElementData[];
  stationEquations: StationEquationData[];
  profiles: VerticalProfileData[];
  /** klopenie z LandXML `Superelevation` (ADR 0022); chýba v projektoch importovaných pred schémou v14 */
  superelevation?: SuperelevationData[] | undefined;
}

/**
 * Klopenie jedného oblúka (LandXML `Superelevation`, ADR 0022). Staničenia sú spojité = staStart + s (ako PVI) [m],
 * sklon v %; kladné plné klopenie = klesá doprava (ako parameter `q` prierezu, predpoklad overí výkaz klopenia).
 */
export interface SuperelevationData {
  staStart: number;
  staEnd: number;
  /** začiatok vyrovnania strechovitého sklonu (normálny priečny sklon) */
  beginRunout?: number | undefined;
  /** začiatok vzostupnice (vonkajší pruh vo vodorovnej polohe) */
  beginRunoff?: number | undefined;
  /** začiatok plného klopenia */
  fullSuper?: number | undefined;
  fullSuperelev?: number | undefined;
  /** koniec plného klopenia */
  runoff?: number | undefined;
  /** koniec zostupnice (vonkajší pruh vodorovne) */
  startOfRunout?: number | undefined;
  /** koniec vyrovnania (normálny priečny sklon) */
  endOfRunout?: number | undefined;
}

export type Rotation = 'cw' | 'ccw';

export interface LineData {
  kind: 'line';
  length: number;
  start: Vec2;
  end: Vec2;
}

export interface ArcData {
  kind: 'arc';
  length: number;
  start: Vec2;
  end: Vec2;
  center: Vec2;
  radius: number;
  rotation: Rotation;
}

export interface SpiralData {
  kind: 'spiral';
  spiralType: 'clothoid';
  length: number;
  start: Vec2;
  end: Vec2;
  /** smerník dotyčnice na začiatku prechodnice [rad] (z bodu PI alebo `dirStart`) */
  startAzimuth: number;
  radiusStart: number | null;
  radiusEnd: number | null;
  rotation: Rotation;
}

export type HorizontalElementData = LineData | ArcData | SpiralData;

/** Skok v staničení (LandXML `StaEquation`). */
export interface StationEquationData {
  /** spojité (interné) staničenie miesta skoku = staStart + s [m] */
  staInternal: number;
  /** zobrazované staničenie pred skokom [m] */
  staBack: number;
  /** zobrazované staničenie za skokom [m] */
  staAhead: number;
}

export type VerticalCurveData =
  | { kind: 'parabolic'; length: number }
  | { kind: 'circular'; length: number; radius: number };

export interface PviData {
  /** spojité staničenie PVI = staStart + s [m] */
  station: number;
  elevation: number;
  curve?: VerticalCurveData | undefined;
}

export interface VerticalProfileData {
  name: string;
  pvis: PviData[];
}
