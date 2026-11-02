import type { Survey } from '@bridge/model';
import { createTin } from '@bridge/terrain';
import { describe, expect, it } from 'vitest';
import { planSurveys, sceneSurveys } from './survey.ts';

const survey = (lines: Survey['lines'], points: Survey['points'] = []): Survey => ({
  id: 'm',
  name: 'M',
  file: 'm.dxf',
  layers: { points: [], heights: [], numbers: [], codes: [], lines: [] },
  points,
  lines,
});

describe('survey display', () => {
  it('labels plan points with their height above sea level', () => {
    const [s] = planSurveys(
      [
        survey(
          [],
          [
            { x: 1, y: 2, z: 4.52 },
            { x: 3, y: 4 },
          ],
        ),
      ],
      800,
    );
    expect(s?.points.map((p) => p.label)).toEqual(['804,52', undefined]);
  });

  it('interpolates line heights in 3D and drapes lines without heights on the terrain', () => {
    // rovina z = 100 + x na štvorci 0..10
    const tin = createTin([0, 0, 100, 10, 0, 110, 10, 10, 110, 0, 10, 100], [0, 1, 2, 0, 2, 3]);
    const scene = sceneSurveys(
      [
        survey(
          [
            {
              id: 'L1',
              layer: 'a',
              points: [
                { x: 0, y: 0, z: 5 },
                { x: 1, y: 0 },
                { x: 2, y: 0, z: 7 },
              ],
              closed: false,
            },
            {
              id: 'L2',
              layer: 'b',
              points: [
                { x: 2, y: 5 },
                { x: 14, y: 5 },
              ],
              closed: false,
            },
          ],
          [
            { x: 0, y: 0, z: 5 },
            { x: 9, y: 9 },
          ],
        ),
      ],
      [tin],
    );
    expect(scene.lines[0]).toEqual([
      { x: 0, y: 0, z: 5 },
      { x: 1, y: 0, z: 6 },
      { x: 2, y: 0, z: 7 },
    ]);
    // zhustená po 1 m, mimo terénu (x > 10) sa preruší
    const draped = scene.lines[1] ?? [];
    expect(draped).toHaveLength(9);
    expect(draped[0]?.z).toBeCloseTo(102, 9);
    expect(draped.at(-1)?.x).toBe(10);
    expect(draped.at(-1)?.z).toBeCloseTo(110, 9);
    expect(scene.points).toEqual([{ x: 0, y: 0, z: 5 }]);
  });
});
