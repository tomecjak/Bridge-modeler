import { describe, expect, it } from 'vitest';
import { serializeLibrary } from './library.ts';
import {
  parseSupportLibrary,
  type SupportLibraryEntry,
  type SupportType,
  serializeSupportLibrary,
  supportFromType,
  typeFromSupport,
} from './supportLibrary.ts';
import { defaultAbutmentGeometry, levelFoundation, type Support } from './types.ts';

const wall: SupportType = {
  kind: 'pier',
  geometry: { type: 'wall', thickness: '1.2', length: '7.5' },
  footing: { length: '9', width: '6.5', thickness: '1.5' },
  connection: 'bearing',
  bearingHeight: '0.45',
  foundation: { mode: 'terrain', cover: '0.5', height: '8' },
};

const entry = (id: string, name: string, support: SupportType = wall): SupportLibraryEntry => ({
  id,
  name,
  support,
});

const place = { id: 's1', name: 'P1', bearingLine: 'l2', level: '300.5' };

describe('support library file', () => {
  it('round-trips the entries', () => {
    const text = serializeSupportLibrary([entry('a', 'Stena A'), entry('b', 'Stena B')]);
    expect(JSON.parse(text)).toMatchObject({
      format: 'bridge-modeler/support-library',
      version: 1,
    });
    const r = parseSupportLibrary(text);
    expect(r).toMatchObject({ ok: true, entries: [{ id: 'a' }, { id: 'b' }] });
    if (r.ok) expect(serializeSupportLibrary(r.entries)).toBe(text);
  });

  it('rejects a profile library, invalid JSON and invalid entries with typed issues', () => {
    expect(parseSupportLibrary(serializeLibrary([]))).toMatchObject({
      ok: false,
      issues: [{ code: 'NotASupportLibrary' }],
    });
    expect(parseSupportLibrary('{')).toMatchObject({
      ok: false,
      issues: [{ code: 'InvalidJson' }],
    });
    const broken = JSON.parse(serializeSupportLibrary([entry('a', 'Stena')]));
    broken.entries[0].support.foundation.mode = 'level';
    expect(parseSupportLibrary(JSON.stringify(broken))).toMatchObject({
      ok: false,
      issues: [{ code: 'SchemaViolation', path: 'entries[0].support.foundation.mode' }],
    });
  });
});

describe('supportFromType', () => {
  it('copies the type onto the bearing line with the deck bearings', () => {
    const s = supportFromType(wall, { ...place, bearings: [-1.25, 1.25] });
    expect(s).toEqual({
      ...wall,
      id: 's1',
      name: 'P1',
      bearingLine: 'l2',
      offset: '0',
      bearings: ['-1.25', '1.25'],
      foundation: { mode: 'terrain', cover: '0.5', height: '8', level: '300.5' },
    });
    expect(s.geometry).not.toBe(wall.geometry);
    expect(supportFromType(wall, { ...place, bearings: [] }).bearings).toEqual(['-1.8', '1.8']);
  });

  it('sizes an abutment and its footing to the deck width', () => {
    const massive: SupportType = {
      ...wall,
      kind: 'abutment',
      geometry: defaultAbutmentGeometry('12'),
      footing: { length: '12', width: '5', thickness: '1.5' },
      foundation: { mode: 'height', cover: '0.5', height: '5' },
    };
    const s = supportFromType(massive, { ...place, bearings: [-1, 1], deckWidth: 16.54 });
    expect(s.geometry).toMatchObject({ type: 'abutment', length: '16.5' });
    expect(s.footing.length).toBe('16.5');
    const onPiles = { ...massive, footing: { length: '0', width: '0', thickness: '0' } };
    expect(
      supportFromType(onPiles, { ...place, bearings: [], deckWidth: 16.54 }).footing.length,
    ).toBe('0');
  });

  it('spaces columns under the bearings when their counts match', () => {
    const columns: SupportType = {
      ...wall,
      geometry: {
        type: 'columns',
        shape: 'circle',
        diameter: '1.2',
        width: '1.2',
        depth: '1.2',
        count: '2',
        spacing: '4',
      },
    };
    const two = supportFromType(columns, { ...place, bearings: [1.25, -1.25] });
    expect(two.geometry).toMatchObject({ spacing: '2.5' });
    const three = supportFromType(columns, { ...place, bearings: [-3, 0, 3] });
    expect(three.geometry).toMatchObject({ spacing: '4' });
  });
});

describe('typeFromSupport', () => {
  const support: Support = {
    id: 'p1',
    name: 'P1',
    kind: 'pier',
    bearingLine: 'l1',
    offset: '0.3',
    geometry: { type: 'wall', thickness: '1.2', length: '7.5' },
    footing: { length: '9', width: '6.5', thickness: '1.5' },
    connection: 'bearing',
    bearingHeight: '0.45',
    bearings: ['-1.25', '1.25'],
    foundation: { ...levelFoundation('309.57'), terrain: 312.4 },
  };

  it('keeps the shape and drops the bearings, offset, line and terrain', () => {
    const terrain = typeFromSupport({
      ...support,
      foundation: { ...support.foundation, mode: 'terrain' },
    });
    expect(terrain).toEqual(wall);
  });

  it('stores a level-founded support by its current height', () => {
    expect(typeFromSupport(support, 5.4321).foundation).toEqual({
      mode: 'height',
      cover: '0.5',
      height: '5.432',
    });
    expect(typeFromSupport(support, Number.NaN).foundation.height).toBe('8');
  });
});
