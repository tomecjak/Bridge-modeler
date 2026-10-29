import { describe, expect, it } from 'vitest';
import { sk } from './sk.ts';

function leaves(node: unknown, path: string[] = []): [string, unknown][] {
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, [...path, key]));
  }
  return [[path.join('.'), node]];
}

describe('sk texts', () => {
  it('contains only non-empty strings', () => {
    for (const [path, value] of leaves(sk)) {
      expect(typeof value, path).toBe('string');
      expect((value as string).trim(), path).not.toBe('');
    }
  });
});
