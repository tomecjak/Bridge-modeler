import { describe, expect, it } from 'vitest';
import { renameIdentifier } from './rename.ts';

describe('renameIdentifier', () => {
  it('renames whole identifiers and keeps formatting', () => {
    expect(renameIdentifier('h0 + h01 *  max(h0, 2)', 'h0', 'hZ')).toBe('hZ + h01 *  max(hZ, 2)');
  });

  it('does not touch function names or other identifiers', () => {
    expect(renameIdentifier('max(max, 1)', 'max', 'm')).toBe('max(m, 1)');
    expect(renameIdentifier('a+b', 'c', 'd')).toBe('a+b');
  });

  it('leaves expressions with lexical errors unchanged', () => {
    expect(renameIdentifier('h0 $ 1', 'h0', 'x')).toBe('h0 $ 1');
  });
});
