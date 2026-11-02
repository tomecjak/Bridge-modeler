import { emptyBrief } from './brief.ts';
import type { ModelIssue } from './issues.ts';
import { SCHEMA_VERSION } from './schema.ts';
import { defaultAbutmentGeometry, levelFoundation } from './types.ts';

type RawProject = Record<string, unknown>;

const NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)\s*$/;

/**
 * Rozmer meraný kolmo na os opory → v osi mosta (÷ sin α, ADR 0018): pri číselných hodnotách číslo (na 1e-6),
 * inak výraz (sin vo výrazoch počíta v stupňoch).
 */
function alongBridgeAxis(value: unknown, angle: unknown): unknown {
  if (typeof value !== 'string') return value;
  const a = typeof angle === 'string' ? angle : '90';
  if (NUMBER.test(value) && NUMBER.test(a)) {
    const v = Number(value) / Math.sin((Number(a) * Math.PI) / 180);
    return String(Math.round(v * 1e6) / 1e6);
  }
  return `(${value}) / sin(${a})`;
}

/** 8 → 9: opora v osi mosta, koniec NK z opory, priečniky (ADR 0018). */
function migrateAbutmentsAlongAxis(raw: RawProject): RawProject {
  const list = (key: string) => (Array.isArray(raw[key]) ? (raw[key] as RawProject[]) : []);
  const lines = list('bearingLines');
  const supports = list('supports');
  const decks = list('superstructures');
  const station = (l: RawProject | undefined) => (typeof l?.station === 'number' ? l.station : NaN);
  /** krajné osi NK podľa staničenia */
  const ends = (deckId: unknown) => {
    const own = lines
      .filter((l) => l.superstructure === deckId)
      .sort((a, b) => station(a) - station(b));
    return { first: own[0], last: own.at(-1) };
  };
  const abutmentOn = (line: RawProject | undefined) =>
    line !== undefined &&
    supports.some(
      (s) =>
        s.bearingLine === line.id && (s.geometry as RawProject | undefined)?.type === 'abutment',
    );
  return {
    ...raw,
    superstructures: decks.map((d) => {
      const { first, last } = ends(d.id);
      return {
        ...d,
        ends: {
          start: abutmentOn(first) ? 'abutment' : 'manual',
          end: first !== last && abutmentOn(last) ? 'abutment' : 'manual',
        },
      };
    }),
    supports: supports.map((s) => {
      const g = s.geometry as RawProject | undefined;
      if (g?.type !== 'abutment') return s;
      const line = lines.find((l) => l.id === s.bearingLine);
      const deck = decks.find((d) => d.id === line?.superstructure);
      const { first, last } = ends(line?.superstructure);
      // doterajšie odsadenie konca NK = rozdiel staničení krajnej osi a konca NK
      const from = typeof deck?.from === 'number' ? deck.from : NaN;
      const to = typeof deck?.to === 'number' ? deck.to : NaN;
      const e = line === first ? station(line) - from : line === last ? to - station(line) : NaN;
      const { seatLength: _seatLength, ...rest } = g;
      return {
        ...s,
        geometry: {
          ...rest,
          construction: 'bearing',
          frontOffset: alongBridgeAxis(g.frontOffset, line?.crossingAngle),
          backwallThickness: alongBridgeAxis(g.backwallThickness, line?.crossingAngle),
          stemThickness: alongBridgeAxis(g.stemThickness, line?.crossingAngle),
          endOffset: Number.isFinite(e) && e >= 0 ? String(Math.round(e * 1000) / 1000) : '0.5',
          wallThickness: '1.2',
        },
      };
    }),
  };
}

/**
 * Kóta základovej škáry z hornej hrany základu a jeho hrúbky (ADR 0019): pri číselných hodnotách číslo (na 1e-6),
 * inak výraz.
 */
function foundationLevel(top: unknown, thickness: unknown): string {
  const f = typeof top === 'string' ? top : '0';
  const t = typeof thickness === 'string' ? thickness : '0';
  if (NUMBER.test(f) && NUMBER.test(t))
    return String(Math.round((Number(f) - Number(t)) * 1e6) / 1e6);
  if (NUMBER.test(t) && Number(t) === 0) return f;
  return `(${f}) - (${t})`;
}

/** 9 → 10: založenie podpery (ADR 0019); doterajšia kóta hornej hrany základu → kóta základovej škáry. */
function migrateFoundations(raw: RawProject): RawProject {
  const supports = Array.isArray(raw.supports) ? (raw.supports as RawProject[]) : [];
  return {
    ...raw,
    supports: supports.map(({ foundationTop, ...s }) => {
      const kind = s.kind === 'abutment' ? 'abutment' : 'pier';
      const footing = s.footing as RawProject | undefined;
      return {
        ...s,
        foundation: levelFoundation(foundationLevel(foundationTop, footing?.thickness), kind),
      };
    }),
  };
}

