import { levelFoundation, type Support } from '@bridge/model';
import { SUPPORT_TEMPLATES, type SupportResult } from '@bridge/sections';
import { describe, expect, it } from 'vitest';
import {
  applySupportType,
  findSupportType,
  projectSupportEntries,
  type SupportSource,
  supportTypeOptions,
} from './supportTypes.ts';

const pier: Support = {
  id: 'p1',
  name: 'P1',
  kind: 'pier',
  bearingLine: 'l2',
  offset: '0.5',
  geometry: { type: 'wall', thickness: '1.2', length: '4' },
  footing: { length: '8', width: '4', thickness: '1.2' },
  connection: 'bearing',
  bearingHeight: '0.35',
  bearings: ['-1.8', '1.8'],
  foundation: { ...levelFoundation('238.8'), terrain: 245.1 },
};

const sources: SupportSource[] = [
  {
    key: 'builtin',
    title: 'Šablóny',
    entries: SUPPORT_TEMPLATES.map((t) => ({ id: t.key, name: t.name, support: t.support })),
  },
  {
    key: 'project',
    title: 'Projekt',
    entries: projectSupportEntries(
      [pier],
      [{ support: pier, height: { min: 6.25, max: 6.3 } } as SupportResult],
    ),
  },
];

describe('support types', () => {
  it('offers the types of one kind with their source after the default', () => {
    const options = supportTypeOptions(sources, 'pier', 'predvolený');
    expect(options[0]).toEqual({ value: '', label: 'predvolený' });
    expect(options.map((o) => o.value)).toContain('builtin:twoColumns');
    expect(options.map((o) => o.value)).toContain('project:p1');
    expect(options.map((o) => o.value)).not.toContain('builtin:massiveAbutment');
    expect(options.find((o) => o.value === 'project:p1')?.label).toBe('P1 · Projekt');
  });

  it('turns a level-founded project support into a type by its current height', () => {
    expect(findSupportType(sources, 'project:p1')?.support.foundation).toEqual({
      mode: 'height',
      cover: '0.5',
      height: '6.25',
    });
    expect(findSupportType(sources, '')).toBeUndefined();
  });

  it('applies a type to a support and keeps its identity, line, offset and terrain', () => {
    const type = findSupportType(sources, 'builtin:twoColumns')?.support;
    if (!type) throw new Error('chýba typ');
    const next = applySupportType(pier, type, { bearings: [-1.25, 1.25], width: 16.5 });
    expect(next).toMatchObject({
      id: 'p1',
      name: 'P1',
      bearingLine: 'l2',
      offset: '0.5',
      bearings: ['-1.25', '1.25'],
      geometry: { type: 'columns', spacing: '2.5' },
      foundation: { mode: 'terrain', level: '238.8', terrain: 245.1 },
    });
  });
});
