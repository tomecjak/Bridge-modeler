import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { type BearingLine, buildParameterSet, type ProjectFile } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { bridgeAxisLength } from './axisLength.ts';
import { crossbeamBands } from './crossbeams.ts';
import { sampleSuperstructure } from './deckSampling.ts';
import { evaluateSuperstructure } from './superstructure.ts';
import { evaluateBearingLine, type SupportContext } from './supports.ts';
import { crossbeamBlock } from './templates/catalog.ts';
import { reference212Project } from './testing/index.ts';

/** 212-00 s priečnikmi na osiach podľa `crossbeams` (id osi → šírka): kontext, NK a pásy. */
function setup(crossbeams: Record<string, string>, profile = 'cb') {
  const ref = reference212Project();
  const p: ProjectFile = {
    ...ref,
    profiles: [...ref.profiles, crossbeamBlock('cb')],
    bearingLines: ref.bearingLines.map(
      (l): BearingLine =>
        crossbeams[l.id] ? { ...l, crossbeam: { profile, width: crossbeams[l.id] as string } } : l,
    ),
  };
  const origin = p.crs.origin as NonNullable<ProjectFile['crs']['origin']>;
  const { alignment } = createAlignment(p.alignments[0] as AlignmentData, origin);
  const parameters = buildParameterSet([]);
  const ctx: SupportContext = {
    alignments: new Map([[alignment.name, alignment]]),
    parameters,
    bridgeAxes: p.bridgeAxes,
    profiles: p.profiles,
    planLines: p.planLines,
    superstructures: p.superstructures,
    bearingLines: p.bearingLines,
  };
  const axis = p.bridgeAxes[0];
  if (!axis) throw new Error('chýba os mosta');
  const deck = p.superstructures[0] as ProjectFile['superstructures'][number];
  const result = crossbeamBands({
    deck,
    lines: p.bearingLines.map((l) => evaluateBearingLine(ctx, l)),
    profiles: p.profiles,
    parameters,
    alignment,
    measure: bridgeAxisLength(axis, alignment, parameters),
  });
  return { ctx: { ...ctx, crossbeams: new Map([[deck.id, result.bands]]) }, deck, result };
}

const bands = (crossbeams: Record<string, string>, profile = 'cb') =>
  setup(crossbeams, profile).result;

/** km → spojité staničenie syntetickej osi 212-00 (začína na km 9,250). */
const km = (s: number) => 9250 + s;

describe('crossbeamBands', () => {
  it('runs an end crossbeam from the deck face and an inner one symmetrically around its line', () => {
    const r = bands({ l1: '1.2', l2: '1.0' });
    expect(r.issues).toEqual([]);
    expect(r.bands.map((b) => [b.line.name, b.end, km(b.sFrom), km(b.sTo)])).toEqual([
      ['1', 'start', expect.closeTo(9307.31, 9), expect.closeTo(9308.51, 9)],
      ['2', undefined, expect.closeTo(9323.31, 9), expect.closeTo(9324.31, 9)],
    ]);
    expect(r.bands[0]?.profile.id).toBe('cb');
    expect(r.bands[0]?.angle).toBeCloseTo(((68.71 * 360) / 400) * (Math.PI / 180), 12);
  });

  it('runs the last crossbeam back from the deck end', () => {
    const [band] = bands({ l4: '1.5' }).bands;
    expect(band?.end).toBe('end');
    expect(km(band?.sFrom ?? 0)).toBeCloseTo(9361.81, 9);
    expect(km(band?.sTo ?? 0)).toBeCloseTo(9363.31, 9);
  });

  it('reports unknown profiles, invalid widths, bands outside the deck and overlaps', () => {
    expect(bands({ l2: '1' }, 'chýba').issues).toMatchObject([
      { code: 'UnknownCrossbeamProfile', line: '2', owner: { kind: 'superstructure' } },
    ]);
    expect(bands({ l2: '0' }).issues).toMatchObject([
      { code: 'InvalidDimension', name: 'crossbeam.width' },
    ]);
    expect(bands({ l2: '40' }).issues).toMatchObject([{ code: 'CrossbeamOutsideDeck', line: '2' }]);
    const overlap = bands({ l2: '20', l3: '30' });
    expect(overlap.issues).toMatchObject([{ code: 'CrossbeamOverlap', lines: ['2', '3'] }]);
    expect(overlap.bands.map((b) => b.line.name)).toEqual(['2']);
  });
});

describe('crossbeam in the deck geometry', () => {
  it('uses the crossbeam profile inside its band with the deck widths and the deck profile outside', () => {
    const { ctx, deck } = setup({ l2: '1.0' });
    const at = (station: number) => evaluateSuperstructure(ctx, deck, station - 9250);
    // plný blok má obrys so 4 vrcholmi, prierez NK viac
    const corners = (s: ReturnType<typeof at>) => s.loops.map((l) => l.polygon.length);
    const inside = at(9323.81);
    expect(corners(inside)).toEqual([4]);
    // šírka z NK (bL = bR = 8,25), spodok vodorovne v hĺbke h priečnika
    const xs = inside.loops.flatMap((l) => l.polygon.map((p) => p.x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(16.5, 9);
    const outside = at(9320);
    expect(corners(outside)[0]).toBeGreaterThan(4);
    expect(outside.area).toBeLessThan(inside.area);
  });

  it('splits the deck into segments with skewed boundaries parallel to the bearing lines', () => {
    const { ctx, deck } = setup({ l1: '1.2', l2: '1.0' });
    const samples = sampleSuperstructure(ctx, deck, []);
    if (!('segments' in samples)) throw new Error('NK sa nevyhodnotila');
    const alpha = ((68.71 * 360) / 400) * (Math.PI / 180);
    expect(
      samples.segments.map((g) => [
        g.crossbeam?.line.name,
        Math.round((9250 + g.sFrom) * 100) / 100,
        Math.round((9250 + g.sTo) * 100) / 100,
      ]),
    ).toEqual([
      ['1', 9307.31, 9308.51],
      [undefined, 9308.51, 9323.31],
      ['2', 9323.31, 9324.31],
      [undefined, 9324.31, 9363.31],
    ]);
    expect(samples.segments[1]?.startAngle).toBeCloseTo(alpha, 12);
    expect(samples.segments[2]?.endAngle).toBeCloseTo(alpha, 12);
    // úsek NK má prierez NK aj na hraniciach, priečnik prierez priečnika (plný blok = 4 vrcholy)
    const corners = (i: number) =>
      samples.segments[i]?.sections.map((s) => s.loops[0]?.polygon.length ?? 0) ?? [];
    expect(corners(1).every((n) => n > 4)).toBe(true);
    expect(corners(2).every((n) => n === 4)).toBe(true);
  });
});
