import { createAlignment, suggestOrigin } from '@bridge/alignment';
import { syntheticAlignmentData } from '@bridge/alignment/testing';
import { corridorAround } from '@bridge/terrain';
import { describe, expect, it } from 'vitest';
import { buildTerrain, isTerrainFile, readTerrainFile, terrainSize } from './importTerrain.ts';

const data = syntheticAlignmentData(undefined, 1000);
const origin = suggestOrigin(data);
const { alignment } = createAlignment(data, origin);

/** LandXML s dvoma povrchmi: štvorec 200 × 200 m okolo začiatku osi a malý povrch ďaleko mimo osi. */
function landXml(): string {
  const p = alignment.evaluateHorizontal(0).point;
  const e = (dx: number) => (p.x + origin.x + dx).toFixed(3);
  const n = (dy: number) => (p.y + origin.y + dy).toFixed(3);
  const surface = (name: string, dx: number) => `
    <Surface name="${name}"><Definition surfType="TIN">
      <Pnts>
        <P id="1">${n(-100)} ${e(dx - 100)} 250</P>
        <P id="2">${n(-100)} ${e(dx + 100)} 251</P>
        <P id="3">${n(100)} ${e(dx + 100)} 252</P>
        <P id="4">${n(100)} ${e(dx - 100)} 251</P>
      </Pnts>
      <Faces><F>1 2 3</F><F>1 3 4</F></Faces>
    </Definition></Surface>`;
  return `<LandXML><Units><Metric linearUnit="meter"/></Units><Surfaces>${surface('EG', 0)}${surface('Ďaleko', 5000)}</Surfaces></LandXML>`;
}

describe('import terénu', () => {
  it('recognises terrain files', () => {
    expect(isTerrainFile('teren.xml')).toBe(true);
    expect(isTerrainFile('DMR_5.0.TIF')).toBe(true);
    expect(isTerrainFile('projekt.json')).toBe(false);
  });

  it('lists LandXML surfaces and clips the chosen one to the corridor', async () => {
    const file = await readTerrainFile(new File([landXml()], 'teren.xml'));
    expect(file.issues).toEqual([]);
    expect(file.candidates.map((c) => c.name)).toEqual(['EG', 'Ďaleko']);
    const options = { halfWidth: 60, margin: 10 };
    const corridor = corridorAround(alignment, [{ sFrom: 0, sTo: 40 }], options);
    const [near, far] = file.candidates;
    const built = near && (await buildTerrain(near, corridor, options, origin, 't1'));
    expect(built?.terrain).toMatchObject({
      id: 't1',
      name: 'EG',
      source: 'landxml',
      corridor: options,
    });
    expect(built?.terrain && terrainSize(built.terrain).points).toBeGreaterThan(0);
    // povrch mimo koridoru → bez terénu
    expect(far && (await buildTerrain(far, corridor, options, origin, 't2'))).toEqual({
      issues: [],
    });
  });
});