/**
 * Reťaz migrácií `verzia → nasledujúca verzia`. Každá migrácia je čistá funkcia s vlastným testom.
 */
export const MIGRATIONS: Readonly<
  Record<string, { to: string; migrate: (raw: RawProject) => RawProject }>
> = {
  /** 1 → 2: os mosta, prierezy a NK (ADR 0007) */
  '1': {
    to: '2',
    migrate: (raw) => ({ ...raw, bridgeAxes: [], profiles: [], superstructures: [] }),
  },
  /** 2 → 3: podpery (ADR 0008) */
  '2': { to: '3', migrate: (raw) => ({ ...raw, supports: [] }) },
  /** 3 → 4: opora s prahom, múrikom a krídlami (ADR 0010); pôvodné rozmery ostávajú, nové predvolené */
  '3': {
    to: '4',
    migrate: (raw) => ({
      ...raw,
      supports: (Array.isArray(raw.supports) ? raw.supports : []).map((s: RawProject) => {
        const g = s.geometry as RawProject | undefined;
        return g?.type === 'abutment'
          ? { ...s, geometry: { ...defaultAbutmentGeometry(), ...g } }
          : s;
      }),
    }),
  },
  /** 4 → 5: terén (ADR 0011) */
  '4': { to: '5', migrate: (raw) => ({ ...raw, terrains: [] }) },
  /** 5 → 6: čiary v pôdoryse a okraj NK podľa krivky (Fáza 8a) */
  '5': { to: '6', migrate: (raw) => ({ ...raw, planLines: [] }) },
  /** 6 → 7: zadanie a oblasť mosta (Fáza 10a) */
  '6': { to: '7', migrate: (raw) => ({ ...raw, brief: emptyBrief(), studyArea: null }) },
  /** 7 → 8: osi uloženia (ADR 0017); každá podpera dostane vlastnú os so svojím staničením a uhlom kríženia */
  '7': {
    to: '8',
    migrate: (raw) => {
      const supports = (Array.isArray(raw.supports) ? raw.supports : []) as RawProject[];
      return {
        ...raw,
        bearingLines: supports.map((s) => ({
          id: `bl-${String(s.id)}`,
          name: s.name,
          superstructure: s.superstructure,
          station: s.station,
          crossingAngle: s.crossingAngle,
        })),
        supports: supports.map(({ superstructure: _d, station: _s, crossingAngle: _a, ...s }) => ({
          ...s,
          bearingLine: `bl-${String(s.id)}`,
        })),
      };
    },
  },
  /** 8 → 9: rozmery opory v osi mosta, koniec NK z opory, priečniky (ADR 0018) */
  '8': { to: '9', migrate: migrateAbutmentsAlongAxis },
  /** 9 → 10: režimy založenia podpier (ADR 0019) */
  '9': { to: '10', migrate: migrateFoundations },
  /** 10 → 11: povrch terénu pre založenie podpier = prvý povrch (ADR 0020) */
  '10': {
    to: '11',
    migrate: (raw) => ({
      ...raw,
      terrains: (Array.isArray(raw.terrains) ? (raw.terrains as RawProject[]) : []).map((t, i) =>
        i === 0 ? { ...t, foundation: true } : t,
      ),
    }),
  },
  /** 11 → 12: prekážky (ADR 0020) */
  '11': { to: '12', migrate: (raw) => ({ ...raw, obstacles: [] }) },
  '12': { to: '13', migrate: (raw) => ({ ...raw, surveys: [] }) },
  /** klopenie osí (ADR 0022) je voliteľné — staré osi ho nemajú, kým sa neimportujú znova */
  '13': { to: '14', migrate: (raw) => raw },
  /** 14 → 15: rímsy (ADR 0023); požadovaná voľná šírka NK je voliteľná */
  '14': { to: '15', migrate: (raw) => ({ ...raw, edgeBeams: [] }) },
};

/** Prevedie surový objekt projektu na aktuálnu verziu schémy (bez validácie obsahu). */
export function migrateProject(
  raw: RawProject,
  migrations = MIGRATIONS,
): { ok: true; raw: RawProject } | { ok: false; issue: ModelIssue } {
  let current = raw;
  let version = String(current.schemaVersion ?? '');
  const visited = new Set<string>();
  while (version !== SCHEMA_VERSION) {
    const step = migrations[version];
    if (!step || visited.has(version))
      return { ok: false, issue: { code: 'UnsupportedSchemaVersion', version } };
    visited.add(version);
    current = { ...step.migrate(current), schemaVersion: step.to };
    version = step.to;
  }
  return { ok: true, raw: current };
}
