import { type AlignmentData, createAlignment } from '@bridge/alignment';
import { type BearingLine, buildParameterSet, type ProjectFile } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { bridgeAxisLength } from './axisLength.ts';
import { crossbeamBands } from './crossbeams.ts';
import { evaluateBearingLine, type SupportContext } from './supports.ts';
import { crossbeamBlock } from './templates/catalog.ts';
import { reference212Project } from './testing/index.ts';

/** 212-00 s priečnikmi na osiach podľa `crossbeams` (id osi → šírka). */
function bands(crossbeams: Record<string, string>, profile = 'cb') {
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
  return crossbeamBands({
    deck: p.superstructures[0] as ProjectFile['superstructures'][number],
    lines: p.bearingLines.map((l) => evaluateBearingLine(ctx, l)),
    profiles: p.profiles,
    parameters,
    alignment,
    measure: bridgeAxisLength(axis, alignment, parameters),
  });
}

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
