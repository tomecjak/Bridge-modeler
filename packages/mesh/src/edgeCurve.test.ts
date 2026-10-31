/**
 * Okraj NK podľa krivky (Fáza 8a) na moste 212-00: ľavý okraj podľa rozbiehavej osi z LandXML, pravý podľa čiary
 * v pôdoryse so zlomom. Obrys v pôdoryse leží na krivkách a 3D sieť sa zhoduje s obrysom.
 */
import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { type Vec2, vec2 } from '@bridge/geom';
import { buildParameterSet, type ProjectFile, type Superstructure } from '@bridge/model';
import {
  type DeckSamples,
  deckOutline,
  evaluateSupport,
  type SupportContext,
  sampleSuperstructure,
} from '@bridge/sections';
import { reference212Project, STA1 } from '@bridge/sections/testing';
import { describe, expect, it } from 'vitest';
import { meshBounds } from './mesh.ts';
import { buildScene, createSceneCache } from './scene.ts';

const base = reference212Project();
const road = base.alignments[0] as AlignmentData;
const roadLine = road.horizontal[0] as Extract<
  AlignmentData['horizontal'][number],
  { kind: 'line' }
>;
const az = Math.atan2(roadLine.end.x - roadLine.start.x, roadLine.end.y - roadLine.start.y);
/** Bod v S-JTSK na staničení `sta` osi cesty s odsadením `offset` (+ vpravo). */
const at = (sta: number, offset: number): Vec2 => {
  const d = sta - road.staStart;
  return vec2(
    roadLine.start.x + d * Math.sin(az) + offset * Math.cos(az),
    roadLine.start.y + d * Math.cos(az) - offset * Math.sin(az),
  );
};
const origin = base.crs.origin as NonNullable<ProjectFile['crs']['origin']>;
const local = (p: Vec2) => vec2(p.x - origin.x, p.y - origin.y);

// ľavý okraj: 8,25 m na začiatku osi cesty → 10,25 m na konci (os z LandXML, bez nivelety)
const leftEdge: AlignmentData = {
  name: 'okraj_L',
  staStart: 0,
  length: Math.hypot(200, 2),
  horizontal: [
    {
      kind: 'line',
      length: Math.hypot(200, 2),
      start: at(road.staStart, -8.25),
      end: at(road.staStart + 200, -10.25),
    },
  ],
  stationEquations: [],
  profiles: [],
};
const KINK = STA1 + 30;
const project: ProjectFile = {
  ...base,
  alignments: [road, leftEdge],
  planLines: [
    {
      id: 'okrajP',
      name: 'Okraj P',
      points: [at(STA1 - 10, 8.25), at(KINK, 8.25), at(STA1 + 70, 9.25)].map(local),
    },
  ],
  superstructures: base.superstructures.map((s) => ({
    ...s,
    parameterLaws: {
      ...s.parameterLaws,
      bL: { kind: 'edge', curve: { type: 'alignment', name: 'okraj_L' }, side: 'left', add: '0' },
      bR: { kind: 'edge', curve: { type: 'planLine', id: 'okrajP' }, side: 'right', add: '0.1' },
    },
  })),
};

const alignments = new Map(
  project.alignments.map((d) => {
    const a = createAlignment(d, origin).alignment;
    return [a.name, a];
  }),
);
const ctx: SupportContext = {
  alignments,
  parameters: buildParameterSet([]),
  bridgeAxes: project.bridgeAxes,
  profiles: project.profiles,
  planLines: project.planLines,
  superstructures: project.superstructures,
};
const deck = project.superstructures[0] as Superstructure;
const results = project.supports.map((s) => evaluateSupport(ctx, s));
const samples = sampleSuperstructure(ctx, deck, results) as DeckSamples;
const roadAlignment = alignments.get(road.name);

/** Odsadenie bodu (lokálne súradnice) od osi cesty, + vpravo. */
const offsetOf = (p: Vec2) => roadAlignment?.project(p)?.offset ?? Number.NaN;

describe('deck edges following curves', () => {
  it('evaluates every sample without issues and samples the plan line vertex', () => {
    expect(samples.issues).toEqual([]);
    const sKink = roadAlignment?.stationing.fromDisplay(KINK) ?? Number.NaN;
    expect(samples.stations.some((s) => Math.abs(s - sKink) < 1e-9)).toBe(true);
  });

  it('keeps the plan outline on both curves (apart from the skewed end corners)', () => {
    const outline = deckOutline(samples);
    for (const p of outline.left.slice(1, -1)) {
      const s = roadAlignment?.project(p)?.s ?? Number.NaN;
      const sta = roadAlignment?.stationing.toDisplay(s).station ?? Number.NaN;
      expect(Math.abs(offsetOf(p) + 8.25 + (2 * (sta - road.staStart)) / 200)).toBeLessThan(0.002);
    }
    for (const p of outline.right.slice(1, -1)) {
      const s = roadAlignment?.project(p)?.s ?? Number.NaN;
      const sta = roadAlignment?.stationing.toDisplay(s).station ?? Number.NaN;
      const edge = sta <= KINK ? 8.25 : 8.25 + (sta - KINK) / 40;
      expect(Math.abs(offsetOf(p) - edge - 0.1)).toBeLessThan(0.002);
    }
  });

  it('builds a 3D deck matching the plan outline within 2 mm', () => {
    const outline = deckOutline(samples).polygon;
    const scene = buildScene(project, createSceneCache());
    const mesh = scene.objects.find((o) => o.kind === 'superstructure')?.mesh;
    const b = mesh && meshBounds(mesh);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);
    expect(Math.abs(Math.min(...xs) - (b?.min.x ?? 0))).toBeLessThan(0.002);
    expect(Math.abs(Math.max(...xs) - (b?.max.x ?? 0))).toBeLessThan(0.002);
    expect(Math.abs(Math.min(...ys) - (b?.min.y ?? 0))).toBeLessThan(0.002);
    expect(Math.abs(Math.max(...ys) - (b?.max.y ?? 0))).toBeLessThan(0.002);
  });

  it('rebuilds the deck when the referenced plan line changes', () => {
    const cache = createSceneCache();
    buildScene(project, cache);
    const moved: ProjectFile = {
      ...project,
      planLines: project.planLines.map((l) => ({
        ...l,
        points: l.points.map((p) => vec2(p.x + 0.01, p.y)),
      })),
    };
    expect(buildScene(moved, cache).changed).toContain('superstructure:nk');
  });
});
