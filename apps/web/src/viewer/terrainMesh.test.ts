import { createTin } from '@bridge/terrain';
import { describe, expect, it } from 'vitest';
import { terrainBuffers } from './terrainMesh.ts';

describe('terrainBuffers', () => {
  it('centres the positions, turns clockwise faces upward and gives upward normals', () => {
    // druhý trojuholník je v smere hodín
    const tin = createTin(
      [1000, 2000, 300, 1010, 2000, 301, 1010, 2010, 302, 1000, 2010, 301],
      [0, 1, 2, 0, 3, 2],
    );
    const b = terrainBuffers(tin);
    expect(b.center).toEqual({ x: 1005, y: 2005, z: 301 });
    expect([...b.positions.slice(0, 3)]).toEqual([-5, -5, -1]);
    expect([...b.indices]).toEqual([0, 1, 2, 0, 2, 3]);
    for (let i = 2; i < b.normals.length; i += 3) expect(b.normals[i]).toBeGreaterThan(0.99);
  });
});
