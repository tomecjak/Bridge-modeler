import { supportFromType } from '@bridge/model';
import { describe, expect, it } from 'vitest';
import { deckBearingsAt } from '../bearingLayout.ts';
import { supportParts } from '../supportGeometry.ts';
import { evaluateSupport } from '../supports.ts';
import { evaluateReference212 } from '../testing/index.ts';
import { builtinSupportLibrary, SUPPORT_TEMPLATES } from './supports.ts';

describe('support templates', () => {
  it('stand on the 212-00 bearing lines without errors and give a solid', () => {
    const { ctx, lines, deck } = evaluateReference212();
    for (const t of SUPPORT_TEMPLATES) {
      const line = t.support.kind === 'abutment' ? lines[0] : lines[1];
      if (!line) throw new Error('chýba os 212-00');
      const bearings = deckBearingsAt(ctx, deck, line.s);
      expect(bearings).toEqual([-1.25, 1.25]);
      const support = supportFromType(t.support, {
        id: t.key,
        name: t.name,
        bearingLine: line.line.id,
        bearings,
        deckWidth: 16.5,
        level: '300',
      });
      const r = evaluateSupport(ctx, support);
      expect(
        r.issues.filter((i) => i.severity !== 'warning' && i.code !== 'NonPositiveSupportHeight'),
        t.key,
      ).toEqual([]);
      expect(Number.isFinite(r.foundationTop), t.key).toBe(true);
      expect(supportParts(r).length, t.key).toBeGreaterThan(0);
    }
  });

  it('puts two columns under the bearings and founds the piles abutment by the seat height', () => {
    const two = SUPPORT_TEMPLATES.find((t) => t.key === 'twoColumns');
    const piles = SUPPORT_TEMPLATES.find((t) => t.key === 'abutmentOnPiles');
    if (!two || !piles) throw new Error('chýba šablóna');
    const s = supportFromType(two.support, {
      id: 'p',
      name: 'P',
      bearingLine: 'l2',
      bearings: [-1.25, 1.25],
      level: '0',
    });
    expect(s.geometry).toMatchObject({ type: 'columns', count: '2', spacing: '2.5' });
    expect(piles.support.foundation.height).toBe(
      piles.support.geometry.type === 'abutment' ? piles.support.geometry.seatHeight : '',
    );
  });

  it('are a read-only library with stable ids', async () => {
    const lib = builtinSupportLibrary();
    expect(lib.readOnly).toBe(true);
    const list = await lib.list();
    expect(list.map((e) => e.id)).toContain('sablona-podpera:wallPier');
    expect(list).toHaveLength(SUPPORT_TEMPLATES.length);
  });
});
