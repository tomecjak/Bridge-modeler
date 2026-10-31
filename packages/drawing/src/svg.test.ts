import { describe, expect, it } from 'vitest';
import type { Drawing } from './model.ts';
import { toSvg } from './svg.ts';

const drawing: Drawing = {
  scale: 100,
  entities: [
    {
      kind: 'polyline',
      layer: 'deck',
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 2 },
      ],
      closed: true,
    },
    {
      kind: 'polyline',
      layer: 'roadAxis',
      points: [
        { x: 5, y: -1 },
        { x: 5, y: 3 },
      ],
      closed: false,
    },
    {
      kind: 'text',
      layer: 'label',
      at: { x: 1, y: 2 },
      text: 'Opora <1> & „O1“',
      height: 0.25,
      rotation: Math.PI / 2,
      align: 'center',
    },
  ],
};

describe('toSvg', () => {
  const svg = toSvg(drawing, { padding: 0 });

  it('sizes the sheet in millimetres at the drawing scale with a viewBox in metres', () => {
    // 10 × 4 m v mierke 1 : 100 = 100 × 40 mm
    expect(svg).toContain('width="100mm" height="40mm" viewBox="0 -3 10 4"');
  });

  it('groups entities by layer in a fixed order, flips y and keeps texts upright', () => {
    expect(svg.indexOf('<g id="OS_CESTY"')).toBeLessThan(svg.indexOf('<g id="NK"'));
    expect(svg).toContain('<polygon points="0,0 10,0 10,-2"/>');
    expect(svg).toContain('stroke-dasharray="1.2 0.3 0.3 0.3"');
    expect(svg).toContain('transform="rotate(-90 1 -2)"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('Opora &lt;1&gt; &amp; „O1“');
    expect(svg).not.toContain('id="TEREN"');
  });

  it('is deterministic', () => {
    expect(toSvg(drawing, { padding: 0 })).toBe(svg);
  });
});
