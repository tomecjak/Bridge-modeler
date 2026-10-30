import { createAlignment, parseLandXml, suggestOrigin } from '@bridge/alignment';
import { describe, expect, it } from 'vitest';
import { formatCursor } from './cursor.ts';

const xml = `<LandXML><Units><Metric linearUnit="meter" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>
<Alignments><Alignment name="A" length="100" staStart="1000"><CoordGeom>
<Line length="100"><Start>-1000000 -600000</Start><End>-999900 -600000</End></Line></CoordGeom>
<Profile><ProfAlign name="N"><PVI>1000 300</PVI><PVI>1100 302</PVI></ProfAlign></Profile>
</Alignment></Alignments></LandXML>`;
const data = parseLandXml(xml).alignments[0];
if (!data) throw new Error('fixture did not parse');
const origin = suggestOrigin(data);
const { alignment } = createAlignment(data, origin);

describe('formatCursor', () => {
  it('shows station, offset and S-JTSK coordinates in plan', () => {
    const text = formatCursor(
      { source: 'plan', point: { x: 2.5, y: 40 }, s: 40, offset: 2.5 },
      alignment,
      origin,
    );
    expect(text).toBe('km 1,040 000  ·  odsadenie 2,500 m  ·  E -599 997,500  N -999 960,000');
  });

  it('shows elevation and grade in profile', () => {
    expect(formatCursor({ source: 'profile', s: 50 }, alignment, origin)).toBe(
      'km 1,050 000  ·  H 301,000 m n. m.  ·  sklon 2,000 %',
    );
  });

  it('reports positions outside the alignment', () => {
    expect(
      formatCursor(
        { source: 'plan', point: { x: 0, y: -5 }, s: undefined, offset: undefined },
        alignment,
        origin,
      ),
    ).toBe('mimo osi  ·  E -600 000,000  N -1 000 005,000');
  });
});
