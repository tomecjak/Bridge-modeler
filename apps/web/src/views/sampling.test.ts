import { createAlignment, createStationing, parseLandXml, suggestOrigin } from '@bridge/alignment';
import { describe, expect, it } from 'vitest';
import { sampleHorizontal, sampleProfile, stationTicks } from './sampling.ts';

const xml = `<?xml version="1.0"?><LandXML><Units><Metric linearUnit="meter" angularUnit="decimal degrees" directionUnit="decimal degrees"/></Units>
<Alignments><Alignment name="A" length="157.0796326794897" staStart="980">
<CoordGeom>
<Line length="100"><Start>-1000000 -600000</Start><End>-999900 -600000</End></Line>
<Curve rot="cw" crvType="arc" length="57.07963267948966" radius="100"><Start>-999900 -600000</Start><Center>-999900 -599900</Center><End>-999842.9203673205 -599917.8606195</End></Curve>
</CoordGeom>
<Profile><ProfAlign name="N"><PVI>980 300</PVI><ParaCurve length="40">1060 302</ParaCurve><PVI>1137.0796 301</PVI></ProfAlign></Profile>
</Alignment></Alignments></LandXML>`;

const data = parseLandXml(xml).alignments[0];
if (!data) throw new Error('fixture did not parse');
const { alignment } = createAlignment(data, suggestOrigin(data));

describe('sampleHorizontal', () => {
  it('uses end points for lines and dense points for arcs', () => {
    const samples = sampleHorizontal(alignment, 5);
    expect(samples[0]?.s).toBe(0);
    expect(samples[1]?.s).toBe(100);
    expect(samples.at(-1)?.s).toBeCloseTo(alignment.length, 9);
    expect(samples.length).toBe(1 + Math.ceil(57.08 / 5) + 1);
  });
});

describe('sampleProfile', () => {
  it('returns absolute elevations including PVC and PVT', () => {
    const samples = sampleProfile(alignment, 10);
    expect(samples[0]).toEqual({ s: 0, z: 300 });
    expect(samples.some((p) => Math.abs(p.s - 60) < 1e-9)).toBe(true);
    expect(samples.some((p) => Math.abs(p.s - 100) < 1e-9)).toBe(true);
  });
});

describe('stationTicks', () => {
  it('places ticks on round display stations', () => {
    const ticks = stationTicks(alignment.stationing, 50);
    expect(ticks.map((t) => t.station)).toEqual([1000, 1050, 1100]);
    expect(ticks[0]?.s).toBeCloseTo(20, 9);
  });

  it('respects station equations and s limits', () => {
    const st = createStationing(0, 300, [{ staInternal: 100, staBack: 100, staAhead: 1000 }]);
    // v s = 100 platí staničenie za skokom (1000)
    expect(stationTicks(st, 100).map((t) => t.station)).toEqual([0, 1000, 1100, 1200]);
    expect(stationTicks(st, 100, 50, 250).map((t) => t.s)).toEqual([100, 200]);
  });
});
