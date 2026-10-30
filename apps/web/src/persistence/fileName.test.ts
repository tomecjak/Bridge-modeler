import { describe, expect, it } from 'vitest';
import { projectFileName } from './fileName.ts';

describe('projectFileName', () => {
  it('keeps diacritics and removes forbidden characters', () => {
    expect(projectFileName('Most SO 201/1: Dubová')).toBe('Most SO 201-1- Dubová.bridge.json');
    expect(projectFileName('   ')).toBe('projekt.bridge.json');
  });
});
