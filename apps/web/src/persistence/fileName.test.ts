import { describe, expect, it } from 'vitest';
import { drawingFileName, projectFileName } from './fileName.ts';

describe('projectFileName', () => {
  it('keeps diacritics and removes forbidden characters', () => {
    expect(projectFileName('Most SO 201/1: Dubová')).toBe('Most SO 201-1- Dubová.bridge.json');
    expect(projectFileName('   ')).toBe('projekt.bridge.json');
  });
});

describe('drawingFileName', () => {
  it('joins the project and the view name', () => {
    expect(drawingFileName('Most 212-00', 'pôdorys', 'dxf')).toBe('Most 212-00 – pôdorys.dxf');
    expect(drawingFileName('', 'priečny rez km 9,335 310', 'svg')).toBe(
      'projekt – priečny rez km 9,335 310.svg',
    );
  });
});
